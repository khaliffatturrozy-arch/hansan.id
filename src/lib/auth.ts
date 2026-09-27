import { createClient, type User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

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
  organizationId: string;
  outletId: string;
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

export const OWNER_BOOTSTRAP_REQUIRED_PERMISSIONS = [
  "owner.hq.manage",
  "settings.manage",
] as const;

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

export function getBearerToken(request: Request | NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) {
      return match[1].trim();
    }
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = cookieHeader.split(";").map((entry) => entry.trim());
  for (const cookie of cookies) {
    const [name, ...values] = cookie.split("=");
    const cookieName = name?.trim();
    const cookieValue = values.join("=").trim();
    if (
      cookieName &&
      ["sb-access-token", "supabase-auth-token", "sb-auth-token"].includes(cookieName)
    ) {
      return cookieValue || null;
    }
  }

  return null;
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

export async function resolveAuthenticatedStaffContext(
  request: Request | NextRequest,
  requiredPermissions: string[] = []
): Promise<AuthenticatedStaffContext> {
  const token = getBearerToken(request);
  if (!token) {
    throw new AuthGuardError("Authentication required.", 401);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new AuthGuardError(
      "BLOCKED_EXTERNAL_DEPENDENCY: Supabase environment is not configured.",
      500
    );
  }

  const client = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    throw new AuthGuardError("Invalid or expired session.", 401);
  }

  const user = data.user as User;
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

  const permissions = new Set<string>();
  for (const assignment of staff.roles) {
    for (const permissionAssignment of assignment.role.permissions) {
      permissions.add(permissionAssignment.permission.name);
    }
  }

  const roleName = staff.roles[0]?.role.name ?? "STAFF";
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
    organizationId: staff.organizationId,
    outletId: staff.outletId ?? "",
    roleName,
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
