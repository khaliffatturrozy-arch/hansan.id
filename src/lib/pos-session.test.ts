export {};

/**
 * Phase C tests for the POS SESSION / TENANT CONTEXT CONTRACT.
 *
 * These exercise the real guards in `src/lib/auth.ts` that decide how a browser
 * request is authenticated and how an outlet-bound action is authorized.
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { getBearerToken, requireOutlet, requireOrganization, validateClientIdentity, AuthGuardError } =
  require("./auth");

describe("POS session transport", () => {
  it("returns no token for a same-origin request with no Authorization header", () => {
    // This is exactly the browser POS request shape: the session lives in the
    // Supabase SSR cookie, which is resolved server-side, not in a header.
    assert.equal(getBearerToken(new Request("http://localhost/api/menu")), null);
  });

  it("returns the token from an explicit bearer header (API clients)", () => {
    const request = new Request("http://localhost/api/orders", {
      headers: { Authorization: "Bearer test_token_abc" },
    });
    assert.equal(getBearerToken(request), "test_token_abc");
  });

  it("no longer treats legacy cookie names as a bearer token", () => {
    // PHASE C: those names never matched @supabase/ssr cookies, so the fallback
    // could never authenticate. Cookies are resolved by resolveSessionUser().
    for (const name of ["sb-access-token", "supabase-auth-token", "sb-auth-token"]) {
      const request = new Request("http://localhost/api/orders", {
        headers: { Cookie: `${name}=cookie_token_xyz` },
      });
      assert.equal(getBearerToken(request), null, `${name} must not be read as a token`);
    }
  });
});

describe("outlet-bound authorization", () => {
  it("rejects a staff member with no assigned outlet instead of using an empty id", () => {
    assert.throws(() => requireOutlet({ outletId: null }), AuthGuardError);
    assert.throws(() => requireOutlet({ outletId: "" }), /outlet/i);
    assert.throws(() => requireOutlet({ outletId: undefined }), /outlet/i);
  });

  it("returns the authenticated outlet when one is assigned", () => {
    assert.equal(requireOutlet({ outletId: "outlet_1" }), "outlet_1");
  });

  it("still requires a real organization", () => {
    assert.throws(() => requireOrganization({ organizationId: null }), /organization/i);
  });
});

describe("client identity cannot override the server context", () => {
  const context = {
    userId: "auth_1",
    email: "cashier@example.com",
    staffId: "staff_1",
    organizationId: "org_1",
    outletId: "outlet_1",
    roleName: "CASHIER",
    permissions: ["orders.read", "orders.create"],
  };

  it("rejects a body claiming another organization", () => {
    const result = validateClientIdentity({
      authContext: context,
      suppliedOrganizationId: "attacker_org",
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /organization/i);
  });

  it("rejects a body claiming another outlet", () => {
    const result = validateClientIdentity({
      authContext: context,
      suppliedOutletId: "attacker_outlet",
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /outlet/i);
  });

  it("rejects a body escalating role or permissions", () => {
    assert.equal(
      validateClientIdentity({ authContext: context, suppliedRole: "OWNER" }).allowed,
      false
    );
    assert.equal(
      validateClientIdentity({
        authContext: context,
        suppliedPermissions: ["settings.manage"],
      }).allowed,
      false
    );
  });

  it("accepts a body that omits identity entirely, and one that matches", () => {
    assert.equal(validateClientIdentity({ authContext: context }).allowed, true);
    assert.equal(
      validateClientIdentity({
        authContext: context,
        suppliedOrganizationId: "org_1",
        suppliedOutletId: "outlet_1",
      }).allowed,
      true
    );
  });

  it("rejects any claimed outlet when the staff has none", () => {
    const outletless = { ...context, outletId: null };
    const result = validateClientIdentity({
      authContext: outletless,
      suppliedOutletId: "outlet_1",
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /outlet/i);
  });
});
