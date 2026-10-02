// Relative imports on purpose: this module is loaded directly by the node:test
// suite, which does not resolve the `@/` path alias.
import type { AuthenticatedStaffContext } from "./auth";
import {
  assertActiveOwnerRetention,
  assertCanManageStaff,
  holdsOwnerRole,
  requireRoleInOrganization,
  StaffProvisioningError,
  STAFF_MANAGEMENT_ROLE,
} from "./staff-provisioning";

/**
 * HANSAN — staff role change (Phase 16, R2).
 *
 * Backs PATCH /api/staff when the caller sends `{ staffId, roleId }`. Same shape
 * the role-management module proved: the decision rules stay pure (and live in
 * staff-provisioning.ts), and the transaction-scoped service below receives its
 * transaction client as a parameter, so the whole flow (guard → tenant checks →
 * invariant → replace → audit) is unit-testable offline against a fake tx.
 *
 * SECURITY CONTRACT
 * - Actor identity, actor organization and the target organization all come
 *   from the authenticated server-side context. No client-supplied
 *   organizationId, permissions, actor identity or platform flag is read,
 *   accepted, or able to influence any decision here.
 * - The target staff row is loaded with `where: { id, organizationId }` — a
 *   staff id from another tenant is "not found" (404), identical to an unknown
 *   id, so this service is not a cross-tenant existence oracle.
 * - The target role must exist, must NOT be a platform role (isPlatform=true is
 *   refused with 403), and must belong to the actor's organization
 *   (requireRoleInOrganization — the same guard POST /api/staff uses).
 * - The LAST ACTIVE OWNER invariant runs before anything is written: an
 *   operation that would leave the organization with zero ACTIVE OWNER staff is
 *   refused with 409, and no partial mutation happens (the throw aborts the
 *   caller's transaction).
 * - Replacement is atomic: delete the staff's current StaffRole rows, insert the
 *   new one, then write the audit row — all inside the caller's transaction, so
 *   a staff member is never left without a role and the audit can never exist
 *   without the mutation it describes.
 * - A no-op (already holding exactly this role) writes nothing and emits no
 *   audit row: an audit trail records changes, not restatements.
 */

export const STAFF_ROLE_CHANGED_ACTION = "STAFF_ROLE_CHANGED";
export const STAFF_AUDIT_ENTITY_TYPE = "STAFF";

/**
 * Structural JSON vocabulary for the AuditLog.metadata column. Factual
 * transition data only — role ids and names, no credentials, no tokens.
 */
export type StaffRoleChangeAuditMetadata = {
  targetStaffId: string;
  fromRoleId: string | null;
  fromRoleName: string | null;
  toRoleId: string;
  toRoleName: string;
};

export type StaffRoleChangeAuditRecord = {
  actorStaffId: string;
  actorUserId: string;
  organizationId: string;
  outletId: string | null;
  entityType: string;
  entityId: string;
  action: typeof STAFF_ROLE_CHANGED_ACTION;
  metadata: StaffRoleChangeAuditMetadata;
};

/**
 * Builds the audit row. Actor and organization fields come only from the
 * authenticated context at the call site; `entityId` is the target staff, the
 * row the change actually happened to.
 */
export function buildStaffRoleChangeAudit(params: {
  actorStaffId: string;
  actorUserId: string;
  organizationId: string;
  outletId: string | null;
  targetStaffId: string;
  fromRoleId: string | null;
  fromRoleName: string | null;
  toRoleId: string;
  toRoleName: string;
}): StaffRoleChangeAuditRecord {
  return {
    actorStaffId: params.actorStaffId,
    actorUserId: params.actorUserId,
    organizationId: params.organizationId,
    outletId: params.outletId,
    entityType: STAFF_AUDIT_ENTITY_TYPE,
    entityId: params.targetStaffId,
    action: STAFF_ROLE_CHANGED_ACTION,
    metadata: {
      targetStaffId: params.targetStaffId,
      fromRoleId: params.fromRoleId,
      fromRoleName: params.fromRoleName,
      toRoleId: params.toRoleId,
      toRoleName: params.toRoleName,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TARGET SHAPES (only the columns a guard or the audit needs)
// ─────────────────────────────────────────────────────────────────────────────

/** Columns the role-change service is allowed to see about the target staff. */
export const STAFF_ROLE_TARGET_SELECT = {
  id: true,
  status: true,
  outletId: true,
  roles: { select: { role: { select: { id: true, name: true } } } },
} as const;

export type StaffRoleTarget = {
  id: string;
  status: string;
  outletId: string | null;
  roles: Array<{ role: { id: string; name: string } }>;
};

/** Columns every role guard needs; mirrors the select POST /api/staff uses. */
export const STAFF_ROLE_OPTION_SELECT = {
  id: true,
  name: true,
  organizationId: true,
  isPlatform: true,
} as const;

export type StaffRoleOption = {
  id: string;
  name: string;
  organizationId: string | null;
  isPlatform: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION-SCOPED SERVICE (caller owns prisma.$transaction; tx injected so
// the whole flow is unit-testable with a fake client and never imports Prisma)
// ─────────────────────────────────────────────────────────────────────────────

export type StaffRoleChangeTxClient = {
  staff: {
    findFirst(args: {
      where: { id: string; organizationId: string };
      select: typeof STAFF_ROLE_TARGET_SELECT;
    }): Promise<StaffRoleTarget | null>;
    count(args: {
      where: {
        organizationId: string;
        status: string;
        id: { not: string };
        roles: { some: { role: { name: string } } };
      };
    }): Promise<number>;
  };
  role: {
    findUnique(args: {
      where: { id: string };
      select: typeof STAFF_ROLE_OPTION_SELECT;
    }): Promise<StaffRoleOption | null>;
  };
  staffRole: {
    deleteMany(args: { where: { staffId: string } }): Promise<{ count: number }>;
    createMany(args: {
      data: Array<{ staffId: string; roleId: string }>;
      skipDuplicates: true;
    }): Promise<unknown>;
  };
  auditLog: {
    create(args: { data: StaffRoleChangeAuditRecord }): Promise<unknown>;
  };
};

export type StaffRoleChangeResult = {
  staffId: string;
  roleId: string;
  roleName: string;
  previousRoleId: string | null;
  previousRoleNames: readonly string[];
  /** True when the staff already held exactly this role: no write, no audit. */
  noop: boolean;
};

/**
 * Replaces the staff member's role inside the caller's transaction.
 *
 * Order of operations (each step is a distinct, deterministic outcome):
 *   1. actor gate            — assertCanManageStaff (ACTIVE + OWNER + settings.manage)
 *   2. target staff          — tenant-scoped load; unknown OR foreign → 404
 *   3. target role           — canonical guards; unknown → 404, platform → 403,
 *                              foreign tenant → 403
 *   4. no-op                 — already holds exactly this role → return, no writes
 *   5. last active OWNER     — would leave zero ACTIVE OWNERs → 409 (aborts tx)
 *   6. atomic replace        — deleteMany(current) + createMany(new)
 *   7. audit                 — STAFF_ROLE_CHANGED in the SAME transaction
 */
export async function changeStaffRole(params: {
  tx: StaffRoleChangeTxClient;
  context: AuthenticatedStaffContext;
  staffId: string;
  roleId: string;
}): Promise<StaffRoleChangeResult> {
  const { tx, context, staffId, roleId } = params;

  // Defense in depth: the route already gated, but even a future miswiring
  // cannot run this service for an actor who may not manage staff.
  assertCanManageStaff(context);
  const organizationId = context.organizationId;

  const target = await tx.staff.findFirst({
    where: { id: staffId, organizationId },
    select: STAFF_ROLE_TARGET_SELECT,
  });
  if (!target) {
    throw new StaffProvisioningError("Staff tidak ditemukan.", 404);
  }

  const role = requireRoleInOrganization(
    await tx.role.findUnique({
      where: { id: roleId },
      select: STAFF_ROLE_OPTION_SELECT,
    }),
    organizationId
  );

  const previousRoleIds = target.roles.map((entry) => entry.role.id);
  const previousRoleNames = target.roles.map((entry) => entry.role.name);

  // No-op: exactly this single role is already assigned. The audit trail
  // records changes, not restatements, so nothing is written.
  if (previousRoleIds.length === 1 && previousRoleIds[0] === role.id) {
    return {
      staffId: target.id,
      roleId: role.id,
      roleName: role.name,
      previousRoleId: previousRoleIds[0],
      previousRoleNames,
      noop: true,
    };
  }

  // Last ACTIVE OWNER invariant: does this change strip the organization of
  // every active owner? The count is loaded inside the same transaction.
  const targetIsActiveOwner =
    target.status === "ACTIVE" && holdsOwnerRole(previousRoleNames);
  const targetRetainsActiveOwner =
    target.status === "ACTIVE" && holdsOwnerRole([role.name]);

  const otherActiveOwnerCount =
    targetIsActiveOwner && !targetRetainsActiveOwner
      ? await tx.staff.count({
          where: {
            organizationId,
            status: "ACTIVE",
            id: { not: target.id },
            roles: { some: { role: { name: STAFF_MANAGEMENT_ROLE } } },
          },
        })
      : 0;

  assertActiveOwnerRetention({
    targetIsActiveOwner,
    targetRetainsActiveOwner,
    otherActiveOwnerCount,
  });

  await tx.staffRole.deleteMany({ where: { staffId: target.id } });
  await tx.staffRole.createMany({
    data: [{ staffId: target.id, roleId: role.id }],
    skipDuplicates: true,
  });

  await tx.auditLog.create({
    data: buildStaffRoleChangeAudit({
      actorStaffId: context.staffId,
      actorUserId: context.userId,
      organizationId,
      // The audited entity is the target staff; its outlet is the factual
      // scope of the change.
      outletId: target.outletId ?? null,
      targetStaffId: target.id,
      fromRoleId: previousRoleIds[0] ?? null,
      fromRoleName: previousRoleNames[0] ?? null,
      toRoleId: role.id,
      toRoleName: role.name,
    }),
  });

  return {
    staffId: target.id,
    roleId: role.id,
    roleName: role.name,
    previousRoleId: previousRoleIds[0] ?? null,
    previousRoleNames,
    noop: false,
  };
}
