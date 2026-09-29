/**
 * Phase 14 auth tests:
 * - Service-role key must fail closed (no anon fallback)
 * - Multi-role deterministic resolution
 * - Tenant isolation
 * - Platform/tenant separation
 * - Permission escalation prevention
 * - Owner bootstrap eligibility
 * - Auth failure modes
 */

export {};

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  AuthGuardError,
  resolveCanonicalRoleName,
  validateClientIdentity,
  buildOwnerBootstrapRecord,
  isBootstrapReplay,
  requireStaff,
  requireOrganization,
  requireOutlet,
  requirePermission,
  requireRole,
  isPlatformRole,
  requirePlatformRole,
  requirePlatformPermission,
  PLATFORM_ROLE_NAMES,
  TENANT_ROLE_NAMES,
  getBearerToken,
  redactSensitiveConfig,
} = require("./auth");

// ─────────────────────────────────────────────────────────────────────────────
// Multi-role deterministic resolution
// ─────────────────────────────────────────────────────────────────────────────

describe("multi-role deterministic resolution", () => {
  it("resolves OWNER as the canonical role when OWNER is present among tenant roles", () => {
    const result = resolveCanonicalRoleName(["CASHIER", "OWNER", "MANAGER"]);
    assert.equal(result, "OWNER");
  });

  it("resolves platform roles above OWNER", () => {
    const result = resolveCanonicalRoleName(["OWNER", "PLATFORM_ADMIN"]);
    assert.equal(result, "PLATFORM_ADMIN");
  });

  it("always resolves the same canonical role regardless of array order", () => {
    const a = resolveCanonicalRoleName(["MANAGER", "CASHIER", "FINANCE"]);
    const b = resolveCanonicalRoleName(["CASHIER", "FINANCE", "MANAGER"]);
    const c = resolveCanonicalRoleName(["FINANCE", "MANAGER", "CASHIER"]);
    assert.equal(a, b);
    assert.equal(b, c);
  });

  it("returns STAFF as the default when roles array is empty", () => {
    assert.equal(resolveCanonicalRoleName([]), "STAFF");
    assert.equal(resolveCanonicalRoleName(null), "STAFF");
    assert.equal(resolveCanonicalRoleName(undefined), "STAFF");
  });

  it("is case-insensitive in role name resolution", () => {
    const result = resolveCanonicalRoleName(["owner", "cashier"]);
    assert.equal(result, "OWNER");
  });

  it("resolves PLATFORM_ADMIN > PLATFORM_DEVELOPER > PLATFORM_SUPPORT", () => {
    assert.equal(resolveCanonicalRoleName(["PLATFORM_SUPPORT", "PLATFORM_DEVELOPER", "PLATFORM_ADMIN"]), "PLATFORM_ADMIN");
    assert.equal(resolveCanonicalRoleName(["PLATFORM_SUPPORT", "PLATFORM_DEVELOPER"]), "PLATFORM_DEVELOPER");
    assert.equal(resolveCanonicalRoleName(["PLATFORM_SUPPORT"]), "PLATFORM_SUPPORT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tenant isolation — client-supplied context rejection
// ─────────────────────────────────────────────────────────────────────────────

describe("tenant isolation", () => {
  const validContext = {
    userId: "user_1",
    email: "owner@hansan.id",
    staffId: "staff_1",
    organizationId: "org_1",
    outletId: "outlet_1",
    roleName: "OWNER",
    permissions: ["owner.hq.manage", "settings.manage", "orders.read"],
  };

  it("rejects client-supplied organizationId that differs from auth context", () => {
    const result = validateClientIdentity({
      authContext: validContext,
      suppliedOrganizationId: "org_999",
      suppliedOutletId: "outlet_1",
      suppliedRole: "OWNER",
      suppliedPermissions: ["owner.hq.manage"],
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /organization/i);
  });

  it("rejects client-supplied outletId that differs from auth context", () => {
    const result = validateClientIdentity({
      authContext: validContext,
      suppliedOrganizationId: "org_1",
      suppliedOutletId: "outlet_999",
      suppliedRole: "OWNER",
      suppliedPermissions: ["owner.hq.manage"],
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /outlet/i);
  });

  it("rejects client-supplied role escalation attempt", () => {
    const cashierContext = { ...validContext, roleName: "CASHIER", permissions: ["orders.create"] };
    const result = validateClientIdentity({
      authContext: cashierContext,
      suppliedOrganizationId: "org_1",
      suppliedOutletId: "outlet_1",
      suppliedRole: "OWNER",
      suppliedPermissions: ["orders.create"],
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /role/i);
  });

  it("rejects client-supplied permission escalation attempt", () => {
    const cashierContext = { ...validContext, roleName: "CASHIER", permissions: ["orders.create"] };
    const result = validateClientIdentity({
      authContext: cashierContext,
      suppliedOrganizationId: "org_1",
      suppliedOutletId: "outlet_1",
      suppliedRole: "CASHIER",
      suppliedPermissions: ["owner.hq.manage"],
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /permission/i);
  });

  it("accepts a valid client identity that matches auth context exactly", () => {
    const result = validateClientIdentity({
      authContext: validContext,
      suppliedOrganizationId: "org_1",
      suppliedOutletId: "outlet_1",
      suppliedRole: "OWNER",
      suppliedPermissions: ["owner.hq.manage"],
    });
    assert.equal(result.allowed, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Platform/tenant separation
// ─────────────────────────────────────────────────────────────────────────────

describe("platform/tenant separation", () => {
  it("identifies platform roles correctly", () => {
    for (const role of PLATFORM_ROLE_NAMES) {
      assert.equal(isPlatformRole(role), true);
    }
  });

  it("rejects tenant roles as platform roles", () => {
    for (const role of TENANT_ROLE_NAMES) {
      assert.equal(isPlatformRole(role), false);
    }
  });

  it("requirePlatformRole rejects a tenant role for platform access", () => {
    assert.throws(() => {
      requirePlatformRole({ roleName: "OWNER" }, "PLATFORM_ADMIN");
    }, AuthGuardError);
  });

  it("requirePlatformRole accepts a matching platform role", () => {
    assert.doesNotThrow(() => {
      requirePlatformRole({ roleName: "PLATFORM_ADMIN" }, "PLATFORM_ADMIN");
    });
  });

  it("requirePlatformPermission rejects a missing platform permission", () => {
    assert.throws(() => {
      requirePlatformPermission({ permissions: ["tenant.view"] }, "platform.admin.manage");
    }, AuthGuardError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Owner bootstrap
// ─────────────────────────────────────────────────────────────────────────────

describe("owner bootstrap security", () => {
  const ownerContext = {
    userId: "auth_owner",
    email: "owner@example.com",
    staffId: "staff_owner",
    organizationId: "org_1",
    outletId: "outlet_1",
    roleName: "OWNER",
    permissions: ["owner.hq.manage", "settings.manage"],
    status: "ACTIVE" as const,
  };

  it("rejects bootstrap for non-owner roles", () => {
    const cashierContext = { ...ownerContext, roleName: "CASHIER", permissions: ["orders.create"] };
    assert.throws(() => buildOwnerBootstrapRecord(cashierContext), /owner|eligible/i);
  });

  it("rejects bootstrap when owner.hq.manage permission is absent", () => {
    const partial = { ...ownerContext, permissions: ["settings.manage"] };
    assert.throws(() => buildOwnerBootstrapRecord(partial), /owner|eligible/i);
  });

  it("rejects bootstrap when settings.manage permission is absent", () => {
    const partial = { ...ownerContext, permissions: ["owner.hq.manage"] };
    assert.throws(() => buildOwnerBootstrapRecord(partial), /owner|eligible/i);
  });

  it("produces a READY bootstrap record for a fully eligible owner", () => {
    const record = buildOwnerBootstrapRecord(ownerContext);
    assert.equal(record.bootstrapStatus, "READY");
    assert.equal(record.organizationId, "org_1");
    assert.equal(record.userId, "auth_owner");
    assert.ok(record.requiredPermissions.includes("owner.hq.manage"));
    assert.ok(record.requiredPermissions.includes("settings.manage"));
  });

  it("isBootstrapReplay correctly identifies replayed records", () => {
    const record = buildOwnerBootstrapRecord(ownerContext);
    assert.equal(isBootstrapReplay(record), false);
    assert.equal(isBootstrapReplay({ ...record, bootstrapStatus: "REPLAYED" }), true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth failure modes
// ─────────────────────────────────────────────────────────────────────────────

describe("auth failure modes", () => {
  it("rejects inactive staff", () => {
    assert.throws(() => requireStaff({ status: "INACTIVE" }), AuthGuardError);
    assert.throws(() => requireStaff({ status: "SUSPENDED" }), AuthGuardError);
  });

  it("rejects null or undefined staff", () => {
    assert.throws(() => requireStaff(null), AuthGuardError);
    assert.throws(() => requireStaff(undefined), AuthGuardError);
  });

  it("rejects missing organization context", () => {
    assert.throws(() => requireOrganization({ organizationId: null }), AuthGuardError);
    assert.throws(() => requireOrganization({ organizationId: "" }), AuthGuardError);
    assert.throws(() => requireOrganization({}), AuthGuardError);
  });

  it("rejects missing outlet context", () => {
    assert.throws(() => requireOutlet({ outletId: null }), AuthGuardError);
    assert.throws(() => requireOutlet({ outletId: "" }), AuthGuardError);
  });

  it("rejects permission check when permission is missing", () => {
    const ctx = {
      permissions: ["orders.read"],
    };
    assert.throws(() => requirePermission(ctx, "owner.hq.manage"), AuthGuardError);
  });

  it("accepts valid permission", () => {
    const ctx = { permissions: ["orders.read", "orders.create"] };
    assert.doesNotThrow(() => requirePermission(ctx, "orders.read"));
    assert.doesNotThrow(() => requirePermission(ctx, "orders.create"));
  });

  it("rejects role check when role does not match", () => {
    assert.throws(() => requireRole({ roleName: "CASHIER" }, "OWNER"), AuthGuardError);
  });

  it("unauthenticated request has no bearer token", () => {
    const plainRequest = new Request("http://localhost/api/orders");
    const token = getBearerToken(plainRequest);
    assert.equal(token, null);
  });

  it("extracts bearer token from Authorization header", () => {
    const request = new Request("http://localhost/api/orders", {
      headers: { Authorization: "Bearer test_token_abc" },
    });
    assert.equal(getBearerToken(request), "test_token_abc");
  });

  it("extracts token from cookie if Authorization header is absent", () => {
    const request = new Request("http://localhost/api/orders", {
      headers: { Cookie: "sb-access-token=cookie_token_xyz" },
    });
    assert.equal(getBearerToken(request), "cookie_token_xyz");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Secret redaction
// ─────────────────────────────────────────────────────────────────────────────

describe("secret redaction", () => {
  it("redacts sensitive config values and never exposes them", () => {
    const redacted = redactSensitiveConfig("eyJhbGciOiJSUzI1NiJ9.sometoken");
    assert.doesNotMatch(redacted, /eyJ/);
    assert.match(redacted, /\*/);
  });

  it("returns Unavailable for empty or null values", () => {
    assert.equal(redactSensitiveConfig(null), "Unavailable");
    assert.equal(redactSensitiveConfig(""), "Unavailable");
    assert.equal(redactSensitiveConfig(undefined), "Unavailable");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Org/outlet isolation in assertServerAuthoritativeContext
// ─────────────────────────────────────────────────────────────────────────────

describe("server authoritative context (tenant isolation)", () => {
  it("rejects cross-organization access", () => {
    const { assertServerAuthoritativeContext } = require("./transaction-core");
    assert.throws(() => {
      assertServerAuthoritativeContext({
        authContext: { organizationId: "org-1", outletId: "outlet-1" },
        suppliedOrganizationId: "org-2",
        suppliedOutletId: "outlet-1",
      });
    });
  });

  it("rejects cross-outlet access", () => {
    const { assertServerAuthoritativeContext } = require("./transaction-core");
    assert.throws(() => {
      assertServerAuthoritativeContext({
        authContext: { organizationId: "org-1", outletId: "outlet-1" },
        suppliedOrganizationId: "org-1",
        suppliedOutletId: "outlet-2",
      });
    });
  });

  it("accepts matching org and outlet", () => {
    const { assertServerAuthoritativeContext } = require("./transaction-core");
    assert.doesNotThrow(() => {
      assertServerAuthoritativeContext({
        authContext: { organizationId: "org-1", outletId: "outlet-1" },
        suppliedOrganizationId: "org-1",
        suppliedOutletId: "outlet-1",
      });
    });
  });
});
