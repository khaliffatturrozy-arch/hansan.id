import { NextResponse } from "next/server";
import { requireProtectedRequest } from "@/lib/auth";
import { toSafeApiError } from "@/lib/api-errors";
import { PERMISSION } from "@/lib/permissions";
import {
  extractRoleOrganizationClaim,
  parseUpdateRoleRequest,
  RoleManagementError,
} from "@/lib/role-management";
import { deleteOrganizationRole, updateOrganizationRole } from "@/lib/role-service";

/**
 * /api/roles/[id] — tenant Role Management, single role (Phase 15).
 *
 * PATCH  rename / re-describe one of the caller's own tenant roles
 * DELETE delete one unreferenced tenant role
 *
 * AUTHORIZATION: session → ACTIVE staff → organization → `roles.update` /
 * `roles.delete` (canonical catalog names), all resolved server-side by the
 * canonical auth layer before the body or the id is interpreted.
 *
 * TARGET RULES (decided in src/lib/role-management.ts)
 *  - The id is loaded and then PROVEN to belong to the caller's organization. An
 *    unknown id and another tenant's id give the identical 404, so this route is
 *    not a cross-tenant existence oracle.
 *  - A platform role (isPlatform = true, organizationId NULL) answers 403 and can
 *    never be edited, converted, or deleted from a tenant.
 *  - organizationId, isPlatform and code are immutable: they are not accepted in
 *    the body and are never written, so a tenant role cannot be converted into a
 *    platform role and the OWNER code convention cannot drift.
 *  - The organization's OWNER role is protected: 409 on both verbs.
 *  - DELETE refuses while StaffRole assignments or RolePermission grants still
 *    reference the role. Nothing here cascades authorization away from staff.
 */

export const dynamic = "force-dynamic";

const MAX_ROLE_ID_LENGTH = 120;

function requireRoleId(rawId: string | undefined): string {
  const roleId = typeof rawId === "string" ? rawId.trim() : "";
  if (!roleId || roleId.length > MAX_ROLE_ID_LENGTH) {
    throw new RoleManagementError("ID role tidak valid.", 400);
  }
  return roleId;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new RoleManagementError("Payload role tidak valid.", 400);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const rawBody = await readJson(request);

    const context = await requireProtectedRequest(request, [PERMISSION.ROLES_UPDATE], {
      suppliedOrganizationId: extractRoleOrganizationClaim(rawBody),
    });
    const roleId = requireRoleId(params?.id);
    const input = parseUpdateRoleRequest(rawBody);

    const role = await updateOrganizationRole(context, roleId, input);

    return NextResponse.json({ ok: true, data: { role } });
  } catch (error) {
    const { status, body } = toSafeApiError(error, "Gagal memperbarui role.");
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = await requireProtectedRequest(request, [PERMISSION.ROLES_DELETE]);
    const roleId = requireRoleId(params?.id);

    const deleted = await deleteOrganizationRole(context, roleId);

    return NextResponse.json({ ok: true, data: { deleted: true, role: deleted } });
  } catch (error) {
    const { status, body } = toSafeApiError(error, "Gagal menghapus role.");
    return NextResponse.json(body, { status });
  }
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "Method not allowed. Use GET /api/roles.",
      code: "INVALID_REQUEST",
    },
    { status: 405 }
  );
}

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Method not allowed. Use POST /api/roles.",
      code: "INVALID_REQUEST",
    },
    { status: 405 }
  );
}
