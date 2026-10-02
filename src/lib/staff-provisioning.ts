// Relative import on purpose: this module is loaded directly by the node:test
// suite, which does not resolve the `@/` path alias.
import {
  normalizeString,
  requirePermission,
  requireRole,
  requireStaff,
  type AuthenticatedStaffContext,
} from "./auth";
import { PERMISSION } from "./permissions";

/**
 * HANSAN — staff provisioning rules (PURE).
 *
 * This module contains no database access and no Supabase access, so the
 * authorization and tenant-isolation rules can be tested directly.
 *
 * SECURITY CONTRACT — these body fields are NEVER read and can never influence
 * the result: organizationId, creatorId, actorStaffId, status, permissions.
 * The tenant and the acting staff always come from the authenticated
 * server-side context.
 *
 * PHASE 16 ADDITIONS (still pure — no database, no Supabase access)
 *   - parseStaffUpdateRequest: the PATCH /api/staff allowlist. A caller sends
 *     EITHER a status change OR a role change (status XOR roleId), never both.
 *   - canManageStaff: one gate expression shared by the /owner/staff page and
 *     mirrored exactly by assertCanManageStaff for the API, so the page can
 *     never drift into a second authorization model.
 *   - holdsOwnerRole / decideActiveOwnerRetention / assertActiveOwnerRetention:
 *     the last-active-OWNER lockout invariant. Used by BOTH the role-change
 *     flow (staff-role-change.ts) and the deactivation flow (staff-service.ts).
 */

// Existing, canonical grant for organization configuration — see the catalog.
export const STAFF_MANAGEMENT_PERMISSION = PERMISSION.SETTINGS_MANAGE;
export const STAFF_MANAGEMENT_ROLE = "OWNER";

export class StaffProvisioningError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "StaffProvisioningError";
    this.statusCode = statusCode;
  }
}

export type CreateStaffRequest = {
  firstName: string;
  lastName: string | null;
  email: string;
  roleId: string;
  outletId: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requiredString(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new StaffProvisioningError(`${field} wajib diisi.`, 400);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new StaffProvisioningError(`${field} tidak boleh melebihi ${maxLength} karakter.`, 400);
  }
  return trimmed;
}

/**
 * Parses the OWNER-supplied fields only.
 * Any identity or authorization field present in the body is ignored outright.
 */
export function parseCreateStaffRequest(body: unknown): CreateStaffRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new StaffProvisioningError("Payload staff tidak valid.", 400);
  }

  const record = body as Record<string, unknown>;

  const firstName = requiredString(record.firstName, "firstName", 120);
  const lastName =
    typeof record.lastName === "string" && record.lastName.trim()
      ? record.lastName.trim().slice(0, 120)
      : null;

  // Normalised to lowercase: Supabase stores emails case-insensitively, and
  // Staff.email is globally unique, so case must not create phantom duplicates.
  const email = requiredString(record.email, "email", 320).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new StaffProvisioningError("Format email tidak valid.", 400);
  }

  const roleId = requiredString(record.roleId, "roleId", 120);
  const outletId = requiredString(record.outletId, "outletId", 120);

  return { firstName, lastName, email, roleId, outletId };
}

export type OwnedRecord = {
  id: string;
  organizationId?: string | null;
  name?: string | null;
  isPlatform?: boolean | null;
};

/**
 * A role may only be assigned if it belongs to the caller's organization.
 * Platform roles (organizationId IS NULL, Phase B model A) are rejected here:
 * a tenant OWNER must not be able to mint platform authority.
 *
 * Returns the validated record so the call site is narrowed to non-null.
 */
export function requireRoleInOrganization<T extends OwnedRecord>(
  role: T | null,
  organizationId: string
): T {
  if (!role) {
    throw new StaffProvisioningError("Role tidak ditemukan.", 404);
  }
  if (role.isPlatform === true) {
    throw new StaffProvisioningError("Platform role tidak dapat diberikan oleh tenant.", 403);
  }
  if (role.organizationId !== organizationId) {
    throw new StaffProvisioningError("Role tidak tersedia pada organisasi ini.", 403);
  }
  return role;
}

/** An outlet may only be assigned if it belongs to the caller's organization. */
export function requireOutletInOrganization<T extends OwnedRecord>(
  outlet: T | null,
  organizationId: string
): T {
  if (!outlet) {
    throw new StaffProvisioningError("Outlet tidak ditemukan.", 404);
  }
  if (outlet.organizationId !== organizationId) {
    throw new StaffProvisioningError("Outlet tidak tersedia pada organisasi ini.", 403);
  }
  return outlet;
}

/**
 * Staff management requires:
 *   1. an ACTIVE staff profile (kills access immediately on deactivation)
 *   2. the OWNER role
 *   3. the existing `settings.manage` permission
 *
 * Reuses the guards already in src/lib/auth.ts. No new permission is invented:
 * `settings.manage` already exists (created by POST /api/auth/provision) and is
 * the closest existing grant for organization configuration.
 */
export function assertCanManageStaff(context: AuthenticatedStaffContext): void {
  requireStaff(context);
  requireRole(context, STAFF_MANAGEMENT_ROLE);
  requirePermission(context, STAFF_MANAGEMENT_PERMISSION);
}

/**
 * The SAME gate as {@link assertCanManageStaff}, expressed as a boolean.
 *
 * The /owner/staff page performs an early access gate for UX. It must not
 * re-implement the authorization rule, so it calls this function with the
 * server-loaded role names and permission names; the API stays authoritative
 * through `assertCanManageStaff`. staff-provisioning.test.ts proves the two
 * agree for every combination of status / role / permission.
 *
 * Semantics are identical to the canonical guards in src/lib/auth.ts:
 *   - ACTIVE status (blank or missing counts as INACTIVE, exactly like
 *     requireStaff)
 *   - one role whose uppercased name equals STAFF_MANAGEMENT_ROLE
 *   - one permission whose lowercased name equals STAFF_MANAGEMENT_PERMISSION
 */
export function canManageStaff(input: {
  status: unknown;
  roleNames: readonly unknown[];
  permissions: readonly unknown[];
}): boolean {
  const status = normalizeString(input.status)?.toUpperCase();
  if (status !== "ACTIVE") {
    return false;
  }

  const hasRole = (input.roleNames ?? []).some(
    (roleName) => normalizeString(roleName)?.toUpperCase() === STAFF_MANAGEMENT_ROLE
  );
  if (!hasRole) {
    return false;
  }

  return (input.permissions ?? []).some(
    (permission) => normalizeString(permission)?.toLowerCase() === STAFF_MANAGEMENT_PERMISSION
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/staff REQUEST (status XOR role change)
// ─────────────────────────────────────────────────────────────────────────────

export type StaffUpdateRequest =
  | { kind: "status"; staffId: string; status: string }
  | { kind: "role"; staffId: string; roleId: string };

/**
 * Parses the OWNER-supplied fields of a PATCH body.
 *
 * A request changes exactly one thing: either the staff status or the staff
 * role. Supplying both is a 400, never an implicit precedence order. Any
 * identity or authorization field present in the body is ignored outright —
 * the parsed result cannot carry `organizationId`, `permissions`, actor fields
 * or platform flags, because it is a closed union of the two shapes below.
 */
export function parseStaffUpdateRequest(body: unknown): StaffUpdateRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new StaffProvisioningError("Payload staff tidak valid.", 400);
  }

  const record = body as Record<string, unknown>;
  const staffId = requiredString(record.staffId, "staffId", 120);

  const hasStatus = typeof record.status === "string" && record.status.trim().length > 0;
  const hasRoleId = typeof record.roleId === "string" && record.roleId.trim().length > 0;

  if (hasStatus && hasRoleId) {
    throw new StaffProvisioningError(
      "Kirim salah satu: status atau roleId, tidak keduanya.",
      400
    );
  }

  if (hasRoleId) {
    return { kind: "role", staffId, roleId: requiredString(record.roleId, "roleId", 120) };
  }

  if (hasStatus) {
    // Raw value: setStaffStatus owns status validation and keeps its message.
    return { kind: "status", staffId, status: record.status as string };
  }

  throw new StaffProvisioningError("staffId dan status atau roleId wajib diisi.", 400);
}

// ─────────────────────────────────────────────────────────────────────────────
// LAST ACTIVE OWNER INVARIANT (administrative lockout protection)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether a set of role names includes the OWNER role. Comparison is the same
 * case-insensitive normalization the canonical guards use, so no grant or
 * assignment can dodge the invariant through casing.
 */
export function holdsOwnerRole(roleNames: Iterable<unknown>): boolean {
  for (const roleName of roleNames) {
    if (normalizeString(roleName)?.toUpperCase() === STAFF_MANAGEMENT_ROLE) {
      return true;
    }
  }
  return false;
}

export type OwnerRetentionVerdict =
  | { ok: true }
  | { ok: false; status: 409; message: string };

/**
 * Decides whether an operation may proceed without leaving the organization
 * with ZERO ACTIVE OWNER staff.
 *
 * Inputs are facts the caller loads inside the same transaction that performs
 * the mutation:
 *   - targetIsActiveOwner:    target staff is ACTIVE and currently holds OWNER
 *   - targetRetainsActiveOwner: after the operation the target is still a
 *     staff who is ACTIVE and holds OWNER (role change to OWNER, or a status
 *     change that keeps them ACTIVE)
 *   - otherActiveOwnerCount:  OTHER staff in the SAME organization who are
 *     ACTIVE and hold OWNER right now
 *
 * Rejection is 409 — the request is understood and the caller is authorized;
 * the organization's own state forbids it. No new permission is invented.
 */
export function decideActiveOwnerRetention(params: {
  targetIsActiveOwner: boolean;
  targetRetainsActiveOwner: boolean;
  otherActiveOwnerCount: number;
}): OwnerRetentionVerdict {
  if (!params.targetIsActiveOwner || params.targetRetainsActiveOwner) {
    return { ok: true };
  }
  if (params.otherActiveOwnerCount > 0) {
    return { ok: true };
  }
  return {
    ok: false,
    status: 409,
    message:
      "Operasi ini akan menghilangkan OWNER aktif terakhir pada organisasi. Tambahkan atau aktifkan OWNER lain terlebih dahulu.",
  };
}

/** Narrowing form of {@link decideActiveOwnerRetention}; throws on rejection. */
export function assertActiveOwnerRetention(params: {
  targetIsActiveOwner: boolean;
  targetRetainsActiveOwner: boolean;
  otherActiveOwnerCount: number;
}): void {
  const verdict = decideActiveOwnerRetention(params);
  if (!verdict.ok) {
    throw new StaffProvisioningError(verdict.message, verdict.status);
  }
}
