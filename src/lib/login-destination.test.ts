/**
 * HANSAN — login destination resolver tests (PURE).
 *
 * No database fixtures. No Supabase connection. No network.
 * Loaded directly by the node:test runner (`npm test`), so this file uses
 * `require` with a relative path — the `@/` alias is not resolved there.
 */

const assertStrict = require("node:assert/strict");
const { describe: nodeDescribe, it: nodeIt } = require("node:test");

const {
  resolvePostLoginDestination,
  destinationToPath,
} = require("./login-destination");

nodeDescribe("resolvePostLoginDestination", () => {
  nodeIt("1. ACTIVE developer → DEVELOPER", () => {
    assertStrict.equal(
      resolvePostLoginDestination({
        developer: { status: "ACTIVE" },
        staff: null,
      }),
      "DEVELOPER"
    );
  });

  nodeIt("2. ACTIVE OWNER staff (no developer grant) → OWNER", () => {
    assertStrict.equal(
      resolvePostLoginDestination({
        developer: null,
        staff: { status: "ACTIVE", roleName: "OWNER" },
      }),
      "OWNER"
    );
  });

  nodeIt("3. ACTIVE normal staff (no developer grant) → STAFF", () => {
    assertStrict.equal(
      resolvePostLoginDestination({
        developer: null,
        staff: { status: "ACTIVE", roleName: "CASHIER" },
      }),
      "STAFF"
    );
  });

  nodeIt("4. inactive developer + ACTIVE staff → staff destination (OWNER)", () => {
    assertStrict.equal(
      resolvePostLoginDestination({
        developer: { status: "SUSPENDED" },
        staff: { status: "ACTIVE", roleName: "OWNER" },
      }),
      "OWNER"
    );
  });

  nodeIt("4b. inactive developer + ACTIVE normal staff → STAFF", () => {
    assertStrict.equal(
      resolvePostLoginDestination({
        developer: { status: "INACTIVE" },
        staff: { status: "ACTIVE", roleName: "MANAGER" },
      }),
      "STAFF"
    );
  });

  nodeIt("5. ACTIVE developer + inactive staff → DEVELOPER", () => {
    assertStrict.equal(
      resolvePostLoginDestination({
        developer: { status: "ACTIVE" },
        staff: { status: "SUSPENDED", roleName: "OWNER" },
      }),
      "DEVELOPER"
    );
  });

  nodeIt("6. inactive developer + inactive staff → NO_ACCESS", () => {
    assertStrict.equal(
      resolvePostLoginDestination({
        developer: { status: "SUSPENDED" },
        staff: { status: "INACTIVE", roleName: "OWNER" },
      }),
      "NO_ACCESS"
    );
  });

  nodeIt("7. unknown user (no developer grant, no staff) → NO_ACCESS", () => {
    assertStrict.equal(
      resolvePostLoginDestination({ developer: null, staff: null }),
      "NO_ACCESS"
    );
    assertStrict.equal(
      resolvePostLoginDestination({ developer: undefined, staff: undefined }),
      "NO_ACCESS"
    );
  });

  nodeIt("8. tenant role named PLATFORM_DEVELOPER cannot become DEVELOPER", () => {
    // A tenant Staff row carrying a platform-sounding role name is still
    // tenant staff. Only a live DeveloperAccess record grants DEVELOPER.
    assertStrict.equal(
      resolvePostLoginDestination({
        developer: null,
        staff: { status: "ACTIVE", roleName: "PLATFORM_DEVELOPER" },
      }),
      "STAFF"
    );
    assertStrict.equal(
      resolvePostLoginDestination({
        developer: null,
        staff: { status: "ACTIVE", roleName: "PLATFORM_ADMIN" },
      }),
      "STAFF"
    );
  });

  nodeIt("9. arbitrary client-like fields cannot influence the destination", () => {
    // The resolver signature accepts only { developer, staff } server records.
    // Extra fields smuggled alongside them are ignored, not read.
    const spoofed = {
      developer: null,
      staff: { status: "ACTIVE", roleName: "CASHIER" },
      role: "PLATFORM_ADMIN",
      organizationId: "org_attacker",
      permissions: ["developer.*"],
      staffId: "staff_attacker",
    };
    assertStrict.equal(resolvePostLoginDestination(spoofed), "STAFF");

    const spoofedOwner = {
      developer: null,
      staff: { status: "ACTIVE", roleName: "CASHIER" },
      role: "OWNER",
    };
    assertStrict.equal(resolvePostLoginDestination(spoofedOwner), "STAFF");
  });

  nodeIt("9b. lowercase/whitespace statuses and roles are normalized, unknowns rejected", () => {
    assertStrict.equal(
      resolvePostLoginDestination({
        developer: { status: "  active " },
        staff: null,
      }),
      "DEVELOPER"
    );
    assertStrict.equal(
      resolvePostLoginDestination({
        developer: null,
        staff: { status: "active", roleName: " owner " },
      }),
      "OWNER"
    );
    assertStrict.equal(
      resolvePostLoginDestination({
        developer: { status: "BOGUS" },
        staff: { status: "BOGUS", roleName: "OWNER" },
      }),
      "NO_ACCESS"
    );
  });
});

nodeDescribe("destinationToPath", () => {
  nodeIt("10. mapping is centralized and correct", () => {
    assertStrict.equal(destinationToPath("DEVELOPER"), "/developer");
    assertStrict.equal(destinationToPath("OWNER"), "/owner");
    assertStrict.equal(destinationToPath("STAFF"), "/");
    assertStrict.equal(destinationToPath("NO_ACCESS"), "/unauthorized");
  });
});
