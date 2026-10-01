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
  requireRoleInOrganization,
  requireOutletInOrganization,
  assertCanManageStaff,
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
