/**
 * POST /api/auth/destination
 *
 * Canonical server-side post-login destination resolver.
 *
 * - Resolves the authenticated Supabase session server-side via the existing
 *   SSR session architecture (cookies, anon key — the user's own JWT).
 * - Derives authUserId ONLY from the authenticated session.
 * - The request body is COMPLETELY IGNORED: no role, organizationId, outletId,
 *   staffId, permissions, or destination field is read. There is nothing to spoof.
 * - Resolution order: DeveloperAccess (tenant-independent, checked FIRST) →
 *   tenant Staff (ACTIVE + canonical role) → NO_ACCESS.
 * - Developer access is inferred ONLY from a live DeveloperAccess row. StaffRole
 *   and Role (including PLATFORM_* names) are never consulted for Developer.
 *
 * Returns: { ok: true, destination, path }
 *   ACTIVE DeveloperAccess → DEVELOPER → /developer
 *   ACTIVE OWNER Staff     → OWNER     → /owner
 *   ACTIVE other Staff     → STAFF     → /
 *   otherwise              → NO_ACCESS → /unauthorized
 *
 * Unauthenticated → 401 (never a destination; the caller must send to /login).
 */

// This route reads the session cookies, so it can never be static.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerSessionClient } from "@/lib/supabase-server";
import { toSafeApiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { resolveCanonicalRoleName } from "@/lib/auth";
import {
  destinationToPath,
  resolvePostLoginDestination,
} from "@/lib/login-destination";
import { resolveDeveloperAccess } from "@/lib/developer-access";

export async function POST() {
  try {
    const supabase = await createServerSessionClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated.", code: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }

    const authUserId = user.id;

    // 1. Developer leg — tenant-independent, checked FIRST. Only an ACTIVE
    //    DeveloperAccess row grants DEVELOPER. resolveDeveloperAccess returns
    //    null for unknown/inactive/suspended (never throws for no-access).
    const developerGrant = await resolveDeveloperAccess(authUserId);

    // 2. Tenant leg — ACTIVE Staff + server-resolved canonical role.
    //    StaffRole/Role rows are used ONLY to derive the tenant role name;
    //    they can never produce DEVELOPER (enforced by the pure resolver).
    let staffLeg: { status: string; roleName: string } | null = null;
    const staff = await prisma.staff.findFirst({
      where: { authUserId },
      select: {
        status: true,
        roles: {
          select: {
            role: { select: { name: true, isPlatform: true } },
          },
        },
      },
    });

    if (staff && staff.status === "ACTIVE") {
      const roleNames = staff.roles.map((entry) => entry.role.name);
      const roleRecords = staff.roles.map((entry) => ({
        name: entry.role.name,
        isPlatform: entry.role.isPlatform,
      }));
      staffLeg = {
        status: staff.status,
        roleName: resolveCanonicalRoleName(roleNames, roleRecords),
      };
    }

    const destination = resolvePostLoginDestination({
      developer: developerGrant ? { status: developerGrant.status } : null,
      staff: staffLeg,
    });

    return NextResponse.json({
      ok: true,
      destination,
      path: destinationToPath(destination),
    });
  } catch (error) {
    const { status, body } = toSafeApiError(error, "Could not resolve login destination.");
    return NextResponse.json(body, { status });
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Method not allowed. Use POST.", code: "INVALID_REQUEST" },
    { status: 405 }
  );
}
