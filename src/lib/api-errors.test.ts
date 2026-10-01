export {};

/**
 * Phase C tests for the SAFE API ERROR BOUNDARY.
 *
 * Verifies that the client never receives Prisma/Supabase/infrastructure detail
 * or a stack trace, and that genuine client errors still reach the caller.
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { toSafeApiError } = require("./api-errors");

describe("safe API errors", () => {
  it("returns our own client-safe message with its status and code", () => {
    const { status, body } = toSafeApiError(
      Object.assign(new Error("Menu item tidak ditemukan untuk ID abc."), { statusCode: 400 }),
      "fallback"
    );

    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.error, "Menu item tidak ditemukan untuk ID abc.");
    assert.equal(body.code, "INVALID_REQUEST");
  });

  it("hides internal detail even when the error carries a status code", () => {
    const { status, body } = toSafeApiError(
      Object.assign(
        new Error("BLOCKED_EXTERNAL_DEPENDENCY: DATABASE_URL is not configured."),
        { statusCode: 500 }
      ),
      "Gagal membuat order."
    );

    assert.equal(status, 500);
    assert.equal(body.error, "Gagal membuat order.");
    assert.equal(body.code, "INTERNAL_ERROR");
  });

  it("never leaks a database connection string", () => {
    const { body } = toSafeApiError(
      Object.assign(new Error("Can't reach database server at postgresql://user:pass@host:5432/db"), {
        statusCode: 500,
      }),
      "Gagal membuat order."
    );

    assert.equal(body.error.includes("postgresql://"), false);
    assert.equal(body.error.includes("pass"), false);
  });

  it("treats an unknown error as a 500 rather than echoing it", () => {
    const { status, body } = toSafeApiError(
      new Error("Unique constraint failed on the field: `idempotencyKey`"),
      "Gagal membuat order."
    );

    assert.equal(status, 500);
    assert.equal(body.error, "Gagal membuat order.");
  });

  it("never exposes a stack trace or an unexpected shape", () => {
    const { body } = toSafeApiError(
      new Error("boom\n    at Object.<anonymous> (/app/src/lib/thing.ts:12:5)"),
      "Gagal membuat order."
    );

    assert.equal(body.ok, false);
    assert.equal(typeof body.error, "string");
    assert.equal(body.error.includes("at Object"), false);
    assert.deepEqual(Object.keys(body).sort(), ["code", "error", "ok"]);
  });

  it("maps a permission denial to 403 FORBIDDEN", () => {
    const { status, body } = toSafeApiError(
      Object.assign(new Error("Permission denied."), { statusCode: 403 }),
      "fallback"
    );

    assert.equal(status, 403);
    assert.equal(body.code, "FORBIDDEN");
  });
});
