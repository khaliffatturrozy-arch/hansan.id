const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  AuthGuardError,
  requireStaff,
  requireOrganization,
  requireOutlet,
  requirePermission,
  requireRole,
  validateClientIdentity,
  buildOwnerBootstrapRecord,
  isBootstrapReplay,
} = require("./auth");

describe("auth identity foundation", () => {
  it("rejects inactive and suspended staff", () => {
    assert.throws(() => requireStaff({ status: "INACTIVE" }), /inactive|suspended/i);
    assert.throws(() => requireStaff({ status: "SUSPENDED" }), /inactive|suspended/i);
  });

  it("rejects manipulated tenant identity overrides", () => {
    const result = validateClientIdentity({
      authContext: {
        userId: "auth_1",
        email: "owner@example.com",
        staffId: "staff_1",
        organizationId: "org_1",
        outletId: "outlet_1",
        roleName: "OWNER",
        permissions: ["owner.hq.manage", "settings.manage"],
      },
      suppliedOrganizationId: "org_2",
      suppliedOutletId: "outlet_1",
      suppliedRole: "OWNER",
      suppliedPermissions: ["owner.hq.manage"],
    });

    assert.equal(result.allowed, false);
    assert.match(result.reason, /organization/i);
  });

  it("requires a valid organization and outlet context", () => {
    assert.throws(() => requireOrganization({ organizationId: null }), /organization/i);
    assert.throws(() => requireOutlet({ outletId: null }), /outlet/i);
  });

  it("enforces permission and role checks", () => {
    const context = {
      userId: "auth_1",
      email: "cashier@example.com",
      staffId: "staff_1",
      organizationId: "org_1",
      outletId: "outlet_1",
      roleName: "CASHIER",
      permissions: ["pos.view", "pos.create_order"],
    };

    assert.doesNotThrow(() => requirePermission(context, "pos.view"));
    assert.throws(() => requirePermission(context, "owner.hq.manage"), /permission/i);
    assert.doesNotThrow(() => requireRole(context, "CASHIER"));
    assert.throws(() => requireRole(context, "OWNER"), /role/i);
  });

  it("blocks unauthorized owner bootstrap and makes it idempotent", () => {
    const baseContext = {
      userId: "auth_1",
      email: "staff@example.com",
      staffId: "staff_1",
      organizationId: "org_1",
      outletId: "outlet_1",
      roleName: "STAFF",
      permissions: ["staff.view"],
    };

    assert.throws(() => buildOwnerBootstrapRecord(baseContext), /owner|eligible/i);

    const ownerContext = { ...baseContext, roleName: "OWNER", permissions: ["owner.hq.manage", "settings.manage"] };
    const record = buildOwnerBootstrapRecord(ownerContext);
    assert.equal(record.bootstrapStatus, "READY");
    assert.equal(isBootstrapReplay(record), false);

    const replay = { ...record, bootstrapStatus: "REPLAYED" };
    assert.equal(isBootstrapReplay(replay), true);
  });

  it("throws an auth guard error when the server enforces protected access", () => {
    assert.throws(() => requirePermission({
      userId: "auth_1",
      email: "ops@example.com",
      staffId: "staff_1",
      organizationId: "org_1",
      outletId: "outlet_1",
      roleName: "MANAGER",
      permissions: ["orders.read"],
    }, "orders.create"), /permission/i);

    assert.throws(() => requireOrganization({ organizationId: "" }), /organization/i);
    assert.throws(() => requireOutlet({ outletId: "" }), /outlet/i);
    assert.throws(() => requireRole({ roleName: "CASHIER" }, "OWNER"), /role/i);
  });
});
