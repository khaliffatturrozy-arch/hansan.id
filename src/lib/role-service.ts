import { prisma } from "@/lib/prisma";
import type { AuthenticatedStaffContext } from "@/lib/auth";
import {
  createTenantRole,
  deleteTenantRole,
  ROLE_VIEW_SELECT,
  updateTenantRole,
  toRoleView,
  type CreateRoleRequest,
  type RoleView,
  type UpdateRoleRequest,
} from "@/lib/role-management";

/**
 * HANSAN — tenant role management (DATA LAYER).
 *
 * The only module in this phase that touches Prisma for role writes. Every
 * function here takes the authenticated context, never an organization id from a
 * caller, and delegates every decision to ./role-management so the rules stay
 * testable without a database.
 *
 * TENANT + PLATFORM BOUNDARY
 *  - Reads are hard-scoped to `{ organizationId, isPlatform: false }`, so another
 *    tenant's roles and platform roles can never appear in a tenant response. The
 *    isPlatform clause is redundant with Role_platform_org_check for rows that
 *    already carry this organizationId; it stays as an explicit statement of
 *    intent and a defence against a row that violates the constraint.
 *  - Writes go through the tx-scoped services, which derive organizationId from
 *    the context and pin `isPlatform: false` in both the data and the WHERE
 *    clause. Role creation, tenant conversion and platform-role mutation are
 *    therefore not expressible through this layer.
 *  - State change and AuditLog row are written in ONE transaction, so a role
 *    never changes without an audit trail, and an audit trail never describes a
 *    change that did not happen.
 */

/** Tenant-scoped role listing. Never returns another organization's roles. */
export async function listOrganizationRoles(
  context: AuthenticatedStaffContext
): Promise<RoleView[]> {
  const roles = await prisma.role.findMany({
    where: { organizationId: context.organizationId, isPlatform: false },
    orderBy: { name: "asc" },
    select: ROLE_VIEW_SELECT,
  });

  return roles.map(toRoleView);
}

export async function createOrganizationRole(
  context: AuthenticatedStaffContext,
  request: CreateRoleRequest
): Promise<RoleView> {
  return prisma.$transaction((tx) => createTenantRole({ tx, context, request }));
}

export async function updateOrganizationRole(
  context: AuthenticatedStaffContext,
  roleId: string,
  request: UpdateRoleRequest
): Promise<RoleView> {
  return prisma.$transaction((tx) => updateTenantRole({ tx, context, roleId, request }));
}

export async function deleteOrganizationRole(
  context: AuthenticatedStaffContext,
  roleId: string
): Promise<{ id: string; name: string; code: string }> {
  return prisma.$transaction((tx) => deleteTenantRole({ tx, context, roleId }));
}
