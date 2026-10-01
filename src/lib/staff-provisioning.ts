// Relative import on purpose: this module is loaded directly by the node:test
// suite, which does not resolve the `@/` path alias.
import { requirePermission, requireRole, requireStaff, type AuthenticatedStaffContext } from "./auth";
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
