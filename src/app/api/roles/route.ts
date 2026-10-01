import { NextResponse } from "next/server";
import { requireProtectedRequest } from "@/lib/auth";
import { toSafeApiError } from "@/lib/api-errors";
import { PERMISSION } from "@/lib/permissions";
import {
  extractRoleOrganizationClaim,
  parseCreateRoleRequest,
  RoleManagementError,
} from "@/lib/role-management";
import { createOrganizationRole, listOrganizationRoles } from "@/lib/role-service";

/**
 * /api/roles — tenant Role Management (Phase 15).
 *
 * GET    list the caller's own tenant roles
 * POST   create a tenant role in the caller's own organization
 *
 * Sibling surface for single-role operations: /api/roles/[id] (PATCH, DELETE).
 *
 * AUTHORIZATION (server-side, never page-hiding)
 *  1. A valid session is resolved by the canonical auth layer (bearer token or
 *     Supabase SSR cookie) — 401 when absent.
 *  2. The staff record must be ACTIVE and carry an organization — 403 otherwise.
 *  3. The canonical catalog permissions decide the operation: `roles.read` for
 *     GET, `roles.create` for POST. Names come from PERMISSION (src/lib/
 *     permissions.ts); no alternative vocabulary exists on this route.
 *
 * TENANT + PLATFORM BOUNDARY
 *  organizationId and isPlatform are never authority from the client. The body's
 *  `organizationId` (if any) is read ONLY to be compared with the session, and a
 *  contradiction is denied with 403 before the payload is interpreted; the parser
 *  then rejects the key outright. A created role is always the caller's own
 *  organization with `isPlatform: false`. DeveloperAccess is never consulted: a
 *  platform identity without a tenant Staff record cannot reach this route at all.
 */

export const dynamic = "force-dynamic";

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new RoleManagementError("Payload role tidak valid.", 400);
  }
}

export async function GET(request: Request) {
  try {
    const context = await requireProtectedRequest(request, [PERMISSION.ROLES_READ]);

    const roles = await listOrganizationRoles(context);

    return NextResponse.json({ ok: true, data: { roles } });
  } catch (error) {
    const { status, body } = toSafeApiError(error, "Gagal memuat daftar role.");
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await readJson(request);

    // Authenticate + authorize FIRST. A supplied organizationId that contradicts
    // the session is denied here, before the body is interpreted as a role.
    const context = await requireProtectedRequest(request, [PERMISSION.ROLES_CREATE], {
      suppliedOrganizationId: extractRoleOrganizationClaim(rawBody),
    });

    // Allowlist parse: name + description only. Authority and generated fields
    // (organizationId, isPlatform, code, permissions, staff ids) are rejected.
    const input = parseCreateRoleRequest(rawBody);

    const role = await createOrganizationRole(context, input);

    return NextResponse.json({ ok: true, data: { role } }, { status: 201 });
  } catch (error) {
    const { status, body } = toSafeApiError(error, "Gagal membuat role.");
    return NextResponse.json(body, { status });
  }
}

export async function PUT() {
  return NextResponse.json(
    {
      ok: false,
      error: "Method not allowed. Use PATCH /api/roles/[id].",
      code: "INVALID_REQUEST",
    },
    { status: 405 }
  );
}
