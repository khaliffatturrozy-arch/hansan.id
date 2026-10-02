/**
 * HANSAN — Phase 16 R2: staff role change tests.
 *
 * Exercises the REAL production module ./staff-role-change together with the
 * shared guards it reuses (./staff-provisioning -> ./auth) through an injected
 * fake transaction client. No database, no Supabase and no fixtures are
 * involved, so nothing is written to the production database and the suite is
 * safe to run against an empty database.
 */

import {
  STAFF_AUDIT_ENTITY_TYPE,
  STAFF_ROLE_CHANGED_ACTION,
  buildStaffRoleChangeAudit,
  changeStaffRole,
  type StaffRoleChangeAuditRecord,
  type StaffRoleChangeTxClient,
} from "./staff-role-change";
import { StaffProvisioningError } from "./staff-provisioning";
import type { AuthenticatedStaffContext } from "./auth";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

function statusOf(error: unknown): number {
  return (error as { statusCode?: number } | null)?.statusCode ?? -1;
}

const OWNER_CONTEXT = {
  userId: "auth_1",
  email: "owner@example.com",
  staffId: "staff_1",
  staffName: "Owner",
  organizationId: "org_1",
  outletId: "outlet_1",
  roleName: "OWNER",
  permissions: ["owner.hq.manage", "settings.manage", "orders.read", "orders.create"],
  status: "ACTIVE",
};

/** A fresh actor context with the same identity, optionally mutated. */
function contextWith(overrides: Record<string, unknown> = {}): AuthenticatedStaffContext {
  return { ...OWNER_CONTEXT, ...overrides } as unknown as AuthenticatedStaffContext;
}

type TargetRecord = {
  id: string;
  status: string;
  outletId: string | null;
  roles: Array<{ role: { id: string; name: string } }>;
};

type RoleOptionRecord = {
  id: string;
  name: string;
  organizationId: string | null;
  isPlatform: boolean;
};

const CASHIER_TARGET: TargetRecord = {
  id: "staff_2",
  status: "ACTIVE",
  outletId: "outlet_1",
  roles: [{ role: { id: "role_cashier", name: "CASHIER" } }],
};

const MANAGER_ROLE: RoleOptionRecord = {
  id: "role_manager",
  name: "MANAGER",
  organizationId: "org_1",
  isPlatform: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// FAKE TRANSACTION CLIENT (shaped like StaffRoleChangeTxClient)
// ─────────────────────────────────────────────────────────────────────────────

type FakeRoleChangeOptions = {
  target?: TargetRecord | null;
  /** Organization the target actually belongs to (drives tenant scoping). */
  targetOrganizationId?: string;
  role?: RoleOptionRecord | null;
  otherActiveOwnerCount?: number;
};

function makeRoleChangeTx(options: FakeRoleChangeOptions = {}) {
  const calls = {
    staffFindFirst: [] as Array<{ where: { id: string; organizationId: string } }>,
    staffCount: [] as Array<Record<string, unknown>>,
    roleFindUnique: [] as Array<{ where: { id: string } }>,
    deleteMany: [] as Array<{ where: { staffId: string } }>,
    createMany: [] as Array<{
      data: Array<{ staffId: string; roleId: string }>;
      skipDuplicates: true;
    }>,
    audit: [] as StaffRoleChangeAuditRecord[],
  };

  const target = options.target === undefined ? CASHIER_TARGET : options.target;
  const targetOrganizationId = options.targetOrganizationId ?? "org_1";
  const role = options.role === undefined ? MANAGER_ROLE : options.role;

  const tx = {
    staff: {
      findFirst: async (args: { where: { id: string; organizationId: string } }) => {
        calls.staffFindFirst.push(args);
        if (!target) return null;
        if (target.id !== args.where.id) return null;
        // Organization scope: a staff id from another tenant is "not found".
        if (args.where.organizationId !== targetOrganizationId) return null;
        return {
          id: target.id,
          status: target.status,
          outletId: target.outletId,
          roles: target.roles,
        };
      },
      count: async (args: Record<string, unknown>) => {
        calls.staffCount.push(args);
        return options.otherActiveOwnerCount ?? 0;
      },
    },
    role: {
      findUnique: async (args: { where: { id: string } }) => {
        calls.roleFindUnique.push(args);
        if (!role || role.id !== args.where.id) return null;
        return role;
      },
    },
    staffRole: {
      deleteMany: async (args: { where: { staffId: string } }) => {
        calls.deleteMany.push(args);
        return { count: 1 };
      },
      createMany: async (args: {
        data: Array<{ staffId: string; roleId: string }>;
        skipDuplicates: true;
      }) => {
        calls.createMany.push(args);
        return { count: args.data.length };
      },
    },
    auditLog: {
      create: async (args: { data: StaffRoleChangeAuditRecord }) => {
        calls.audit.push(args.data);
        return {};
      },
    },
  };

  return { tx: tx as unknown as StaffRoleChangeTxClient, calls };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SUCCESS PATH (atomic replace + audit)
// ─────────────────────────────────────────────────────────────────────────────

describe("staff role change — success path", () => {
  it("replaces the single role atomically and audits the transition", async () => {
    const { tx, calls } = makeRoleChangeTx();
    const result = await changeStaffRole({
      tx,
      context: contextWith(),
      staffId: "staff_2",
      roleId: "role_manager",
    });

    assert.equal(result.noop, false);
    assert.equal(result.staffId, "staff_2");
    assert.equal(result.roleId, "role_manager");
    assert.equal(result.roleName, "MANAGER");
    assert.equal(result.previousRoleId, "role_cashier");
    assert.deepEqual([...result.previousRoleNames], ["CASHIER"]);

    // Existence is always tenant-scoped.
    assert.deepEqual(calls.staffFindFirst[0].where, {
      id: "staff_2",
      organizationId: "org_1",
    });

    assert.equal(calls.deleteMany.length, 1);
    assert.deepEqual(calls.deleteMany[0].where, { staffId: "staff_2" });
    assert.equal(calls.createMany.length, 1);
    assert.deepEqual(calls.createMany[0].data, [
      { staffId: "staff_2", roleId: "role_manager" },
    ]);
    assert.equal(calls.createMany[0].skipDuplicates, true);

    assert.equal(calls.audit.length, 1);
    const audit = calls.audit[0];
    assert.equal(audit.action, STAFF_ROLE_CHANGED_ACTION);
    assert.equal(audit.action, "STAFF_ROLE_CHANGED");
    assert.equal(audit.entityType, STAFF_AUDIT_ENTITY_TYPE);
    assert.equal(audit.entityType, "STAFF");
    assert.equal(audit.entityId, "staff_2");
    assert.equal(audit.organizationId, "org_1");
    assert.equal(audit.actorStaffId, "staff_1");
    assert.equal(audit.actorUserId, "auth_1");
    assert.equal(audit.outletId, "outlet_1");
    assert.deepEqual(audit.metadata, {
      targetStaffId: "staff_2",
      fromRoleId: "role_cashier",
      fromRoleName: "CASHIER",
      toRoleId: "role_manager",
      toRoleName: "MANAGER",
    });
  });

  it("is a no-op with no writes when the staff already holds exactly the role", async () => {
    const { tx, calls } = makeRoleChangeTx({
      target: {
        ...CASHIER_TARGET,
        roles: [{ role: { id: "role_manager", name: "MANAGER" } }],
      },
    });
    const result = await changeStaffRole({
      tx,
      context: contextWith(),
      staffId: "staff_2",
      roleId: "role_manager",
    });

    assert.equal(result.noop, true);
    assert.equal(calls.deleteMany.length, 0);
    assert.equal(calls.createMany.length, 0);
    assert.equal(calls.audit.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. AUTHORIZATION GATE (defense in depth)
// ─────────────────────────────────────────────────────────────────────────────

describe("staff role change — authorization gate", () => {
  it("refuses an actor without settings.manage before touching the database", async () => {
    const { tx, calls } = makeRoleChangeTx();
    await assert.rejects(
      () =>
        changeStaffRole({
          tx,
          context: contextWith({ permissions: ["orders.read"] }),
          staffId: "staff_2",
          roleId: "role_manager",
        }),
      (error: unknown) => statusOf(error) === 403
    );
    assert.equal(calls.staffFindFirst.length, 0);
    assert.equal(calls.deleteMany.length, 0);
    assert.equal(calls.audit.length, 0);
  });

  it("refuses an inactive actor", async () => {
    const { tx, calls } = makeRoleChangeTx();
    await assert.rejects(
      () =>
        changeStaffRole({
          tx,
          context: contextWith({ status: "INACTIVE" }),
          staffId: "staff_2",
          roleId: "role_manager",
        }),
      (error: unknown) => statusOf(error) === 403
    );
    assert.equal(calls.staffFindFirst.length, 0);
  });

  it("refuses a non-OWNER actor", async () => {
    const { tx, calls } = makeRoleChangeTx();
    await assert.rejects(
      () =>
        changeStaffRole({
          tx,
          context: contextWith({ roleName: "MANAGER" }),
          staffId: "staff_2",
          roleId: "role_manager",
        }),
      (error: unknown) => statusOf(error) === 403
    );
    assert.equal(calls.staffFindFirst.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. TENANT ISOLATION (target staff + target role)
// ─────────────────────────────────────────────────────────────────────────────

describe("staff role change — tenant isolation", () => {
  it("treats an unknown staff id as 404", async () => {
    const { tx, calls } = makeRoleChangeTx({ target: null });
    await assert.rejects(
      () =>
        changeStaffRole({
          tx,
          context: contextWith(),
          staffId: "staff_2",
          roleId: "role_manager",
        }),
      (error: unknown) => error instanceof StaffProvisioningError && statusOf(error) === 404
    );
    // The role is never even looked at, and nothing is written.
    assert.equal(calls.roleFindUnique.length, 0);
    assert.equal(calls.deleteMany.length, 0);
  });

  it("treats a staff id from another tenant as 404, not a cross-tenant oracle", async () => {
    const { tx, calls } = makeRoleChangeTx({
      target: CASHIER_TARGET,
      targetOrganizationId: "org_other",
    });
    await assert.rejects(
      () =>
        changeStaffRole({
          tx,
          context: contextWith(),
          staffId: "staff_2",
          roleId: "role_manager",
        }),
      (error: unknown) => statusOf(error) === 404
    );
    assert.equal(calls.deleteMany.length, 0);
    assert.equal(calls.audit.length, 0);
  });

  it("treats an unknown role id as 404", async () => {
    const { tx, calls } = makeRoleChangeTx({ role: null });
    await assert.rejects(
      () =>
        changeStaffRole({
          tx,
          context: contextWith(),
          staffId: "staff_2",
          roleId: "role_missing",
        }),
      (error: unknown) => statusOf(error) === 404
    );
    assert.equal(calls.deleteMany.length, 0);
    assert.equal(calls.audit.length, 0);
  });

  it("refuses a platform role with 403 (a tenant cannot mint platform authority)", async () => {
    const { tx, calls } = makeRoleChangeTx({
      role: {
        id: "role_platform",
        name: "PLATFORM_ADMIN",
        organizationId: null,
        isPlatform: true,
      },
    });
    await assert.rejects(
      () =>
        changeStaffRole({
          tx,
          context: contextWith(),
          staffId: "staff_2",
          roleId: "role_platform",
        }),
      (error: unknown) => statusOf(error) === 403
    );
    assert.equal(calls.deleteMany.length, 0);
    assert.equal(calls.audit.length, 0);
  });

  it("refuses a role that belongs to another organization with 403", async () => {
    const { tx, calls } = makeRoleChangeTx({
      role: {
        id: "role_foreign",
        name: "MANAGER",
        organizationId: "org_other",
        isPlatform: false,
      },
    });
    await assert.rejects(
      () =>
        changeStaffRole({
          tx,
          context: contextWith(),
          staffId: "staff_2",
          roleId: "role_foreign",
        }),
      (error: unknown) => statusOf(error) === 403
    );
    assert.equal(calls.deleteMany.length, 0);
    assert.equal(calls.audit.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. LAST ACTIVE OWNER INVARIANT (administrative lockout protection)
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVE_OWNER_TARGET: TargetRecord = {
  id: "staff_2",
  status: "ACTIVE",
  outletId: "outlet_1",
  roles: [{ role: { id: "role_owner", name: "OWNER" } }],
};

describe("staff role change — last active OWNER invariant", () => {
  it("refuses to strip the last ACTIVE OWNER with 409 and writes nothing", async () => {
    const { tx, calls } = makeRoleChangeTx({
      target: ACTIVE_OWNER_TARGET,
      role: MANAGER_ROLE,
      otherActiveOwnerCount: 0,
    });
    await assert.rejects(
      () =>
        changeStaffRole({
          tx,
          context: contextWith(),
          staffId: "staff_2",
          roleId: "role_manager",
        }),
      (error: unknown) => error instanceof StaffProvisioningError && statusOf(error) === 409
    );
    // The throw aborts the caller's transaction: no partial mutation, no audit.
    assert.equal(calls.staffCount.length, 1);
    assert.equal(calls.deleteMany.length, 0);
    assert.equal(calls.createMany.length, 0);
    assert.equal(calls.audit.length, 0);
  });

  it("allows demoting an ACTIVE OWNER when another ACTIVE OWNER remains", async () => {
    const { tx, calls } = makeRoleChangeTx({
      target: ACTIVE_OWNER_TARGET,
      role: MANAGER_ROLE,
      otherActiveOwnerCount: 1,
    });
    const result = await changeStaffRole({
      tx,
      context: contextWith(),
      staffId: "staff_2",
      roleId: "role_manager",
    });

    assert.equal(result.noop, false);
    assert.equal(calls.audit.length, 1);
    assert.equal(calls.audit[0].metadata.fromRoleName, "OWNER");
    assert.equal(calls.audit[0].metadata.toRoleName, "MANAGER");
  });

  it("never queries the owner count when the target keeps OWNER (OWNER → OWNER)", async () => {
    const { tx, calls } = makeRoleChangeTx({
      target: ACTIVE_OWNER_TARGET,
      role: {
        id: "role_owner_2",
        name: "OWNER",
        organizationId: "org_1",
        isPlatform: false,
      },
    });
    const result = await changeStaffRole({
      tx,
      context: contextWith(),
      staffId: "staff_2",
      roleId: "role_owner_2",
    });

    assert.equal(result.noop, false);
    assert.equal(calls.staffCount.length, 0);
    assert.equal(calls.audit.length, 1);
    assert.equal(calls.audit[0].metadata.toRoleName, "OWNER");
  });

  it("does not protect an INACTIVE OWNER from a role change", async () => {
    const { tx, calls } = makeRoleChangeTx({
      target: { ...ACTIVE_OWNER_TARGET, status: "SUSPENDED" },
      role: MANAGER_ROLE,
    });
    const result = await changeStaffRole({
      tx,
      context: contextWith(),
      staffId: "staff_2",
      roleId: "role_manager",
    });

    assert.equal(result.noop, false);
    assert.equal(calls.staffCount.length, 0);
    assert.equal(calls.audit.length, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. MULTI-ROLE TARGETS + AUDIT HYGIENE
// ─────────────────────────────────────────────────────────────────────────────

describe("staff role change — multi-role targets and audit hygiene", () => {
  it("records the first previous role and the full previous role set", async () => {
    const { tx, calls } = makeRoleChangeTx({
      target: {
        id: "staff_2",
        status: "ACTIVE",
        outletId: "outlet_1",
        roles: [
          { role: { id: "role_owner", name: "OWNER" } },
          { role: { id: "role_manager", name: "MANAGER" } },
        ],
      },
      role: { id: "role_cashier", name: "CASHIER", organizationId: "org_1", isPlatform: false },
      otherActiveOwnerCount: 1,
    });
    const result = await changeStaffRole({
      tx,
      context: contextWith(),
      staffId: "staff_2",
      roleId: "role_cashier",
    });

    assert.deepEqual([...result.previousRoleNames], ["OWNER", "MANAGER"]);
    assert.equal(result.previousRoleId, "role_owner");
    assert.equal(calls.audit[0].metadata.fromRoleId, "role_owner");
    assert.equal(calls.audit[0].metadata.fromRoleName, "OWNER");
    // The whole set is replaced by exactly the new role.
    assert.deepEqual(calls.createMany[0].data, [
      { staffId: "staff_2", roleId: "role_cashier" },
    ]);
  });

  it("writes an audit row containing no credentials or tokens", async () => {
    const { tx, calls } = makeRoleChangeTx();
    await changeStaffRole({
      tx,
      context: contextWith(),
      staffId: "staff_2",
      roleId: "role_manager",
    });

    const audit = calls.audit[0];
    assert.deepEqual(Object.keys(audit).sort(), [
      "action",
      "actorStaffId",
      "actorUserId",
      "entityId",
      "entityType",
      "metadata",
      "organizationId",
      "outletId",
    ]);
    const serialized = JSON.stringify(audit).toLowerCase();
    for (const forbidden of ["password", "token", "secret", "apikey", "api_key", "jwt"]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });

  it("builds the audit record deterministically for a given transition", () => {
    const record = buildStaffRoleChangeAudit({
      actorStaffId: "staff_1",
      actorUserId: "auth_1",
      organizationId: "org_1",
      outletId: null,
      targetStaffId: "staff_2",
      fromRoleId: "role_cashier",
      fromRoleName: "CASHIER",
      toRoleId: "role_manager",
      toRoleName: "MANAGER",
    });

    assert.equal(record.action, STAFF_ROLE_CHANGED_ACTION);
    assert.equal(record.entityType, STAFF_AUDIT_ENTITY_TYPE);
    assert.equal(record.entityId, "staff_2");
    assert.equal(record.outletId, null);
    assert.deepEqual(record.metadata, {
      targetStaffId: "staff_2",
      fromRoleId: "role_cashier",
      fromRoleName: "CASHIER",
      toRoleId: "role_manager",
      toRoleName: "MANAGER",
    });
  });
});