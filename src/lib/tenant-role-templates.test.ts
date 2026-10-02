/**
 * HANSAN — Phase 16 R1: standard tenant role template tests.
 *
 * Exercises the REAL production module ./tenant-role-templates together with
 * the canonical catalog (./permissions) and the shared guards it reuses
 * (./role-management) through an injected fake transaction client. No database,
 * no Supabase and no fixtures are involved, so nothing is written to the
 * production database and it is safe to run against an empty database.
 */

import {
  STANDARD_TENANT_ROLE_NAMES,
  TENANT_ROLE_TEMPLATES,
  TenantRoleTemplateError,
  assertCanonicalPermissionNames,
  buildStandardRoleSeed,
  getTenantRoleTemplate,
  isStandardTenantRoleName,
  planStandardRoleSeeding,
  seedStandardTenantRoles,
  type StandardRoleSeedTxClient,
} from "./tenant-role-templates";
import {
  NON_CATALOG_PERMISSION_PREFIXES,
  PERMISSION,
  PERMISSION_NAMES,
  PermissionCatalogError,
  requirePermissionDefinition,
} from "./permissions";
import { normalizeRoleNameKey, roleCodeFromRoleName } from "./role-management";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

// ─────────────────────────────────────────────────────────────────────────────
// FAKE TRANSACTION CLIENT (shaped like StandardRoleSeedTxClient)
// ─────────────────────────────────────────────────────────────────────────────

type FakeSeedTxOptions = {
  /** Role names that already exist, keyed by organization id. */
  existingRoleNamesByOrg?: Record<string, string[]>;
  /** Canonical permission names already present in the Permission table. */
  existingPermissions?: readonly string[];
};

function makeSeedTx(options: FakeSeedTxOptions = {}) {
  const calls = {
    roleFindFirst: [] as Array<{ where: { organizationId: string; name: string } }>,
    roleCreate: [] as Array<{ data: Record<string, unknown> }>,
    permissionFindUnique: [] as Array<{ where: { name: string } }>,
    permissionCreate: [] as Array<{ data: { name: string; description: string | null } }>,
    rolePermissionCreateMany: [] as Array<{
      data: Array<{ roleId: string; permissionId: string }>;
      skipDuplicates: true;
    }>,
  };

  const existingPermissions = new Set<string>(
    options.existingPermissions ?? PERMISSION_NAMES
  );
  let permissionCounter = 0;

  const tx = {
    permission: {
      findUnique: async (args: { where: { name: string } }) => {
        calls.permissionFindUnique.push(args);
        return existingPermissions.has(args.where.name)
          ? { id: `perm_${args.where.name}`, name: args.where.name }
          : null;
      },
      create: async (args: { data: { name: string; description: string | null } }) => {
        calls.permissionCreate.push(args);
        existingPermissions.add(args.data.name);
        permissionCounter += 1;
        return { id: `perm_new_${permissionCounter}`, name: args.data.name };
      },
    },
    role: {
      findFirst: async (args: {
        where: { organizationId: string; name: string };
        select: { id: true };
      }) => {
        calls.roleFindFirst.push(args);
        const names = options.existingRoleNamesByOrg?.[args.where.organizationId] ?? [];
        return names.includes(args.where.name) ? { id: `role_${args.where.name}` } : null;
      },
      create: async (args: {
        data: {
          organizationId: string;
          name: string;
          code: string;
          description: string;
          isPlatform: false;
        };
        select: { id: true; name: true };
      }) => {
        calls.roleCreate.push(args);
        return { id: `role_created_${args.data.name}`, name: args.data.name };
      },
    },
    rolePermission: {
      createMany: async (args: {
        data: Array<{ roleId: string; permissionId: string }>;
        skipDuplicates: true;
      }) => {
        calls.rolePermissionCreateMany.push(args);
        return { count: args.data.length };
      },
    },
  };

  return { tx: tx as unknown as StandardRoleSeedTxClient, calls };
}

/** Grant names of a template, failing loudly if the name is not standard. */
function permissionNamesOf(roleName: string): string[] {
  const template = getTenantRoleTemplate(roleName);
  if (!template) {
    throw new Error(`${roleName} is not a standard tenant role template`);
  }
  return template.permissions.map((permission) => permission.name);
}

const STANDARD_ORDER = ["MANAGER", "CASHIER", "KITCHEN", "BAR", "FINANCE", "STAFF"];

// ─────────────────────────────────────────────────────────────────────────────
// 1. THE TEMPLATE TABLE
// ─────────────────────────────────────────────────────────────────────────────

describe("standard tenant role templates", () => {
  it("declares the six standard roles in deterministic order and never OWNER", () => {
    assert.deepEqual([...STANDARD_TENANT_ROLE_NAMES], STANDARD_ORDER);
    assert.deepEqual(
      TENANT_ROLE_TEMPLATES.map((template) => template.name),
      STANDARD_ORDER
    );

    assert.equal(isStandardTenantRoleName("OWNER"), false);
    assert.equal(getTenantRoleTemplate("OWNER"), null);
    for (const template of TENANT_ROLE_TEMPLATES) {
      assert.notEqual(normalizeRoleNameKey(template.name), "OWNER");
    }
  });

  it("grants only implemented POS permissions: MANAGER and CASHIER get orders.read + orders.create", () => {
    assert.deepEqual(permissionNamesOf("MANAGER"), [
      PERMISSION.ORDERS_READ,
      PERMISSION.ORDERS_CREATE,
    ]);
    assert.deepEqual(permissionNamesOf("CASHIER"), [
      PERMISSION.ORDERS_READ,
      PERMISSION.ORDERS_CREATE,
    ]);

    // No grant is invented for a workflow that is not implemented yet.
    for (const name of ["KITCHEN", "BAR", "FINANCE", "STAFF"]) {
      assert.deepEqual(permissionNamesOf(name), [], `${name} must carry no grant yet`);
    }
  });

  it("never grants OWNER authority to a standard role", () => {
    for (const template of TENANT_ROLE_TEMPLATES) {
      const names = template.permissions.map((permission) => permission.name);
      assert.equal(names.includes(PERMISSION.OWNER_HQ_MANAGE), false);
      assert.equal(names.includes(PERMISSION.SETTINGS_MANAGE), false);
    }
  });

  it("references only canonical catalog permissions and crosses no platform boundary", () => {
    for (const template of TENANT_ROLE_TEMPLATES) {
      for (const permission of template.permissions) {
        assert.ok(
          (PERMISSION_NAMES as readonly string[]).includes(permission.name),
          `${permission.name} must be canonical`
        );
        assert.equal(requirePermissionDefinition(permission.name).name, permission.name);
        for (const prefix of NON_CATALOG_PERMISSION_PREFIXES) {
          assert.equal(permission.name.startsWith(prefix), false);
        }
      }
    }
  });

  it("fails loudly on a non-canonical grant name instead of shipping a dead grant", () => {
    assert.throws(
      () => assertCanonicalPermissionNames(["not.a.permission"]),
      (error: unknown) => error instanceof PermissionCatalogError
    );
    assert.deepEqual(
      assertCanonicalPermissionNames([PERMISSION.ORDERS_READ]).map((permission) => permission.name),
      [PERMISSION.ORDERS_READ]
    );
  });

  it("looks templates up case-sensitively (the stored name is the contract)", () => {
    assert.ok(getTenantRoleTemplate("MANAGER"));
    assert.equal(getTenantRoleTemplate("manager"), null);
    assert.equal(isStandardTenantRoleName("manager"), false);
    assert.equal(getTenantRoleTemplate(null), null);
    assert.equal(getTenantRoleTemplate(7), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SEED PLANNING (pure)
// ─────────────────────────────────────────────────────────────────────────────

describe("standard role seed planning", () => {
  it("builds an organization-scoped, platform-free seed row", () => {
    const template = getTenantRoleTemplate("MANAGER");
    if (!template) {
      throw new Error("MANAGER template missing");
    }

    const seed = buildStandardRoleSeed(template, "org_alpha");
    assert.equal(seed.name, "MANAGER");
    assert.equal(seed.code, roleCodeFromRoleName("MANAGER", "org_alpha"));
    assert.equal(seed.code, "MANAGER_org_alpha");
    assert.deepEqual([...seed.permissionNames], [
      PERMISSION.ORDERS_READ,
      PERMISSION.ORDERS_CREATE,
    ]);
    assert.equal(Object.isFrozen(seed), true);
  });

  it("refuses to build a seed without an organization id", () => {
    const template = getTenantRoleTemplate("STAFF");
    if (!template) {
      throw new Error("STAFF template missing");
    }
    assert.throws(() => buildStandardRoleSeed(template, "   "), TenantRoleTemplateError);
  });

  it("plans only the missing roles and normalises existing names", () => {
    const plan = planStandardRoleSeeding({
      organizationId: "org_alpha",
      // Casing and an unrelated custom role must not confuse the plan.
      existingRoleNames: ["manager", "Barista"],
    });

    assert.deepEqual([...plan.existingRoleNames], ["MANAGER"]);
    assert.deepEqual(
      plan.toCreate.map((seed) => seed.name),
      ["CASHIER", "KITCHEN", "BAR", "FINANCE", "STAFF"]
    );
    assert.equal(
      plan.toCreate.every((seed) => seed.code.endsWith("_org_alpha")),
      true
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. TRANSACTION-SCOPED SEEDING
// ─────────────────────────────────────────────────────────────────────────────

describe("standard tenant role seeding", () => {
  it("creates all six roles with tenant-scoped codes, false isPlatform and canonical grants", async () => {
    const { tx, calls } = makeSeedTx();
    const result = await seedStandardTenantRoles({ tx, organizationId: "org_new" });

    assert.deepEqual([...result.createdRoleNames], STANDARD_ORDER);
    assert.deepEqual([...result.existingRoleNames], []);

    assert.equal(calls.roleCreate.length, 6);
    for (const call of calls.roleCreate) {
      assert.equal(call.data.organizationId, "org_new");
      assert.equal(call.data.isPlatform, false);
      assert.equal(
        call.data.code,
        roleCodeFromRoleName(String(call.data.name), "org_new")
      );
    }

    // Only MANAGER and CASHIER carry grants today; the four workflow-less
    // roles produce no RolePermission rows at all.
    assert.equal(calls.rolePermissionCreateMany.length, 2);
    for (const call of calls.rolePermissionCreateMany) {
      assert.equal(call.data.length, 2);
      assert.equal(call.skipDuplicates, true);
    }

    assert.deepEqual(
      result.createdRoles.map((role) => [role.name, [...role.permissionNames]]),
      [
        ["MANAGER", [PERMISSION.ORDERS_READ, PERMISSION.ORDERS_CREATE]],
        ["CASHIER", [PERMISSION.ORDERS_READ, PERMISSION.ORDERS_CREATE]],
        ["KITCHEN", []],
        ["BAR", []],
        ["FINANCE", []],
        ["STAFF", []],
      ]
    );
  });

  it("never creates a platform role or a DeveloperAccess row", async () => {
    const { tx, calls } = makeSeedTx();
    const result = await seedStandardTenantRoles({ tx, organizationId: "org_new" });

    for (const call of calls.roleCreate) {
      assert.equal(call.data.isPlatform, false);
    }
    assert.equal([...result.createdRoleNames].includes("OWNER"), false);
    // The tx surface exposes no developer/platform write capability at all.
    assert.equal("developerAccess" in tx, false);
  });

  it("replays idempotently: an organization that already has them creates nothing", async () => {
    const { tx, calls } = makeSeedTx({
      existingRoleNamesByOrg: { org_full: [...STANDARD_TENANT_ROLE_NAMES] },
    });
    const result = await seedStandardTenantRoles({ tx, organizationId: "org_full" });

    assert.deepEqual([...result.createdRoleNames], []);
    assert.deepEqual([...result.existingRoleNames], STANDARD_ORDER);
    assert.equal(calls.roleCreate.length, 0);
    assert.equal(calls.rolePermissionCreateMany.length, 0);

    // Existence was checked with an organization-scoped where clause.
    assert.equal(calls.roleFindFirst.length, 6);
    for (const call of calls.roleFindFirst) {
      assert.equal(call.where.organizationId, "org_full");
    }
  });

  it("skips the existence query entirely when the caller supplies existing names", async () => {
    const { tx, calls } = makeSeedTx();
    const result = await seedStandardTenantRoles({
      tx,
      organizationId: "org_full",
      existingRoleNames: [...STANDARD_TENANT_ROLE_NAMES],
    });

    assert.equal(calls.roleFindFirst.length, 0);
    assert.deepEqual([...result.createdRoleNames], []);
  });

  it("creates only the missing roles on a partially provisioned organization", async () => {
    const { tx, calls } = makeSeedTx({
      existingRoleNamesByOrg: { org_partial: ["MANAGER", "CASHIER"] },
    });
    const result = await seedStandardTenantRoles({ tx, organizationId: "org_partial" });

    assert.deepEqual([...result.createdRoleNames], ["KITCHEN", "BAR", "FINANCE", "STAFF"]);
    assert.deepEqual([...result.existingRoleNames], ["MANAGER", "CASHIER"]);
    assert.equal(calls.roleCreate.length, 4);
    // None of the four created roles has a grant yet.
    assert.equal(calls.rolePermissionCreateMany.length, 0);
  });

  it("keeps tenants isolated: another organization's roles never satisfy this one", async () => {
    const { tx, calls } = makeSeedTx({
      existingRoleNamesByOrg: { org_a: [...STANDARD_TENANT_ROLE_NAMES] },
    });
    const result = await seedStandardTenantRoles({ tx, organizationId: "org_b" });

    assert.deepEqual([...result.createdRoleNames], STANDARD_ORDER);
    for (const call of calls.roleCreate) {
      assert.equal(call.data.organizationId, "org_b");
      assert.equal(String(call.data.code).endsWith("_org_b"), true);
    }
  });

  it("recovers missing canonical Permission rows instead of redefining vocabulary", async () => {
    const { tx, calls } = makeSeedTx({ existingPermissions: [] });
    await seedStandardTenantRoles({ tx, organizationId: "org_new" });

    assert.deepEqual(
      calls.permissionCreate.map((call) => call.data.name),
      [PERMISSION.ORDERS_READ, PERMISSION.ORDERS_CREATE]
    );
    for (const call of calls.permissionCreate) {
      const definition = requirePermissionDefinition(call.data.name);
      assert.equal(call.data.description, definition.description);
    }
  });
});