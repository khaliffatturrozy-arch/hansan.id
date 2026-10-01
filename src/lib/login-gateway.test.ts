/**
 * HANSAN — login gateway contract tests (PURE server-logic mirror).
 *
 * The destination route (src/app/api/auth/destination/route.ts) is a thin
 * server wrapper: session → DeveloperAccess leg → Staff leg (ACTIVE +
 * canonical role) → pure resolvePostLoginDestination → path. The branching
 * rules themselves live in the pure resolver and are covered in
 * src/lib/login-destination.test.ts.
 *
 * This file pins the route's assembly contract without touching a database,
 * Supabase, or Next.js: given the two server-resolved legs the route builds,
 * the destination MUST follow, including the PLATFORM_* staff-name cases that
 * prove StaffRole vocabulary can never mint Developer access.
 *
 * No DB fixtures. No network. Relative requires only (node:test runner has no
 * `@/` alias).
 */

const gatewayAssert = require("node:assert/strict");
const { describe: gatewayDescribe, it: gatewayIt } = require("node:test");

const {
  resolvePostLoginDestination: resolveGatewayDestination,
  destinationToPath: gatewayDestinationToPath,
} = require("./login-destination");

/**
 * Mirror of the route's leg assembly (route.ts):
 * - developer leg: ACTIVE grant object, else null (resolveDeveloperAccess
 *   already returns null for unknown/inactive/suspended).
 * - staff leg: { status, roleName } only when Staff.status === "ACTIVE",
 *   roleName from resolveCanonicalRoleName; else null.
 */
function assembleRouteLegs(
  developerGrant: { status?: string | null } | null | undefined,
  staffRow: { status?: string | null; roleName?: string | null } | null | undefined
) {
  const developer = developerGrant && developerGrant.status === "ACTIVE" ? developerGrant : null;
  const staff =
    staffRow && staffRow.status === "ACTIVE"
      ? { status: staffRow.status, roleName: staffRow.roleName }
      : null;
  const destination = resolveGatewayDestination({ developer, staff });
  return { destination, path: gatewayDestinationToPath(destination) };
}

gatewayDescribe("login gateway assembly contract", () => {
  gatewayIt("ACTIVE Developer grant → DEVELOPER → /developer", () => {
    gatewayAssert.deepEqual(assembleRouteLegs({ status: "ACTIVE" }, null), {
      destination: "DEVELOPER",
      path: "/developer",
    });
  });

  gatewayIt("ACTIVE OWNER staff, no grant → OWNER → /owner", () => {
    gatewayAssert.deepEqual(
      assembleRouteLegs(null, { status: "ACTIVE", roleName: "OWNER" }),
      { destination: "OWNER", path: "/owner" }
    );
  });

  gatewayIt("ACTIVE non-OWNER staff, no grant → STAFF → /", () => {
    for (const roleName of ["CASHIER", "KITCHEN", "BAR", "FINANCE", "MANAGER", "STAFF"]) {
      gatewayAssert.deepEqual(
        assembleRouteLegs(null, { status: "ACTIVE", roleName }),
        { destination: "STAFF", path: "/" }
      );
    }
  });

  gatewayIt("inactive Developer + ACTIVE staff → staff destination", () => {
    gatewayAssert.deepEqual(
      assembleRouteLegs({ status: "SUSPENDED" }, { status: "ACTIVE", roleName: "OWNER" }),
      { destination: "OWNER", path: "/owner" }
    );
  });

  gatewayIt("ACTIVE Developer + inactive staff → DEVELOPER", () => {
    gatewayAssert.deepEqual(
      assembleRouteLegs({ status: "ACTIVE" }, { status: "SUSPENDED", roleName: "OWNER" }),
      { destination: "DEVELOPER", path: "/developer" }
    );
  });

  gatewayIt("both inactive → NO_ACCESS → /unauthorized", () => {
    gatewayAssert.deepEqual(
      assembleRouteLegs({ status: "SUSPENDED" }, { status: "INACTIVE", roleName: "OWNER" }),
      { destination: "NO_ACCESS", path: "/unauthorized" }
    );
  });

  gatewayIt("unknown user (no grant, no staff) → NO_ACCESS", () => {
    gatewayAssert.deepEqual(assembleRouteLegs(null, null), {
      destination: "NO_ACCESS",
      path: "/unauthorized",
    });
  });

  gatewayIt("Staff role PLATFORM_DEVELOPER → STAFF, never DEVELOPER", () => {
    gatewayAssert.deepEqual(
      assembleRouteLegs(null, { status: "ACTIVE", roleName: "PLATFORM_DEVELOPER" }),
      { destination: "STAFF", path: "/" }
    );
  });

  gatewayIt("Staff role PLATFORM_ADMIN → STAFF, never DEVELOPER", () => {
    gatewayAssert.deepEqual(
      assembleRouteLegs(null, { status: "ACTIVE", roleName: "PLATFORM_ADMIN" }),
      { destination: "STAFF", path: "/" }
    );
  });

  gatewayIt("client spoof fields on either leg cannot affect the destination", () => {
    const spoofedStaff = {
      status: "ACTIVE",
      roleName: "CASHIER",
      role: "OWNER",
      organizationId: "org_attacker",
      permissions: ["owner.hq.manage"],
      staffId: "staff_attacker",
      destination: "DEVELOPER",
    };
    gatewayAssert.deepEqual(assembleRouteLegs(null, spoofedStaff), {
      destination: "STAFF",
      path: "/",
    });
  });
});
