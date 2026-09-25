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

export type AuthenticatedStaffContext = {
  userId: string;
  email: string;
  staffId: string;
  organizationId: string;
  outletId: string;
  roleName: string;
  permissions: string[];
};

export type ClientIdentityOverride = {
  suppliedOrganizationId?: unknown;
  suppliedOutletId?: unknown;
  suppliedRole?: unknown;
  suppliedPermissions?: unknown;
};

export function getBearerToken(request: Request | NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
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
  if (incomingRole && incomingRole !== authContext.roleName) {
    return { allowed: false, reason: "Manipulated role payload detected." };
  }

  const incomingPermissions = Array.isArray(suppliedPermissions)
    ? suppliedPermissions.map((permission) => normalizeString(permission)).filter((permission): permission is string => Boolean(permission))
    : typeof suppliedPermissions === "string"
      ? [suppliedPermissions]
      : [];

  const hasInvalidPermission = incomingPermissions.some(
    (permission) => !authContext.permissions.includes(permission)
  );

  if (hasInvalidPermission) {
    return { allowed: false, reason: "Manipulated permission payload detected." };
  }

  return { allowed: true };
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

  if (!staff.organizationId || !staff.outletId) {
    throw new AuthGuardError("Organization or outlet context is missing.", 403);
  }

  const permissions = new Set<string>();
  for (const assignment of staff.roles) {
    for (const permissionAssignment of assignment.role.permissions) {
      permissions.add(permissionAssignment.permission.name);
    }
  }

  const roleName = staff.roles[0]?.role.name ?? "UNASSIGNED";
  const hasRequiredPermission = requiredPermissions.every((permission) => permissions.has(permission));

  if (!hasRequiredPermission) {
    throw new AuthGuardError("Permission denied.", 403);
  }

  return {
    userId: user.id,
    email: user.email ?? staff.email,
    staffId: staff.id,
    organizationId: staff.organizationId,
    outletId: staff.outletId,
    roleName,
    permissions: [...permissions],
  };
}

export async function requireProtectedRequest(
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
