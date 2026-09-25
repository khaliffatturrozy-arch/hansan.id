const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { AuthGuardError, resolveAuthenticatedStaffContext, validateClientIdentity } = require("./auth");

describe("security guard", () => {
  const validContext = {
    userId: "user_123",
    email: "cashier@hansan.id",
    staffId: "staff_123",
    organizationId: "org_123",
    outletId: "outlet_123",
    roleName: "manager",
    permissions: ["orders.create", "orders.read"],
  };

  it("rejects unauthenticated request", async () => {
    const request = new Request("http://localhost/api/orders");

    await assert.rejects(() =>
      resolveAuthenticatedStaffContext(request, ["orders.create"])
    );
  });

  it("accepts a valid authenticated context", () => {
    const result = validateClientIdentity({
      authContext: validContext,
      suppliedOrganizationId: "org_123",
      suppliedOutletId: "outlet_123",
      suppliedRole: "manager",
      suppliedPermissions: ["orders.create"],
    });

    assert.equal(result.allowed, true);
  });

  it("rejects missing permission", () => {
    const result = validateClientIdentity({
      authContext: validContext,
      suppliedOrganizationId: "org_123",
      suppliedOutletId: "outlet_123",
      suppliedRole: "manager",
      suppliedPermissions: ["inventory.write"],
    });

    assert.equal(result.allowed, false);
    assert.equal(result.reason, "Manipulated permission payload detected.");
  });

  it("rejects different outlet", () => {
    const result = validateClientIdentity({
      authContext: validContext,
      suppliedOrganizationId: "org_123",
      suppliedOutletId: "outlet_999",
      suppliedRole: "manager",
      suppliedPermissions: ["orders.create"],
    });

    assert.equal(result.allowed, false);
    assert.equal(result.reason, "Manipulated outlet context detected.");
  });

  it("rejects different organization", () => {
    const result = validateClientIdentity({
      authContext: validContext,
      suppliedOrganizationId: "org_999",
      suppliedOutletId: "outlet_123",
      suppliedRole: "manager",
      suppliedPermissions: ["orders.create"],
    });

    assert.equal(result.allowed, false);
    assert.equal(result.reason, "Manipulated organization context detected.");
  });

  it("rejects manipulated client role", () => {
    const result = validateClientIdentity({
      authContext: validContext,
      suppliedOrganizationId: "org_123",
      suppliedOutletId: "outlet_123",
      suppliedRole: "admin",
      suppliedPermissions: ["orders.create"],
    });

    assert.equal(result.allowed, false);
    assert.equal(result.reason, "Manipulated role payload detected.");
  });

  it("rejects manipulated permission array", () => {
    const result = validateClientIdentity({
      authContext: validContext,
      suppliedOrganizationId: "org_123",
      suppliedOutletId: "outlet_123",
      suppliedRole: "manager",
      suppliedPermissions: ["orders.create", "kds.manage"],
    });

    assert.equal(result.allowed, false);
    assert.equal(result.reason, "Manipulated permission payload detected.");
  });
});
