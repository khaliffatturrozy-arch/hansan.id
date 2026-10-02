export {};

/**
 * Phase C.1 tests for the staff provisioning RULES.
 *
 * These exercise the real production module `src/lib/staff-provisioning.ts` —
 * the pure authorization, tenant-isolation and request-parsing layer used by
 * /api/staff. No database, no Supabase and no fixtures are involved, so no
 * data is written to the production database.
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  STAFF_MANAGEMENT_ROLE,
  STAFF_MANAGEMENT_PERMISSION,
  StaffProvisioningError,
  parseCreateStaffRequest,
  parseStaffUpdateRequest,
  requireRoleInOrganization,
  requireOutletInOrganization,
  assertCanManageStaff,
  canManageStaff,
  holdsOwnerRole,
  decideActiveOwnerRetention,
  assertActiveOwnerRetention,
} = require("./staff-provisioning");

/**
 * Asserts the HTTP status the guard produces. (The class identity is asserted
 * separately with `assert.throws(..., StaffProvisioningError)`.)
 */
function hasStatus(error: unknown, status: number): boolean {
  const candidate = error as { statusCode?: number } | null;
  return candidate?.statusCode === status;
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

const VALID_BODY = {
  firstName: "Rani",
  lastName: "Putri",
  email: "Rani.Putri@Example.com",
  roleId: "role_1",
  outletId: "outlet_1",
};

describe("staff request parsing", () => {
  it("keeps only the OWNER-supplied fields", () => {
    const parsed = parseCreateStaffRequest(VALID_BODY);
    assert.equal(parsed.firstName, "Rani");
    assert.equal(parsed.lastName, "Putri");
    assert.equal(parsed.roleId, "role_1");
    assert.equal(parsed.outletId, "outlet_1");
  });

  it("never accepts organization, creator, status or permissions from the client", () => {
    const parsed = parseCreateStaffRequest({
      ...VALID_BODY,
      organizationId: "attacker_org",
      creatorId: "attacker_staff",
      actorStaffId: "attacker_staff",
      status: "SUSPENDED",
      permissions: ["platform.admin"],
    });

    for (const key of ["organizationId", "creatorId", "actorStaffId", "status", "permissions"]) {
      assert.equal(key in parsed, false, `${key} must not be accepted`);
    }
    assert.equal(JSON.stringify(parsed).includes("attacker"), false);
  });

  it("normalises the email so case cannot create a duplicate identity", () => {
    // Staff.email is globally unique, and Supabase treats emails case-insensitively.
    assert.equal(parseCreateStaffRequest(VALID_BODY).email, "rani.putri@example.com");
  });

  it("rejects missing or invalid fields", () => {
    assert.throws(() => parseCreateStaffRequest({ ...VALID_BODY, firstName: "" }), StaffProvisioningError);
    assert.throws(() => parseCreateStaffRequest({ ...VALID_BODY, email: "not-an-email" }), StaffProvisioningError);
    assert.throws(() => parseCreateStaffRequest({ ...VALID_BODY, roleId: "  " }), StaffProvisioningError);
    assert.throws(() => parseCreateStaffRequest({ ...VALID_BODY, outletId: undefined }), StaffProvisioningError);
    assert.throws(() => parseCreateStaffRequest(null), StaffProvisioningError);
    assert.throws(() => parseCreateStaffRequest([VALID_BODY]), StaffProvisioningError);
  });

  it("allows an omitted last name", () => {
    assert.equal(parseCreateStaffRequest({ ...VALID_BODY, lastName: "" }).lastName, null);
  });
});

describe("role tenant isolation", () => {
  it("returns the role when it belongs to the caller's organization", () => {
    const role = { id: "role_1", organizationId: "org_1", isPlatform: false };
    assert.equal(requireRoleInOrganization(role, "org_1"), role);
  });

  it("rejects a role owned by another organization", () => {
    assert.throws(
      () =>
        requireRoleInOrganization(
          { id: "role_x", organizationId: "org_2", isPlatform: false },
          "org_1"
        ),
      (error: unknown) => hasStatus(error, 403)
    );
  });

  it("rejects a platform role so a tenant cannot mint platform authority", () => {
    assert.throws(
      () =>
        requireRoleInOrganization(
          { id: "role_p", organizationId: null, isPlatform: true },
          "org_1"
        ),
      (error: unknown) => hasStatus(error, 403)
    );
  });

  it("rejects an unknown role with 404", () => {
    assert.throws(
      () => requireRoleInOrganization(null, "org_1"),
      (error: unknown) => hasStatus(error, 404)
    );
  });
});

describe("outlet tenant isolation", () => {
  it("returns the outlet when it belongs to the caller's organization", () => {
    const outlet = { id: "outlet_1", organizationId: "org_1" };
    assert.equal(requireOutletInOrganization(outlet, "org_1"), outlet);
  });

  it("rejects an outlet owned by another organization", () => {
    assert.throws(
      () => requireOutletInOrganization({ id: "outlet_x", organizationId: "org_2" }, "org_1"),
      (error: unknown) => hasStatus(error, 403)
    );
  });

  it("rejects a missing outlet and a missing organization", () => {
    assert.throws(
      () => requireOutletInOrganization(null, "org_1"),
      (error: unknown) => hasStatus(error, 404)
    );
    assert.throws(
      () => requireOutletInOrganization({ id: "o", organizationId: "org_1" }, ""),
      StaffProvisioningError
    );
  });
});

describe("OWNER-only authorization", () => {
  it("uses the existing OWNER role and settings.manage permission", () => {
    // No new permission was invented.
    assert.equal(STAFF_MANAGEMENT_ROLE, "OWNER");
    assert.equal(STAFF_MANAGEMENT_PERMISSION, "settings.manage");
  });

  it("allows an ACTIVE owner with the permission", () => {
    assert.doesNotThrow(() => assertCanManageStaff(OWNER_CONTEXT));
  });

  it("rejects a non-OWNER role", () => {
    assert.throws(
      () => assertCanManageStaff({ ...OWNER_CONTEXT, roleName: "CASHIER" }),
      (error: unknown) => hasStatus(error, 403)
    );
  });

  it("rejects a creator without the settings.manage permission", () => {
    assert.throws(
      () => assertCanManageStaff({ ...OWNER_CONTEXT, permissions: ["orders.read"] }),
      (error: unknown) => hasStatus(error, 403)
    );
  });

  it("rejects an inactive or suspended creator", () => {
    for (const status of ["INACTIVE", "SUSPENDED"]) {
      assert.throws(
        () => assertCanManageStaff({ ...OWNER_CONTEXT, status }),
        (error: unknown) => hasStatus(error, 403),
        `status ${status} must be rejected`
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 16 — PATCH /api/staff REQUEST (status XOR role change)
// ─────────────────────────────────────────────────────────────────────────────

describe("staff update request parsing", () => {
  it("parses a status change", () => {
    const parsed = parseStaffUpdateRequest({ staffId: "staff_1", status: "INACTIVE" });
    assert.deepEqual(parsed, { kind: "status", staffId: "staff_1", status: "INACTIVE" });
  });

  it("parses a role change", () => {
    const parsed = parseStaffUpdateRequest({ staffId: "staff_1", roleId: "role_cashier" });
    assert.deepEqual(parsed, { kind: "role", staffId: "staff_1", roleId: "role_cashier" });
  });

  it("rejects a request that supplies BOTH status and roleId (no implicit precedence)", () => {
    assert.throws(
      () => parseStaffUpdateRequest({ staffId: "staff_1", status: "ACTIVE", roleId: "role_1" }),
      (error: unknown) => hasStatus(error, 400)
    );
  });

  it("rejects a request that supplies neither", () => {
    assert.throws(
      () => parseStaffUpdateRequest({ staffId: "staff_1" }),
      (error: unknown) => hasStatus(error, 400)
    );
  });

  it("requires staffId and bounds its length", () => {
    assert.throws(
      () => parseStaffUpdateRequest({ status: "ACTIVE" }),
      (error: unknown) => hasStatus(error, 400)
    );
    assert.throws(
      () => parseStaffUpdateRequest({ staffId: "x".repeat(121), status: "ACTIVE" }),
      (error: unknown) => hasStatus(error, 400)
    );
  });

  it("bounds the roleId length", () => {
    assert.throws(
      () => parseStaffUpdateRequest({ staffId: "staff_1", roleId: "r".repeat(121) }),
      (error: unknown) => hasStatus(error, 400)
    );
  });

  it("leaves status validation to the status flow and rejects malformed payloads", () => {
    // A whitespace status is not a role change and not a usable status: the
    // parser refuses it before any service runs.
    assert.throws(
      () => parseStaffUpdateRequest({ staffId: "staff_1", status: "   " }),
      (error: unknown) => hasStatus(error, 400)
    );
    assert.throws(() => parseStaffUpdateRequest(null), StaffProvisioningError);
    assert.throws(() => parseStaffUpdateRequest([{ staffId: "s" }]), StaffProvisioningError);
  });

  it("never accepts identity or authority fields from the client", () => {
    const parsed = parseStaffUpdateRequest({
      staffId: "staff_1",
      roleId: "role_cashier",
      organizationId: "attacker_org",
      actorStaffId: "attacker_staff",
      permissions: ["platform.admin"],
      isPlatform: true,
    });

    // The parsed result is a closed union: only staffId + roleId exist.
    assert.deepEqual(Object.keys(parsed).sort(), ["kind", "roleId", "staffId"]);
    assert.equal(JSON.stringify(parsed).includes("attacker"), false);
    assert.equal(JSON.stringify(parsed).includes("platform"), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 16 — S2: the page gate and the API gate must agree
// ─────────────────────────────────────────────────────────────────────────────

describe("canManageStaff parity with assertCanManageStaff", () => {
  it("agrees with the API guard for every status / role / permission combination", () => {
    const statuses = ["ACTIVE", "INACTIVE", "SUSPENDED", "", " active "];
    const roles = ["OWNER", "CASHIER", "owner", ""];
    const permissionSets = [
      ["settings.manage", "orders.read"],
      ["orders.read"],
      [],
      ["SETTINGS.MANAGE"],
      [" settings.manage "],
    ];

    for (const status of statuses) {
      for (const roleName of roles) {
        for (const permissions of permissionSets) {
          const context = { ...OWNER_CONTEXT, status, roleName, permissions };

          let apiAllows = true;
          try {
            assertCanManageStaff(context);
          } catch {
            apiAllows = false;
          }

          const pageAllows = canManageStaff({
            status,
            roleNames: [roleName],
            permissions,
          });

          assert.equal(
            pageAllows,
            apiAllows,
            `parity failed for status=${JSON.stringify(status)} role=${JSON.stringify(roleName)} permissions=${JSON.stringify(permissions)}`
          );
        }
      }
    }
  });

  it("returns true for an ACTIVE owner among several roles holding the permission", () => {
    assert.equal(
      canManageStaff({
        status: "ACTIVE",
        roleNames: ["CASHIER", "OWNER"],
        permissions: ["orders.read", "settings.manage"],
      }),
      true
    );
  });

  it("returns false when the permission is missing even for an owner", () => {
    assert.equal(
      canManageStaff({ status: "ACTIVE", roleNames: ["OWNER"], permissions: ["orders.read"] }),
      false
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 16 — LAST ACTIVE OWNER INVARIANT (administrative lockout protection)
// ─────────────────────────────────────────────────────────────────────────────

describe("holdsOwnerRole", () => {
  it("matches OWNER case-insensitively and rejects everything else", () => {
    assert.equal(holdsOwnerRole(["OWNER"]), true);
    assert.equal(holdsOwnerRole(["cashier", "owner"]), true);
    assert.equal(holdsOwnerRole([" owner "]), true);
    assert.equal(holdsOwnerRole(["OWNERS"]), false);
    assert.equal(holdsOwnerRole(["CASHIER"]), false);
    assert.equal(holdsOwnerRole([]), false);
    assert.equal(holdsOwnerRole(["", null, undefined, 7]), false);
  });
});

describe("last active OWNER retention", () => {
  it("allows every operation that does not touch an ACTIVE OWNER", () => {
    // Target is not an active owner at all (e.g. an INACTIVE OWNER, or any
    // non-OWNER staff): nothing to protect.
    assert.equal(
      decideActiveOwnerRetention({
        targetIsActiveOwner: false,
        targetRetainsActiveOwner: false,
        otherActiveOwnerCount: 0,
      }).ok,
      true
    );
  });

  it("allows an operation where the target remains an ACTIVE OWNER (OWNER → OWNER)", () => {
    assert.equal(
      decideActiveOwnerRetention({
        targetIsActiveOwner: true,
        targetRetainsActiveOwner: true,
        otherActiveOwnerCount: 0,
      }).ok,
      true
    );
  });

  it("allows stripping an ACTIVE OWNER when at least one OTHER active owner remains", () => {
    assert.equal(
      decideActiveOwnerRetention({
        targetIsActiveOwner: true,
        targetRetainsActiveOwner: false,
        otherActiveOwnerCount: 1,
      }).ok,
      true
    );
  });

  it("rejects stripping the LAST active owner with 409", () => {
    const verdict = decideActiveOwnerRetention({
      targetIsActiveOwner: true,
      targetRetainsActiveOwner: false,
      otherActiveOwnerCount: 0,
    });
    assert.equal(verdict.ok, false);
    if (!verdict.ok) {
      assert.equal(verdict.status, 409);
      assert.match(verdict.message, /OWNER/i);
    }
  });

  it("throws a 409 StaffProvisioningError through the assert form", () => {
    assert.throws(
      () =>
        assertActiveOwnerRetention({
          targetIsActiveOwner: true,
          targetRetainsActiveOwner: false,
          otherActiveOwnerCount: 0,
        }),
      (error: unknown) =>
        error instanceof StaffProvisioningError && hasStatus(error, 409)
    );

    assert.doesNotThrow(() =>
      assertActiveOwnerRetention({
        targetIsActiveOwner: true,
        targetRetainsActiveOwner: false,
        otherActiveOwnerCount: 1,
      })
    );
  });
});
