import { createClient, type User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { getPermissionDefinition, PERMISSION } from "./permissions";

export class AuthGuardError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = "AuthGuardError";
    this.statusCode = statusCode;
  }
}

export type StaffStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export type AuthenticatedStaffContext = {
  userId: string;
  email: string;
  staffId: string;
  // Human-readable name taken from the Staff record. Optional so synthetic
  // contexts remain constructible; consumers must fall back to `email` (also
  // authenticated) and never to a fabricated name.
  staffName?: string;
  organizationId: string;
  // Nullable on purpose: a staff member may legitimately have no outlet assigned.
  // Callers performing an outlet-bound action must call requireOutlet(context),
  // which rejects with 403. The previous `?? ""` fallback silently produced an
  // empty outlet id instead of failing.
  outletId: string | null;
  roleName: string;
  permissions: string[];
  status: StaffStatus;
};

export type ClientIdentityOverride = {
  suppliedOrganizationId?: unknown;
  suppliedOutletId?: unknown;
  suppliedRole?: unknown;
  suppliedPermissions?: unknown;
};

export const TENANT_ROLE_NAMES = [
  "OWNER",
  "BACK_OFFICE",
  "MANAGER",
  "CASHIER",
  "KITCHEN",
  "BAR",
  "FINANCE",
  "STAFF",
] as const;

export const PLATFORM_ROLE_NAMES = [
  "PLATFORM_ADMIN",
  "PLATFORM_DEVELOPER",
  "PLATFORM_SUPPORT",
] as const;

/**
 * Permissions an already-provisioned identity must hold before
 * POST /api/auth/bootstrap may record owner bootstrap completion.
 * Sourced from the canonical catalog (src/lib/permissions.ts) — never re-declared.
 */
export const OWNER_BOOTSTRAP_REQUIRED_PERMISSIONS = [
  PERMISSION.OWNER_HQ_MANAGE,
  PERMISSION.SETTINGS_MANAGE,
] as const;

/**
 * Reduces the raw Permission names attached to a staff member's roles into the
 * set a session is allowed to hold.
 *
 * Fail-closed by design: a grant whose name is not in the canonical catalog
 * (src/lib/permissions.ts) grants nothing at all. Matching is exact and
 * case-sensitive, so a row that merely mis-spells a canonical name — including
 * one that is only mis-cased — is a denial, not something to repair. Every
 * dropped grant is logged so the offending row can be found and corrected.
 */
export function resolveCanonicalGrantPermissions(
  grantNames: Iterable<unknown>,
  staffId?: string
): string[] {
  const permissions = new Set<string>();

  for (const grantName of grantNames) {
    const definition = getPermissionDefinition(grantName);
    if (definition) {
      permissions.add(definition.name);
      continue;
    }
    console.warn(
      `[auth] Ignored non-canonical permission grant "${String(grantName)}" for staff ${staffId ?? "unknown"}.`
    );
  }

  return [...permissions];
}

export function normalizeString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

export function normalizePermissionList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((permission) => normalizeString(permission))
      .filter((permission): permission is string => Boolean(permission));
  }

  const singlePermission = normalizeString(value);
  return singlePermission ? [singlePermission] : [];
}

/**
 * Extracts a bearer token from the `Authorization` header ONLY.
 *
 * PHASE C CORRECTION
 * The previous implementation also accepted cookies named `sb-access-token`,
 * `supabase-auth-token` or `sb-auth-token`. Those names never matched the cookies
 * written by `@supabase/ssr`, which are named `sb-<project-ref>-auth-token`
 * (chunked with `.0`, `.1`, … suffixes) and are not raw JWTs. That fallback could
 * therefore never authenticate a browser request, and keeping it made the
 * authentication contract look like it supported cookies when it did not.
 *
 * Browser sessions are now resolved from cookies correctly and server-side by
 * `resolveSessionUser()` via the Supabase SSR server client.
 */
export function getBearerToken(request: Request | NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function requireStaff(staff: { status?: string | null } | null | undefined) {
  const status = normalizeString(staff?.status)?.toUpperCase() ?? "INACTIVE";

  if (status !== "ACTIVE") {
    throw new AuthGuardError("Staff profile is inactive or suspended.", 403);
  }

  return staff;
}

export function requireOrganization(context: { organizationId?: unknown } | null | undefined) {
  const organizationId = normalizeString(context?.organizationId);

  if (!organizationId) {
    throw new AuthGuardError("Organization context is required.", 403);
  }

  return organizationId;
}

export function requireOutlet(context: { outletId?: unknown } | null | undefined) {
  const outletId = normalizeString(context?.outletId);

  if (!outletId) {
    throw new AuthGuardError("Outlet context is required.", 403);
  }

  return outletId;
}

export function requireRole(
  context: { roleName?: unknown } | null | undefined,
  expectedRole: string
) {
  const roleName = normalizeString(context?.roleName)?.toUpperCase();
  const normalizedRole = normalizeString(expectedRole)?.toUpperCase();

  if (!roleName || !normalizedRole || roleName !== normalizedRole) {
    throw new AuthGuardError(`Role access denied. Required role: ${expectedRole}.`, 403);
  }

  return roleName;
}

export function requirePermission(
  context: { permissions?: unknown[] | string | null } | null | undefined,
  permission: string
) {
  const normalizedPermission = normalizeString(permission)?.toLowerCase();
  const permissions = normalizePermissionList(context?.permissions ?? []).map((value) => value.toLowerCase());

  if (!normalizedPermission || !permissions.includes(normalizedPermission)) {
    throw new AuthGuardError(`Permission denied. Missing: ${permission}.`, 403);
  }

  return true;
}

export function validateClientIdentity({
  authContext,
  suppliedOrganizationId,
  suppliedOutletId,
  suppliedRole,
  suppliedPermissions,
}: {
  authContext: AuthenticatedStaffContext | null;
} & ClientIdentityOverride): { allowed: boolean; reason?: string } {
  if (!authContext) {
    return { allowed: false, reason: "Authentication required." };
  }

  const incomingOrganizationId = normalizeString(suppliedOrganizationId);
  if (incomingOrganizationId && incomingOrganizationId !== authContext.organizationId) {
    return { allowed: false, reason: "Manipulated organization context detected." };
  }

  const incomingOutletId = normalizeString(suppliedOutletId);
  if (incomingOutletId && incomingOutletId !== authContext.outletId) {
    return { allowed: false, reason: "Manipulated outlet context detected." };
  }

  const incomingRole = normalizeString(suppliedRole);
  if (incomingRole && incomingRole.toUpperCase() !== authContext.roleName.toUpperCase()) {
    return { allowed: false, reason: "Manipulated role payload detected." };
  }

  const incomingPermissions = normalizePermissionList(suppliedPermissions).map((permission) => permission.toLowerCase());
  const allowedPermissions = authContext.permissions.map((permission) => permission.toLowerCase());
  const hasInvalidPermission = incomingPermissions.some(
    (permission) => !allowedPermissions.includes(permission)
  );

  if (hasInvalidPermission) {
    return { allowed: false, reason: "Manipulated permission payload detected." };
  }

  return { allowed: true };
}

export function buildOwnerBootstrapRecord(context: AuthenticatedStaffContext) {
  const normalizedRole = normalizeString(context.roleName)?.toUpperCase();
  const permissions = new Set((context.permissions ?? []).map((permission) => permission.toLowerCase()));
  const eligible = normalizedRole === "OWNER" && OWNER_BOOTSTRAP_REQUIRED_PERMISSIONS.every((permission) => permissions.has(permission));

  if (!eligible) {
    throw new AuthGuardError("Owner bootstrap requires an eligible owner account.", 403);
  }

  return {
    bootstrapStatus: "READY",
    organizationId: context.organizationId,
    outletId: context.outletId,
    roleName: context.roleName,
    requiredPermissions: [...OWNER_BOOTSTRAP_REQUIRED_PERMISSIONS],
    userId: context.userId,
    staffId: context.staffId,
    createdAt: new Date().toISOString(),
  };
}

export function isBootstrapReplay(record: { bootstrapStatus?: string | null } | null | undefined) {
  return Boolean(record && normalizeString(record.bootstrapStatus)?.toUpperCase() === "REPLAYED");
}

/**
 * Deterministic multi-role resolution.
 *
 * Priority order:
 * 1. Platform roles (PLATFORM_ADMIN > PLATFORM_DEVELOPER > PLATFORM_SUPPORT)
 *    — identified by isPlatform=true flag when DB records are provided,
 *    or by name matching PLATFORM_ROLE_NAMES when only names are available.
 * 2. OWNER
 * 3. Other tenant roles, priority-sorted then alphabetically for stability
 * 4. Default "STAFF" when no roles exist
 *
 * This ensures the resolved primary roleName is always the same for a given
 * set of role assignments, regardless of database ordering.
 */
export function resolveCanonicalRoleName(
  roleNames: string[] | null | undefined,
  roleRecords?: Array<{ name: string; isPlatform: boolean }> | null
): string {
  if (!roleNames || roleNames.length === 0) {
    return "STAFF";
  }

  const normalized = roleNames.map((name) => (normalizeString(name)?.toUpperCase() ?? "STAFF"));

  // When database records are provided, use the isPlatform flag for structural separation.
  // Otherwise, fall back to name-based heuristic.
  if (roleRecords && roleRecords.length > 0) {
    const platformRecord = roleRecords.find((r) => r.isPlatform);
    if (platformRecord) {
      const platformName = normalizeString(platformRecord.name)?.toUpperCase();
      // Return the highest-priority platform role
      for (const p of PLATFORM_ROLE_NAMES) {
        if (
          roleRecords.some(
            (r) => r.isPlatform && normalizeString(r.name)?.toUpperCase() === p
          )
        ) {
          return p;
        }
      }
      return platformName ?? "PLATFORM_ADMIN";
    }
  } else {
    // Name-based platform detection (used when no DB records are provided)
    for (const platformRole of PLATFORM_ROLE_NAMES) {
      if (normalized.includes(platformRole)) {
        return platformRole;
      }
    }
  }

  // OWNER is the highest-priority tenant role
  if (normalized.includes("OWNER")) {
    return "OWNER";
  }

  // Sort remaining tenant roles for stability; pick the first
  const tenantPriority: Record<string, number> = {
    BACK_OFFICE: 1,
    MANAGER: 2,
    FINANCE: 3,
    CASHIER: 4,
    KITCHEN: 5,
    BAR: 6,
    STAFF: 7,
  };

  const sorted = [...normalized].sort((a, b) => {
    const pa = tenantPriority[a] ?? 99;
    const pb = tenantPriority[b] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });

  return sorted[0] ?? "STAFF";
}

/**
 * Resolves the authenticated Supabase user from whichever transport is present.
 *
 * Transport 1 — `Authorization: Bearer <jwt>` (API / server-to-server clients).
 *   The JWT is validated with the service-role key. Fails closed: it never falls
 *   back to the anon key, which has no authority to validate tokens server-side.
 *
 * Transport 2 — Supabase SSR cookies (the browser POS).
 *   Resolved server-side by the Supabase SSR server client, which is the only
 *   correct way to read an `@supabase/ssr` session. No client-supplied token is
 *   involved, so the browser never has to hold or forward a credential.
 *
 * Throws AuthGuardError(401) when no valid session exists, and
 * AuthGuardError(500) when the server is not configured (fail closed).
 */
async function resolveAuthenticatedUser(request: Request | NextRequest): Promise<User> {
  const bearerToken = getBearerToken(request);

  if (bearerToken) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // SECURITY: Must fail closed. Never fall back to anon key for privileged server operations.
    // The anon key does not have the authority to validate JWT tokens server-side.
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new AuthGuardError(
        "BLOCKED_EXTERNAL_DEPENDENCY: Server-side auth requires SUPABASE_SERVICE_ROLE_KEY. Anon key fallback is not permitted.",
        500
      );
    }

    const client = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await client.auth.getUser(bearerToken);
    if (error || !data.user) {
      throw new AuthGuardError("Invalid or expired session.", 401);
    }

    return data.user as User;
  }

  const sessionUser = await resolveSessionUser();
  if (!sessionUser) {
    throw new AuthGuardError("Authentication required.", 401);
  }

  return sessionUser;
}

/**
 * Resolves the current user from Supabase SSR cookies (browser sessions).
 * Returns null when there is no valid session; throws on missing configuration.
 */
async function resolveSessionUser(): Promise<User | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new AuthGuardError(
      "BLOCKED_EXTERNAL_DEPENDENCY: Session authentication requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      500
    );
  }

  try {
    // Lazy import keeps `next/headers` out of the module graph for non-Next
    // consumers (the node:test suite imports this module directly).
    const { createServerSessionClient } = await import("./supabase-server");
    const supabase = await createServerSessionClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return null;
    }

    return data.user as User;
  } catch (error) {
    if (error instanceof AuthGuardError) throw error;
    // A missing Next.js request scope (cookies() unavailable) or a malformed
    // cookie payload both mean "no authenticated session", not a server fault.
    return null;
  }
}

export async function resolveAuthenticatedStaffContext(
  request: Request | NextRequest,
  requiredPermissions: string[] = []
): Promise<AuthenticatedStaffContext> {
  const user = await resolveAuthenticatedUser(request);

  const { prisma } = await import("./prisma");
  const staff = await prisma.staff.findFirst({
    where: {
      authUserId: user.id,
    },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!staff) {
    throw new AuthGuardError("Staff profile not found for authenticated user.", 403);
  }

  const staffStatus = normalizeString(staff.status)?.toUpperCase() ?? "INACTIVE";
  if (staffStatus !== "ACTIVE") {
    throw new AuthGuardError("Staff profile is inactive or suspended.", 403);
  }

  if (!staff.organizationId) {
    throw new AuthGuardError("Organization context is missing.", 403);
  }

  // Grants are resolved through the canonical catalog (src/lib/permissions.ts):
  // a Permission row whose name is not a catalog entry cannot widen a session's
  // authority, and a mis-cased row still resolves to its canonical name instead
  // of being silently ignored. Comparison below stays case-insensitive.
  const permissions = new Set<string>(
    resolveCanonicalGrantPermissions(
      staff.roles.flatMap((assignment) =>
        assignment.role.permissions.map((permissionAssignment) => permissionAssignment.permission.name)
      ),
      staff.id
    )
  );

  // Deterministic multi-role resolution: platform roles take precedence, then
  // owner, then other tenant roles sorted by code (alphabetical) for stability.
  // This ensures the resolved roleName is always the same for a given set of roles.
  // isPlatform flag from the database is used when available for structural separation.
  const resolvedRoleName = resolveCanonicalRoleName(
    staff.roles.map((r) => r.role.name),
    staff.roles.map((r) => ({ name: r.role.name, isPlatform: r.role.isPlatform }))
  );

  const normalizedRequiredPermissions = requiredPermissions.map((permission) => permission.toLowerCase());
  const hasRequiredPermission = normalizedRequiredPermissions.every((permission) =>
    [...permissions].some((candidate) => candidate.toLowerCase() === permission)
  );

  if (!hasRequiredPermission) {
    throw new AuthGuardError("Permission denied.", 403);
  }

  return {
    userId: user.id,
    email: user.email ?? staff.email,
    staffId: staff.id,
    staffName: [staff.firstName, staff.lastName].filter(Boolean).join(" ").trim() || staff.email,
    organizationId: staff.organizationId,
    // Reported truthfully. Outlet-bound actions must call requireOutlet(), which
    // rejects with 403 rather than silently operating on an empty outlet id.
    outletId: staff.outletId ?? null,
    roleName: resolvedRoleName,
    permissions: [...permissions],
    status: staffStatus as StaffStatus,
  };
}

export async function requireAuth(
  request: Request | NextRequest,
  requiredPermissions: string[] = [],
  identityOverride: ClientIdentityOverride = {}
) {
  const authContext = await resolveAuthenticatedStaffContext(request, requiredPermissions);
  const validation = validateClientIdentity({
    authContext,
    ...identityOverride,
  });

  if (!validation.allowed) {
    throw new AuthGuardError(validation.reason ?? "Authorization failed.", 403);
  }

  return authContext;
}

export async function requireProtectedRequest(
  request: Request | NextRequest,
  requiredPermissions: string[] = [],
  identityOverride: ClientIdentityOverride = {}
) {
  return requireAuth(request, requiredPermissions, identityOverride);
}

export type PlatformAccessContext = {
  userId: string;
  email: string;
  roleName: string;
  permissions: string[];
};

export function isPlatformRole(roleName: string | null | undefined): boolean {
  const normalizedRole = normalizeString(roleName)?.toUpperCase();
  return Boolean(normalizedRole && PLATFORM_ROLE_NAMES.includes(normalizedRole as (typeof PLATFORM_ROLE_NAMES)[number]));
}

/**
 * isPlatformRoleRecord — DB-backed platform role check.
 * Prefers the structural isPlatform flag from the database over name-based detection.
 * Use this when a Role record from Prisma is available.
 */
export function isPlatformRoleRecord(role: { name: string; isPlatform: boolean }): boolean {
  if (role.isPlatform) return true;
  // Also check name as a secondary guard
  return isPlatformRole(role.name);
}

export function requirePlatformRole(
  context: { roleName?: unknown } | null | undefined,
  expectedRole: string
) {
  const roleName = normalizeString(context?.roleName)?.toUpperCase();
  const normalizedRole = normalizeString(expectedRole)?.toUpperCase();

  if (!roleName || !normalizedRole || !isPlatformRole(roleName) || roleName !== normalizedRole) {
    throw new AuthGuardError(`Platform access denied. Required role: ${expectedRole}.`, 403);
  }

  return roleName;
}

export function requirePlatformPermission(
  context: { permissions?: unknown[] | string | null } | null | undefined,
  permission: string
) {
  const normalizedPermission = normalizeString(permission)?.toLowerCase();
  const permissions = normalizePermissionList(context?.permissions ?? []).map((value) => value.toLowerCase());

  if (!normalizedPermission || !permissions.includes(normalizedPermission)) {
    throw new AuthGuardError(`Platform permission denied. Missing: ${permission}.`, 403);
  }

  return true;
}

export async function requirePlatformAccess(
  request: Request | NextRequest,
  requiredPermissions: string[] = []
): Promise<PlatformAccessContext> {
  const authContext = await resolveAuthenticatedStaffContext(request, requiredPermissions);

  if (!isPlatformRole(authContext.roleName)) {
    throw new AuthGuardError("Platform access requires an explicit platform role.", 403);
  }

  const hasRequiredPermission = requiredPermissions.every((permission) =>
    authContext.permissions.some((candidate) => candidate.toLowerCase() === permission.toLowerCase())
  );

  if (!hasRequiredPermission) {
    throw new AuthGuardError("Platform permission denied.", 403);
  }

  return {
    userId: authContext.userId,
    email: authContext.email,
    roleName: authContext.roleName,
    permissions: authContext.permissions,
  };
}

export function createServerRequestFromHeaders(
  headers?: Headers | Record<string, string | undefined> | undefined
): Request {
  const normalizedHeaders = new Headers();

  if (headers instanceof Headers) {
    headers.forEach((value, key) => normalizedHeaders.set(key, value));
  } else if (headers) {
    Object.entries(headers).forEach(([key, value]) => {
      if (value) {
        normalizedHeaders.set(key, value);
      }
    });
  }

  return new Request("http://localhost", { headers: normalizedHeaders });
}

export async function resolveTenantContextFromServerHeaders(
  headers?: Headers | Record<string, string | undefined> | undefined,
  requiredPermissions: string[] = []
): Promise<AuthenticatedStaffContext> {
  const request = createServerRequestFromHeaders(headers);
  return resolveAuthenticatedStaffContext(request, requiredPermissions);
}

export async function resolvePlatformContextFromServerHeaders(
  headers?: Headers | Record<string, string | undefined> | undefined,
  requiredPermissions: string[] = []
): Promise<PlatformAccessContext> {
  const request = createServerRequestFromHeaders(headers);
  return requirePlatformAccess(request, requiredPermissions);
}

export function redactSensitiveConfig(value: string | undefined | null): string {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "Unavailable";
  }

  if (normalized.length <= 4) {
    return "********";
  }

  return `${"*".repeat(Math.min(12, normalized.length))}`;
}
