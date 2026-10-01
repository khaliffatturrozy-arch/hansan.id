/**
 * HANSAN — post-login destination resolver (PURE).
 *
 * This module contains no database access, no Supabase access, no Next.js
 * imports, and no `@/` path alias, so it can be loaded directly by the
 * node:test suite (which does not resolve the `@/` alias).
 *
 * SECURITY CONTRACT
 * - The input records must already be authenticated server-side: the
 *   DeveloperAccess row (looked up by Supabase authUserId) and the Staff row
 *   (looked up by Supabase authUserId), each with its live status.
 * - This function accepts NO client-supplied fields. There is deliberately no
 *   parameter for a client-provided role, organizationId, permissions, or
 *   staffId, so a caller cannot be influenced by request input even by mistake.
 * - Tenant role names can NEVER produce DEVELOPER, regardless of their value
 *   (even a tenant role literally named "PLATFORM_DEVELOPER" resolves as
 *   tenant staff). Developer access comes exclusively from a live
 *   DeveloperAccess record.
 *
 * Precedence:
 *   ACTIVE DeveloperAccess        → DEVELOPER  (tenant-independent, checked first)
 *   otherwise ACTIVE OWNER Staff  → OWNER
 *   otherwise ACTIVE Staff        → STAFF
 *   otherwise                     → NO_ACCESS
 */

export type LoginDestination = "DEVELOPER" | "OWNER" | "STAFF" | "NO_ACCESS";

/**
 * Minimal server-resolved view of a DeveloperAccess grant.
 * `status` is the raw stored string (convention: ACTIVE | SUSPENDED).
 */
export type DeveloperGrantInput = {
  status?: string | null;
} | null | undefined;

/**
 * Minimal server-resolved view of an authenticated Staff profile.
 * `roleName` is the canonical tenant role already resolved server-side
 * (e.g. by resolveCanonicalRoleName) — never a client-supplied value.
 */
export type StaffIdentityInput = {
  status?: string | null;
  roleName?: string | null;
} | null | undefined;

export type PostLoginInput = {
  developer: DeveloperGrantInput;
  staff: StaffIdentityInput;
};

function normalizeStatus(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : null;
}

function isActiveStatus(status: unknown): boolean {
  return normalizeStatus(status) === "ACTIVE";
}

function isOwnerRole(roleName: unknown): boolean {
  if (typeof roleName !== "string") return false;
  return roleName.trim().toUpperCase() === "OWNER";
}

/**
 * Canonical post-login authorization decision point.
 * Pure: same input always yields the same destination.
 */
export function resolvePostLoginDestination(input: PostLoginInput): LoginDestination {
  const developerActive = input != null && isActiveStatus(input.developer?.status);
  if (developerActive) {
    return "DEVELOPER";
  }

  const staffActive = input != null && isActiveStatus(input.staff?.status);
  if (!staffActive) {
    return "NO_ACCESS";
  }

  if (isOwnerRole(input.staff?.roleName)) {
    return "OWNER";
  }

  return "STAFF";
}

/**
 * Centralized destination → path mapping.
 * DEVELOPER → /developer
 * OWNER     → /owner
 * STAFF     → /
 * NO_ACCESS → /unauthorized
 */
export function destinationToPath(destination: LoginDestination): string {
  switch (destination) {
    case "DEVELOPER":
      return "/developer";
    case "OWNER":
      return "/owner";
    case "STAFF":
      return "/";
    case "NO_ACCESS":
      return "/unauthorized";
    default:
      return "/unauthorized";
  }
}
