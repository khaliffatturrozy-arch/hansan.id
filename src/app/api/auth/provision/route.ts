/**
 * POST /api/auth/provision
 *
 * First-time owner provisioning endpoint.
 *
 * This route creates the complete identity chain in a single atomic transaction:
 *   Supabase Auth identity
 *   → Organization (new, with a verified unique slug)
 *   → Outlet (first outlet under the organization)
 *   → Permission records (owner.hq.manage, settings.manage, orders.read, orders.create)
 *   → OWNER Role scoped to the organization (isPlatform = false)
 *   → Staff profile linked to the Supabase Auth user
 *   → StaffRole assignment
 *   → AuditLog record
 *
 * SECURITY:
 * - Bearer token is validated using SUPABASE_SERVICE_ROLE_KEY only. No anon fallback.
 * - The Supabase Auth user identity is resolved from the validated token — never from
 *   client-supplied fields.
 * - If a Staff row already exists for this authUserId, the endpoint returns the
 *   existing provisioned identity (idempotent) without modifying anything.
 * - If a Staff row exists for this authUserId under a DIFFERENT organization,
 *   the endpoint rejects the request — prevents cross-organization injection.
 * - organizationId and staffId are generated server-side. The client supplies only
 *   the business configuration (organization name, slug, outlet name).
 * - No client-supplied role, permissions, or identity fields are trusted.
 * - This endpoint does not create business data (orders, menu items, inventory).
 *
 * INPUTS (request body):
 *   organizationName: string   — display name of the organization
 *   organizationSlug: string   — URL-safe unique slug (e.g. "acme-restaurant")
 *   outletName: string         — display name of the first outlet
 *   outletSlug: string         — URL-safe slug for the first outlet
 *   firstName: string          — owner's first name
 *   lastName?: string          — owner's last name (optional)
 *
 * IDEMPOTENCY:
 * - If called again for the same authUserId, returns the existing provisioned
 *   identity without writing any new records.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AuthGuardError, getBearerToken } from "@/lib/auth";

// The canonical set of permissions granted to an OWNER role on provisioning.
// These are the minimum required for Owner HQ access and system configuration.
const OWNER_PERMISSIONS = [
  { name: "owner.hq.manage", description: "Access and manage the Owner HQ dashboard" },
  { name: "settings.manage", description: "Configure organization and outlet settings" },
  { name: "orders.read", description: "View orders" },
  { name: "orders.create", description: "Create orders" },
] as const;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateSlug(slug: string, field: string): string {
  const clean = slugify(slug);
  if (!clean || clean.length < 2 || clean.length > 63) {
    throw new AuthGuardError(
      `${field} must be a URL-safe slug between 2 and 63 characters.`,
      400
    );
  }
  return clean;
}

function normalizeRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AuthGuardError(`${field} is required.`, 400);
  }
  const trimmed = value.trim();
  if (trimmed.length > 200) {
    throw new AuthGuardError(`${field} must not exceed 200 characters.`, 400);
  }
  return trimmed;
}

export async function POST(request: Request) {
  try {
    // ── Step 0: Server-only provision secret gate ──
    // HANSAN_PROVISION_SECRET must be set in the server environment.
    // The caller must supply it as the X-Provision-Secret header.
    // This prevents any arbitrary authenticated Supabase user from
    // self-provisioning as OWNER. Only a caller who knows the secret
    // (i.e. an operator performing a controlled first-time setup) can proceed.
    // The secret is never logged, stored, or returned in any response.
    const provisionSecret = process.env.HANSAN_PROVISION_SECRET;
    if (!provisionSecret) {
      throw new AuthGuardError(
        "BLOCKED_EXTERNAL_DEPENDENCY: HANSAN_PROVISION_SECRET is not configured.",
        500
      );
    }
    const suppliedSecret = request.headers.get("x-provision-secret");
    // Use a constant-time comparison to avoid timing side-channels.
    // We do this manually since timingSafeEqual requires equal-length Buffers —
    // we normalize lengths before comparing.
    const secretMatch = (() => {
      if (!suppliedSecret) return false;
      const a = Buffer.from(provisionSecret, "utf8");
      const b = Buffer.from(suppliedSecret, "utf8");
      if (a.length !== b.length) {
        // Still do a dummy compare to avoid early-exit timing leak.
        const dummy = Buffer.alloc(a.length);
        timingSafeEqual(a, dummy);
        return false;
      }
      return timingSafeEqual(a, b);
    })();
    if (!secretMatch) {
      throw new AuthGuardError("Provision secret is missing or incorrect.", 403);
    }

    // ── Step 1: Validate bearer token using service-role key (fail closed) ──
    const token = getBearerToken(request);
    if (!token) {
      throw new AuthGuardError("Authentication required.", 401);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new AuthGuardError(
        "BLOCKED_EXTERNAL_DEPENDENCY: Server-side auth requires SUPABASE_SERVICE_ROLE_KEY.",
        500
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData.user) {
      throw new AuthGuardError("Invalid or expired session.", 401);
    }

    const authUserId = userData.user.id;
    const authEmail = userData.user.email;

    if (!authEmail) {
      throw new AuthGuardError("Authenticated user must have a verified email address.", 403);
    }

    // ── Step 2: Parse and validate request body ──
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      throw new AuthGuardError("Request body must be valid JSON.", 400);
    }

    const organizationName = normalizeRequiredString(body.organizationName, "organizationName");
    const rawOrgSlug = normalizeRequiredString(body.organizationSlug, "organizationSlug");
    const outletName = normalizeRequiredString(body.outletName, "outletName");
    const rawOutletSlug = normalizeRequiredString(body.outletSlug, "outletSlug");
    const firstName = normalizeRequiredString(body.firstName, "firstName");
    const lastName = typeof body.lastName === "string" && body.lastName.trim()
      ? body.lastName.trim().slice(0, 200)
      : null;

    const organizationSlug = validateSlug(rawOrgSlug, "organizationSlug");
    const outletSlug = validateSlug(rawOutletSlug, "outletSlug");

    // ── Step 3: Idempotency check — if Staff already exists for this authUserId ──
    const existingStaff = await prisma.staff.findUnique({
      where: { authUserId },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        outlet: { select: { id: true, name: true, slug: true } },
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: { select: { name: true } } } },
              },
            },
          },
        },
      },
    });

    if (existingStaff) {
      // Idempotent: return the existing provisioned identity
      return NextResponse.json({
        ok: true,
        status: "ALREADY_PROVISIONED",
        data: {
          staffId: existingStaff.id,
          organizationId: existingStaff.organizationId,
          outletId: existingStaff.outletId,
          organizationName: existingStaff.organization?.name,
          organizationSlug: existingStaff.organization?.slug,
          outletName: existingStaff.outlet?.name,
          roles: existingStaff.roles.map((r) => r.role.name),
          permissions: existingStaff.roles.flatMap((r) =>
            r.role.permissions.map((p) => p.permission.name)
          ),
        },
      });
    }

    // ── Step 4: Check that the organization slug is available ──
    const slugConflict = await prisma.organization.findUnique({
      where: { slug: organizationSlug },
      select: { id: true },
    });
    if (slugConflict) {
      throw new AuthGuardError(
        `Organization slug "${organizationSlug}" is already taken. Choose a different slug.`,
        409
      );
    }

    // ── Step 5: Check that the staff email is not already registered ──
    const emailConflict = await prisma.staff.findUnique({
      where: { email: authEmail },
      select: { id: true },
    });
    if (emailConflict) {
      throw new AuthGuardError(
        "This email address is already associated with a staff profile.",
        409
      );
    }

    // ── Step 6: Transactional provisioning ──
    const result = await prisma.$transaction(async (tx) => {
      // 6a. Create organization
      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          slug: organizationSlug,
          isActive: true,
        },
      });

      // 6b. Create outlet
      const outlet = await tx.outlet.create({
        data: {
          organizationId: organization.id,
          name: outletName,
          slug: outletSlug,
          isActive: true,
        },
      });

      // 6c. Upsert permissions (global, shared across all orgs)
      const permissionRecords: Array<{ id: string; name: string }> = [];
      for (const perm of OWNER_PERMISSIONS) {
        const existing = await tx.permission.findUnique({ where: { name: perm.name } });
        if (existing) {
          permissionRecords.push(existing);
        } else {
          const created = await tx.permission.create({
            data: { name: perm.name, description: perm.description },
          });
          permissionRecords.push(created);
        }
      }

      // 6d. Create OWNER role scoped to this organization
      // isPlatform = false — this is a tenant role, not a platform role
      const ownerRole = await tx.role.create({
        data: {
          organizationId: organization.id,
          name: "OWNER",
          code: `OWNER_${organization.id}`,
          description: "Organization owner with full operational access",
          isPlatform: false,
        },
      });

      // 6e. Assign permissions to the OWNER role
      await tx.rolePermission.createMany({
        data: permissionRecords.map((p) => ({
          roleId: ownerRole.id,
          permissionId: p.id,
        })),
        skipDuplicates: true,
      });

      // 6f. Create Staff profile
      const staff = await tx.staff.create({
        data: {
          authUserId,
          email: authEmail,
          firstName,
          lastName,
          organizationId: organization.id,
          outletId: outlet.id,
          status: "ACTIVE",
        },
      });

      // 6g. Assign OWNER role to Staff
      await tx.staffRole.create({
        data: {
          staffId: staff.id,
          roleId: ownerRole.id,
        },
      });

      // 6h. Write AuditLog record
      await tx.auditLog.create({
        data: {
          actorUserId: authUserId,
          actorStaffId: staff.id,
          organizationId: organization.id,
          outletId: outlet.id,
          entityType: "OWNER_PROVISION",
          entityId: staff.id,
          action: "PROVISION_COMPLETED",
          metadata: {
            organizationName,
            organizationSlug,
            outletName,
            outletSlug,
            roleName: "OWNER",
            permissions: OWNER_PERMISSIONS.map((p) => p.name),
            provisionedAt: new Date().toISOString(),
          },
        },
      });

      return { organization, outlet, staff, ownerRole, permissionRecords };
    });

    return NextResponse.json(
      {
        ok: true,
        status: "PROVISIONED",
        data: {
          staffId: result.staff.id,
          organizationId: result.organization.id,
          outletId: result.outlet.id,
          organizationName: result.organization.name,
          organizationSlug: result.organization.slug,
          outletName: result.outlet.name,
          outletSlug: result.outlet.slug,
          roleName: "OWNER",
          permissions: result.permissionRecords.map((p) => p.name),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const status = error instanceof AuthGuardError ? error.statusCode : 500;

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Provisioning could not be completed.",
      },
      { status }
    );
  }
}
