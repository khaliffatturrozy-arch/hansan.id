export {};

/**
 * Phase C tests for the SHARED PRICING RULES.
 *
 * These test the real production module (`src/lib/pricing.ts`) that the server
 * uses to persist totals and the POS uses to display them, so a divergence is
 * caught rather than duplicated.
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { PB1_TAX_RATE, computePb1Tax, computeOrderTotals } = require("./pricing");

describe("shared pricing rules", () => {
  it("applies the fixed PB1 rate to a subtotal", () => {
    assert.equal(PB1_TAX_RATE, 0.1);
    assert.equal(computePb1Tax(90000), 9000);
    assert.equal(computePb1Tax(28000), 2800);
  });

  it("always satisfies totalAmount = subtotal + taxPb1 (database CHECK invariant)", () => {
    // The Order_total_consistency_check constraint would reject any order that
    // violates this relationship, so the shared helper must never produce one.
    for (const subtotal of [0, 1, 7, 9, 12345, 99999, 1000000]) {
      const totals = computeOrderTotals(subtotal);
      assert.equal(
        totals.totalAmount,
        totals.subtotal + totals.taxPb1,
        `invariant broken for subtotal ${subtotal}`
      );
    }
  });

  it("rounds the tax the same way for the amount the server charges", () => {
    // 3 * 0.1 = 0.30000000000000004 — a naive multiply would leak a float.
    const totals = computeOrderTotals(3);
    assert.equal(totals.subtotal, 3);
    assert.equal(totals.taxPb1, 0);
    assert.equal(totals.totalAmount, 3);
  });

  it("never produces a negative total from a hostile or malformed subtotal", () => {
    for (const input of [-500, Number.NaN, Number.POSITIVE_INFINITY, "abc", null, undefined]) {
      const totals = computeOrderTotals(input);
      assert.ok(totals.subtotal >= 0, `subtotal must be >= 0 for ${String(input)}`);
      assert.ok(totals.taxPb1 >= 0, `taxPb1 must be >= 0 for ${String(input)}`);
      assert.ok(totals.totalAmount >= 0, `totalAmount must be >= 0 for ${String(input)}`);
    }
  });
});
