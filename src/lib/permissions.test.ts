/**
 * HANSAN — canonical permission catalog tests.
 *
 * Proves the four things the catalog exists to guarantee:
 *  1. the catalog is internally sound (unique, well-formed, grouped, frozen);
 *  2. the permission names that production authorization code depends on are
 *     exactly the ones that existed before the catalog — no behavior change;
 *  3. the reference-data migration and the catalog cannot drift apart;
 *  4. a grant the catalog does not recognize resolves to nothing at session time.
 *
 * No DB fixtures, no network. Loaded by the node:test runner through ts-node,
 * so this file uses relative imports only (the `@/` alias is not resolved there).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  deterministicPermissionId,
  getPermissionDefinition,
  getPermissionNamesByDomain,
  isCanonicalPermission,
  isCatalogManagedPermission,
  NON_CATALOG_PERMISSION_PREFIXES,
  OWNER_PROVISION_PERMISSION_NAMES,
  OWNER_PROVISION_PERMISSIONS,
  PERMISSION,
  PERMISSION_DEFINITIONS,
  PERMISSION_DOMAINS,
  PERMISSION_NAME_PATTERN,
  PERMISSION_NAMES,
  PermissionCatalogError,
  requirePermissionDefinition,
  type PermissionDefinition,
} from "./permissions";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { OWNER_BOOTSTRAP_REQUIRED_PERMISSIONS, resolveCanonicalGrantPermissions } = require("./auth");
const { STAFF_MANAGEMENT_PERMISSION } = require("./staff-provisioning");

const MIGRATION_DIR = "202610010001_permission_catalog_reference_data";

/** The four names live authorization code has always used, in grant order. */
const LIVE_PRODUCTION_PERMISSIONS = [
  "owner.hq.manage",
  "settings.manage",
  "orders.read",
  "orders.create",
] as const;

/** The descriptions those four rows already carry in the production database. */
const LIVE_PRODUCTION_DESCRIPTIONS: Record<string, string> = {
  "owner.hq.manage": "Access and manage the Owner HQ dashboard",
  "settings.manage": "Configure organization and outlet settings",
  "orders.read": "View orders",
  "orders.create": "Create orders",
};

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Extract one of the migration's `ARRAY[ ... ]::TEXT[]` literals and unescape
 * the doubled single quotes Postgres uses inside a string literal.
 */
function parseMigrationArray(rawSql: string, marker: string): string[] {
  const markerIndex = rawSql.indexOf(marker);
  assert.notEqual(markerIndex, -1, `migration SQL must declare "${marker}"`);
  const open = rawSql.indexOf("ARRAY[", markerIndex);
  assert.notEqual(open, -1, `migration SQL must build an ARRAY for "${marker}"`);
  const close = rawSql.indexOf("]", open);
  assert.notEqual(close, -1, `migration SQL array for "${marker}" is not closed`);

  const body = rawSql.slice(open + "ARRAY[".length, close);
  const literals: string[] = [];
  const pattern = /'((?:[^']|'')*)'/g;
  let match: RegExpExecArray | null = pattern.exec(body);
  while (match) {
    literals.push(match[1].replace(/''/g, "'"));
    match = pattern.exec(body);
  }
  return literals;
}

function readMigrationSql(): string {
  const file = path.join(__dirname, "..", "..", "prisma", "migrations", MIGRATION_DIR, "migration.sql");
  assert.ok(fs.existsSync(file), `expected migration file at ${file}`);
  return fs.readFileSync(file, "utf8");
}



// ─────────────────────────────────────────────────────────────────────────────
// CATALOG INTEGRITY
// ─────────────────────────────────────────────────────────────────────────────

describe("permission catalog integrity", () => {
  it("holds every definition exactly once", () => {
    assert.ok(PERMISSION_DEFINITIONS.length > 0, "the catalog must not be empty");

    const names = PERMISSION_DEFINITIONS.map((definition: PermissionDefinition) => definition.name);
    assert.equal(uniqueValues(names).length, names.length, "permission names must be unique");
    assert.equal(uniqueValues(PERMISSION_NAMES).length, PERMISSION_NAMES.length);
    assert.equal(PERMISSION_NAMES.length, PERMISSION_DEFINITIONS.length);

    const keys = Object.keys(PERMISSION);
    assert.equal(keys.length, PERMISSION_DEFINITIONS.length, "one constant per definition");
    assert.equal(uniqueValues(Object.values(PERMISSION)).length, keys.length, "no two constants share a name");
  });

  it("keeps every name well-formed, lowercase, and rooted in its own domain", () => {
    for (const definition of PERMISSION_DEFINITIONS as readonly PermissionDefinition[]) {
      assert.match(definition.name, PERMISSION_NAME_PATTERN, `bad permission name: ${definition.name}`);
      assert.equal(
        definition.name.split(".")[0],
        definition.domain,
        `${definition.name} is filed under the wrong domain`
      );
      assert.ok(definition.description.length > 0, `${definition.name} needs a description`);
      assert.ok(PERMISSION_DOMAINS.includes(definition.domain), `${definition.domain} is not a declared domain`);
      for (const forbidden of NON_CATALOG_PERMISSION_PREFIXES) {
        assert.ok(
          !definition.name.startsWith(forbidden),
          `${definition.name} must never be a tenant catalog permission`
        );
      }
    }
  });

  it("exposes the catalog as read-only data", () => {
    assert.ok(Object.isFrozen(PERMISSION));
    assert.ok(Object.isFrozen(PERMISSION_DEFINITIONS));
    assert.ok(Object.isFrozen(PERMISSION_NAMES));
    assert.ok(PERMISSION_DOMAINS.length > 0 && Object.isFrozen(PERMISSION_DOMAINS));
  });

  it("derives deterministic ids that mirror the migration rule", () => {
    assert.equal(deterministicPermissionId(PERMISSION.ORDERS_READ), "perm_orders_read");
    assert.equal(deterministicPermissionId(PERMISSION.CUSTOMERS_UPDATE), "perm_customers_update");
    assert.equal(
      deterministicPermissionId(PERMISSION.ROLES_ASSIGN_PERMISSION),
      "perm_roles_assign_permission"
    );
    assert.equal(deterministicPermissionId(PERMISSION.SETTINGS_MANAGE), "perm_settings_manage");

    const ids = PERMISSION_NAMES.map((name) => deterministicPermissionId(name));
    assert.equal(uniqueValues(ids).length, ids.length, "ids must be unique");
    for (const id of ids) {
      assert.match(id, /^perm_[a-z0-9_]+$/);
      assert.ok(!id.includes("."), "ids must not contain dots");
    }
  });

  it("groups permissions by domain without dropping or duplicating any", () => {
    const groupedTotal = PERMISSION_DOMAINS.reduce(
      (total: number, domain: string) => total + getPermissionNamesByDomain(domain).length,
      0
    );
    assert.equal(groupedTotal, PERMISSION_DEFINITIONS.length, "domain grouping must cover every permission");

    assert.equal(getPermissionNamesByDomain("orders").length, 7);
    assert.ok(getPermissionNamesByDomain("orders").includes(PERMISSION.ORDERS_REFUND));
    assert.deepEqual(getPermissionNamesByDomain("nope"), [], "an unknown domain yields no permissions");
    assert.deepEqual(getPermissionNamesByDomain("Orders"), [], "domain lookup is case-sensitive");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOOKUP SEMANTICS — authorization decisions are denials, never thrown errors
// ─────────────────────────────────────────────────────────────────────────────

describe("permission lookup semantics", () => {
  it("resolves a canonical name to its exact definition", () => {
    assert.deepEqual(getPermissionDefinition(PERMISSION.ORDERS_READ), {
      domain: "orders",
      name: "orders.read",
      description: "View orders",
    });
    assert.equal(getPermissionDefinition(PERMISSION.BEVERAGE_MANAGE)?.domain, "beverage");
  });

  it("returns null instead of throwing for anything it does not recognise", () => {
    const notPermissions = [
      "",
      "orders",
      "orders.",
      ".read",
      "ORDERS.READ",
      "Orders.Read",
      "orders.read ",
      " orders.read",
      "orders.read.extra",
      "developer.access.manage",
      "platform.admin.manage",
      "orders.manage",
      "permission.everything",
      "*.*",
      "orders.*",
    ];
    for (const candidate of notPermissions) {
      assert.equal(getPermissionDefinition(candidate), null, `"${candidate}" is not a canonical permission`);
      assert.equal(isCanonicalPermission(candidate), false, `"${candidate}" is not a canonical permission`);
    }
    for (const candidate of [null, undefined, 0, 1, true, false, {}, [], Symbol.iterator]) {
      assert.equal(getPermissionDefinition(candidate), null, "a non-string is never a permission");
      assert.equal(isCanonicalPermission(candidate), false, "a non-string is never a permission");
    }
  });

  it("keeps the throwing accessor for defective wiring only", () => {
    assert.equal(requirePermissionDefinition(PERMISSION.ORDERS_CREATE).name, "orders.create");
    assert.throws(() => requirePermissionDefinition("orders.deleted"), PermissionCatalogError);
    assert.throws(() => requirePermissionDefinition("orders.deleted"), /not a canonical permission/);
    assert.throws(() => requirePermissionDefinition(undefined as unknown as string), PermissionCatalogError);
  });

  it("separates catalog-managed permissions from role-derived ones", () => {
    // Catalog-managed: an explicit row in Permission.
    for (const name of [
      PERMISSION.OWNER_HQ_MANAGE,
      PERMISSION.ORDERS_REFUND,
      PERMISSION.INVENTORY_ADJUST,
      PERMISSION.ROLES_ASSIGN_PERMISSION,
      PERMISSION.REPORTS_EXPORT,
    ]) {
      assert.equal(isCatalogManagedPermission(name), true, `${name} is catalog managed`);
      assert.equal(isCanonicalPermission(name), true);
    }

    // Not catalog-managed: still legitimately held by a role, derived elsewhere.
    for (const name of [
      "role.manage",
      "user.manage",
      "staff.manage",
      "orders.delete",
      "tables.view",
      "table.manage",
      "reservation.manage",
      "customer.manage",
      "customer.delete",
      "promotions.manage",
      "pos.view",
      "tenant.view",
      "beverage.station.view",
      "inventory.stock.adjust",
    ]) {
      assert.ok(
        !(PERMISSION_NAMES as readonly string[]).includes(name),
        `${name} must stay out of the catalog while its source of truth lives elsewhere`
      );
      assert.equal(isCanonicalPermission(name), false, `${name} is not canonical`);
    }

    // A prefix can never be used to widen a check.
    for (const prefix of NON_CATALOG_PERMISSION_PREFIXES) {
      assert.equal(isCatalogManagedPermission(`${prefix}*`), false);
      assert.equal(isCanonicalPermission(`${prefix}anything`), false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LIVE AUTHORIZATION CODE — the catalog must not change what anyone can do
// ─────────────────────────────────────────────────────────────────────────────

describe("live authorization code keeps its exact vocabulary", () => {
  it("keeps the four production permission names and grant order", () => {
    assert.deepEqual([...OWNER_PROVISION_PERMISSION_NAMES], [...LIVE_PRODUCTION_PERMISSIONS]);
    assert.deepEqual(
      OWNER_PROVISION_PERMISSIONS.map((permission) => permission.name),
      [...LIVE_PRODUCTION_PERMISSIONS]
    );
  });

  it("keeps the descriptions already stored for those rows", () => {
    for (const [name, description] of Object.entries(LIVE_PRODUCTION_DESCRIPTIONS)) {
      assert.equal(getPermissionDefinition(name)?.description, description, `${name} description drifted`);
    }
  });

  it("grants OWNER provisioning rights that all exist in the catalog", () => {
    for (const permission of OWNER_PROVISION_PERMISSIONS) {
      assert.ok(isCanonicalPermission(permission.name), `${permission.name} must exist in the catalog`);
    }
    assert.ok(
      OWNER_PROVISION_PERMISSIONS.length < PERMISSION_DEFINITIONS.length,
      "OWNER provisioning must stay a subset, not the whole catalog"
    );
  });

  it("feeds the OWNER bootstrap guard from the same constants", () => {
    assert.deepEqual(
      [...OWNER_BOOTSTRAP_REQUIRED_PERMISSIONS].sort(),
      [PERMISSION.OWNER_HQ_MANAGE, PERMISSION.SETTINGS_MANAGE].sort()
    );
    for (const name of OWNER_BOOTSTRAP_REQUIRED_PERMISSIONS) {
      assert.equal(getPermissionDefinition(name) !== null, true, `${name} must be canonical`);
    }
  });

  it("sources staff management from the catalog", () => {
    assert.equal(STAFF_MANAGEMENT_PERMISSION, PERMISSION.SETTINGS_MANAGE);
    assert.equal(STAFF_MANAGEMENT_PERMISSION, "settings.manage");
  });

  it("wires the constants used by the API routes and Owner HQ to real rows", () => {
    const wired = [
      PERMISSION.ORDERS_READ,
      PERMISSION.ORDERS_CREATE,
      PERMISSION.OWNER_HQ_MANAGE,
      PERMISSION.SETTINGS_MANAGE,
    ];
    for (const name of wired) {
      assert.ok(requirePermissionDefinition(name), `${name} must resolve`);
    }
    assert.equal(PERMISSION.ORDERS_READ, "orders.read");
    assert.equal(PERMISSION.ORDERS_CREATE, "orders.create");
    assert.equal(PERMISSION.OWNER_HQ_MANAGE, "owner.hq.manage");
    assert.equal(PERMISSION.SETTINGS_MANAGE, "settings.manage");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CATALOG ⇄ MIGRATION PARITY
// ─────────────────────────────────────────────────────────────────────────────

describe("permission catalog and reference-data migration stay in lockstep", () => {
  it("inserts exactly the catalog, in catalog order", () => {
    const rawSql = readMigrationSql();
    const migrationNames = parseMigrationArray(rawSql, "v_names");
    const migrationDescriptions = parseMigrationArray(rawSql, "v_descriptions");
    const catalogNames = PERMISSION_DEFINITIONS.map((definition: PermissionDefinition) => definition.name);
    const catalogDescriptions = PERMISSION_DEFINITIONS.map(
      (definition: PermissionDefinition) => definition.description
    );

    assert.ok(migrationNames.length > 0);
    assert.deepEqual(migrationNames, catalogNames, "migration names must equal the catalog in order");
    assert.deepEqual(migrationDescriptions, catalogDescriptions, "migration descriptions must match");
    assert.equal(
      uniqueValues(migrationNames).length,
      migrationNames.length,
      "migration must not insert a name twice"
    );
  });

  it("preserves existing rows and touches nothing else", () => {
    const rawSql = readMigrationSql();
    assert.match(rawSql, /ON CONFLICT \("name"\) DO UPDATE/, "must be idempotent and keyed on name");
    assert.match(
      rawSql,
      /SET "description" = COALESCE\(NULLIF\(btrim\("Permission"\."description"\), ''\), EXCLUDED\."description"\)/,
      "an operator-edited description must survive a redeploy"
    );
    assert.doesNotMatch(rawSql, /\bSET\s+"id"/i, "existing permission ids must never be rewritten");
    assert.doesNotMatch(rawSql, /\bDELETE\s+FROM\b/i, "the catalog must never delete a permission");
    assert.doesNotMatch(rawSql, /\bTRUNCATE\b/i);
    assert.doesNotMatch(rawSql, /\bDROP\s+TABLE\b/i);
    assert.doesNotMatch(rawSql, /\bALTER\s+TABLE\b/i);
    assert.doesNotMatch(rawSql, /\bUPDATE\s+"public"\./i, "no mass UPDATE of existing rows");
    assert.doesNotMatch(rawSql, /"RolePermission"/, "grants are data: the migration must not touch them");
    assert.doesNotMatch(rawSql, /"StaffRole"|"Staff"|"Organization"/, "grants are data: no role or staff writes");
    assert.match(rawSql, /HANSAN_PERMISSION_ID_CONFLICT/, "must fail closed on an id collision");
    assert.match(rawSql, /HANSAN_PERMISSION_CASE_CONFLICT/, "must fail closed on a case collision");
    assert.match(rawSql, /HANSAN_PERMISSION_CATALOG_INCOMPLETE/, "must fail closed if the catalog is incomplete");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SESSION RESOLUTION — a non-canonical grant must grant nothing
// ─────────────────────────────────────────────────────────────────────────────

describe("session grant resolution is fail-closed", () => {
  function captureWarnings(run: () => void): string[] {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
    try {
      run();
    } finally {
      console.warn = original;
    }
    return warnings;
  }

  it("keeps canonical grants, deduplicates, and denies a mis-cased grant", () => {
    let resolved: string[] = [];
    const warnings = captureWarnings(() => {
      resolved = resolveCanonicalGrantPermissions(["orders.read", "orders.create", "orders.read", "ORDERS.REFUND"]);
    });
    assert.deepEqual([...resolved].sort(), ["orders.create", "orders.read"]);
    assert.equal(warnings.length, 1, "a mis-cased grant is dropped and logged, never repaired");
    assert.match(warnings[0], /ORDERS\.REFUND/);
  });

  it("drops every grant that is not in the catalog and logs it", () => {
    let resolved: string[] = [];
    const warnings = captureWarnings(() => {
      resolved = resolveCanonicalGrantPermissions(
        [
          "orders.read",
          "permission.everything",
          "developer.access.manage",
          "platform.admin.manage",
          "orders.*",
          "*.*",
          "role.manage",
          "",
          null,
          undefined,
          7,
        ],
        "staff_1"
      );
    });

    assert.deepEqual(resolved, ["orders.read"], "only the canonical grant survives");
    assert.equal(warnings.length, 10, "each dropped grant is logged exactly once");
    for (const warning of warnings) {
      assert.match(warning, /non-canonical permission grant/);
      assert.match(warning, /staff_1/, "the log names the staff so the bad row can be found");
    }
  });

  it("resolves nothing at all from an empty grant set", () => {
    assert.deepEqual(resolveCanonicalGrantPermissions([]), []);
    assert.deepEqual(resolveCanonicalGrantPermissions(new Set<string>()), []);
  });
});
