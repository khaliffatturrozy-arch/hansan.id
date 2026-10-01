/**
 * HANSAN — developer provisioning tests (PURE).
 *
 * Covers the pure helpers in ./developer-provisioning without touching a
 * database, Supabase, or real secret. No `@/` alias (node:test has none).
 * Uses unique local identifiers to avoid tsc global-scope collisions.
 */

import {
  buildDeveloperProvisionAudit,
  decideDeveloperProvision,
  DEVELOPER_PROVISION_SECRET_ENV,
  evaluateDeveloperProvisionSecretGate,
  isUniqueViolation,
  parseDeveloperProvisionBody,
} from "./developer-provisioning";

const devProvAssert = require("node:assert/strict");
const { describe: devProvDescribe, it: devProvIt } = require("node:test");
const devProvCrypto = require("node:crypto");

devProvDescribe("developer provision secret gate", () => {
  devProvIt("1. missing env secret → 500 fail-closed", () => {
    const result = evaluateDeveloperProvisionSecretGate(
      undefined, "anything", devProvCrypto.timingSafeEqual
    );
    devProvAssert.equal(result.pass, false);
    if (!result.pass) {
      devProvAssert.equal(result.status, 500);
      devProvAssert.match(result.message, /BLOCKED_EXTERNAL_DEPENDENCY/);
      devProvAssert.match(result.message, new RegExp(DEVELOPER_PROVISION_SECRET_ENV));
    }
  });

  devProvIt("1b. empty env secret → 500 fail-closed", () => {
    const result = evaluateDeveloperProvisionSecretGate(
      "", "anything", devProvCrypto.timingSafeEqual
    );
    devProvAssert.equal(result.pass, false);
    if (!result.pass) devProvAssert.equal(result.status, 500);
  });

  devProvIt("2. incorrect/absent header → generic 403, secret never echoed", () => {
    for (const header of [null, "", "wrong-secret"]) {
      const result = evaluateDeveloperProvisionSecretGate(
        "real-secret-value", header, devProvCrypto.timingSafeEqual
      );
      devProvAssert.equal(result.pass, false);
      if (!result.pass) {
        devProvAssert.equal(result.status, 403);
        devProvAssert.match(result.message, /missing or incorrect/);
        devProvAssert.doesNotMatch(result.message, /real-secret-value/);
      }
    }
  });

  devProvIt("3. correct secret → pass; dedicated name differs from OWNER secret", () => {
    const result = evaluateDeveloperProvisionSecretGate(
      "dev-secret", "dev-secret", devProvCrypto.timingSafeEqual
    );
    devProvAssert.equal(result.pass, true);
    devProvAssert.notEqual(DEVELOPER_PROVISION_SECRET_ENV, "HANSAN_PROVISION_SECRET");
  });
});

devProvDescribe("developer provision body", () => {
  devProvIt("4. email is trimmed + lowercased", () => {
    devProvAssert.deepEqual(
      parseDeveloperProvisionBody({ email: "  Dev@Example.COM  " }),
      { email: "dev@example.com" }
    );
  });

  devProvIt("5. invalid email rejected (missing/malformed/too long/non-object)", () => {
    devProvAssert.throws(() => parseDeveloperProvisionBody(null), /body/i);
    devProvAssert.throws(() => parseDeveloperProvisionBody({}), /email/i);
    devProvAssert.throws(() => parseDeveloperProvisionBody({ email: "not-an-email" }), /email/i);
    devProvAssert.throws(
      () => parseDeveloperProvisionBody({ email: "a".repeat(320) + "@x.com" }),
      /email/i
    );
  });

  devProvIt("6. authority fields are ignored, never read", () => {
    const parsed = parseDeveloperProvisionBody({
      email: "dev@example.com",
      authUserId: "attacker-id",
      isDeveloper: true,
      role: "PLATFORM_ADMIN",
      permissions: ["*"],
      organizationId: "org_x",
      outletId: "out_x",
      staffId: "staff_x",
      status: "SUSPENDED",
    });
    devProvAssert.deepEqual(parsed, { email: "dev@example.com" });
    devProvAssert.equal("authUserId" in parsed, false);
    devProvAssert.equal("status" in parsed, false);
  });
});

devProvDescribe("developer provision idempotency", () => {
  devProvIt("7. ACTIVE grant → EXISTS (no write)", () => {
    devProvAssert.deepEqual(decideDeveloperProvision({ status: "ACTIVE" }), { outcome: "EXISTS" });
  });

  devProvIt("8. SUSPENDED (or any non-ACTIVE) grant → SUSPENDED, never auto-heal", () => {
    devProvAssert.deepEqual(decideDeveloperProvision({ status: "SUSPENDED" }), { outcome: "SUSPENDED" });
    devProvAssert.deepEqual(decideDeveloperProvision({ status: "INACTIVE" }), { outcome: "SUSPENDED" });
    devProvAssert.deepEqual(decideDeveloperProvision({ status: "whatever" }), { outcome: "SUSPENDED" });
  });

  devProvIt("9. absent grant → CREATE with ACTIVE semantics", () => {
    devProvAssert.deepEqual(decideDeveloperProvision(null), { outcome: "CREATE" });
    devProvAssert.deepEqual(decideDeveloperProvision(undefined), { outcome: "CREATE" });
  });

  devProvIt("11. race: P2002 detected without leaking details", () => {
    devProvAssert.equal(isUniqueViolation({ code: "P2002" }), true);
    devProvAssert.equal(isUniqueViolation({ code: "P2001" }), false);
    devProvAssert.equal(isUniqueViolation(new Error("boom")), false);
  });
});

devProvDescribe("developer provision audit", () => {
  devProvIt("10. audit: tenant fields null, bootstrap attribution, no secrets", () => {
    const audit = buildDeveloperProvisionAudit("grant_1", "auth_1", "dev@example.com");
    devProvAssert.equal(audit.entityType, "DEVELOPER_ACCESS");
    devProvAssert.equal(audit.entityId, "grant_1");
    devProvAssert.equal(audit.action, "DEVELOPER_PROVISIONED");
    devProvAssert.equal(audit.actorUserId, "auth_1");
    devProvAssert.equal(audit.actorStaffId, null);
    devProvAssert.equal(audit.organizationId, null);
    devProvAssert.equal(audit.outletId, null);
    devProvAssert.deepEqual(audit.metadata, {
      provisionedVia: "developer-provision-secret",
      email: "dev@example.com",
      authUserId: "auth_1",
    });
    const serialized = JSON.stringify(audit.metadata);
    // Metadata must never carry credential material. The fixed
    // `provisionedVia` label is an auditable method marker, not a secret.
    devProvAssert.doesNotMatch(serialized, /password|access[_-]?token|refresh[_-]?token|service-role|api[_-]?key/i);
    devProvAssert.equal(audit.metadata.provisionedVia, "developer-provision-secret");
  });
});
