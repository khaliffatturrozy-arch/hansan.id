/**
 * Focused tests for the HANSAN_PROVISION_SECRET gate on POST /api/auth/provision.
 *
 * These tests exercise the secret gate logic in isolation using the same
 * constant-time comparison approach as the route, without touching the database
 * or Supabase. They validate three cases:
 *   1. Missing env var → 500 BLOCKED_EXTERNAL_DEPENDENCY
 *   2. Correct env var + wrong/missing header secret → 403
 *   3. Correct env var + correct header secret → gate passes (proceeds to JWT check)
 */

export {};

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const crypto = require("node:crypto");

// ─────────────────────────────────────────────────────────────────────────────
// Inline the exact secret-gate logic from the route so tests are deterministic
// and do not require a running Next.js server or database.
// ─────────────────────────────────────────────────────────────────────────────

type GateResult =
  | { pass: true }
  | { pass: false; status: 500 | 403; message: string };

function evaluateProvisionSecretGate(
  envSecret: string | undefined,
  headerSecret: string | null
): GateResult {
  // Mirror the exact logic from the route — no shortcuts.
  if (!envSecret) {
    return {
      pass: false,
      status: 500,
      message: "BLOCKED_EXTERNAL_DEPENDENCY: HANSAN_PROVISION_SECRET is not configured.",
    };
  }

  const secretMatch = (() => {
    if (!headerSecret) return false;
    const a = Buffer.from(envSecret, "utf8");
    const b = Buffer.from(headerSecret, "utf8");
    if (a.length !== b.length) {
      const dummy = Buffer.alloc(a.length);
      crypto.timingSafeEqual(a, dummy);
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  })();

  if (!secretMatch) {
    return { pass: false, status: 403, message: "Provision secret is missing or incorrect." };
  }

  return { pass: true };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("provision secret gate", () => {
  it("returns 500 when HANSAN_PROVISION_SECRET env var is missing", () => {
    const result = evaluateProvisionSecretGate(undefined, "any-value");
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.equal(result.status, 500);
      assert.match(result.message, /BLOCKED_EXTERNAL_DEPENDENCY/i);
      assert.match(result.message, /HANSAN_PROVISION_SECRET/i);
    }
  });

  it("returns 500 when HANSAN_PROVISION_SECRET env var is empty string", () => {
    const result = evaluateProvisionSecretGate("", "any-value");
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.equal(result.status, 500);
    }
  });

  it("returns 403 when X-Provision-Secret header is absent", () => {
    const result = evaluateProvisionSecretGate("correct-secret", null);
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.equal(result.status, 403);
      assert.match(result.message, /missing or incorrect/i);
    }
  });

  it("returns 403 when X-Provision-Secret header is wrong", () => {
    const result = evaluateProvisionSecretGate("correct-secret", "wrong-secret");
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.equal(result.status, 403);
      assert.match(result.message, /missing or incorrect/i);
    }
  });

  it("returns 403 when header secret is a prefix of the real secret", () => {
    const result = evaluateProvisionSecretGate("correct-secret-long", "correct-secret");
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.equal(result.status, 403);
    }
  });

  it("returns 403 when header secret is a superset of the real secret", () => {
    const result = evaluateProvisionSecretGate("secret", "secret-extra");
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.equal(result.status, 403);
    }
  });

  it("returns 403 when header secret differs only by case", () => {
    const result = evaluateProvisionSecretGate("MySecret", "mysecret");
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.equal(result.status, 403);
    }
  });

  it("returns 403 when header secret is an empty string", () => {
    const result = evaluateProvisionSecretGate("correct-secret", "");
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.equal(result.status, 403);
    }
  });

  it("passes when env secret and header secret match exactly", () => {
    const result = evaluateProvisionSecretGate("correct-secret", "correct-secret");
    assert.equal(result.pass, true);
  });

  it("passes for a long high-entropy secret that matches exactly", () => {
    const secret = "hsp_v1_aB3xZ9qR2kM7nL4wT6yU1cE8dF0gH5jI";
    const result = evaluateProvisionSecretGate(secret, secret);
    assert.equal(result.pass, true);
  });

  it("never returns the secret value in the error message", () => {
    const secret = "my-very-secret-token";
    const result = evaluateProvisionSecretGate(secret, "wrong");
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.doesNotMatch(result.message, /my-very-secret-token/);
    }
  });
});
