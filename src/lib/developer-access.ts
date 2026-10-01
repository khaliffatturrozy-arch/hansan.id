/**
 * HANSAN — Developer access service (FOUNDATION).
 *
 * Tenant-independent platform authorization boundary backed by the
 * `DeveloperAccess` table. This module is the server-side counterpart to the
 * pure `resolvePostLoginDestination` decider in `./login-destination`.
 *
 * SECURITY CONTRACT
 * - Identity key is ALWAYS the Supabase `authUserId`. Email is display-only.
 * - Developer access NEVER consults Staff, StaffRole, Role, Organization, or
 *   Outlet. A tenant OWNER cannot escalate through this module: there is no
 *   writer here at all (no create/update/delete), only reads.
 * - Fail closed: missing/empty authUserId, missing row, or non-ACTIVE status
 *   all deny access. Inactive/suspended grants throw; they never pass through.
 * - `lastLoginAt` is NOT updated here: there is no authenticated call site in
 *   this phase, and a read-path write would couple auditing to authorization.
 *   A dedicated touch point belongs to the login-gateway phase.
 * - No `@/` alias: relative imports only, so the module stays loadable by the
 *   node:test runner.
 */

export class DeveloperAccessError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = "DeveloperAccessError";
    this.statusCode = statusCode;
  }
}

export type DeveloperAccessStatus = "ACTIVE" | "SUSPENDED";

export type DeveloperAccessRecord = {
  id: string;
  authUserId: string;
  email: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
};

/** Email is stored normalized lowercase (display only, never the identity key). */
export function normalizeDeveloperEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Pure status gate shared by resolve/require paths and future call sites. */
export function isActiveDeveloperRecord(
  record: { status?: string | null } | null | undefined
): boolean {
  const status =
    typeof record?.status === "string" ? record.status.trim().toUpperCase() : "";
  return status === "ACTIVE";
}

/**
 * Resolves the DeveloperAccess grant for a Supabase auth user id.
 * Returns null when there is no grant OR the grant is not ACTIVE.
 * Never throws for "no access" — use requireDeveloperAccess when denial
 * must be an explicit error. Never consults any tenant table.
 */
export async function resolveDeveloperAccess(
  authUserId: string
): Promise<DeveloperAccessRecord | null> {
  if (!authUserId || typeof authUserId !== "string" || !authUserId.trim()) {
    return null;
  }

  // Lazy import keeps server-only modules (Prisma client, next/headers graph)
  // out of the module scope for non-Next consumers such as the node:test suite.
  const { prisma } = await import("./prisma");
  const record = await prisma.developerAccess.findUnique({
    where: { authUserId: authUserId.trim() },
  });

  if (!record || !isActiveDeveloperRecord(record)) {
    return null;
  }

  return record;
}

/**
 * Requires an ACTIVE DeveloperAccess grant for a Supabase auth user id.
 * Throws DeveloperAccessError(403) for unknown, missing, inactive, or
 * suspended identities. Fail-closed by construction.
 */
export async function requireDeveloperAccess(
  authUserId: string
): Promise<DeveloperAccessRecord> {
  const record = await resolveDeveloperAccess(authUserId);

  if (!record) {
    throw new DeveloperAccessError("Developer access denied.", 403);
  }

  return record;
}
