/**
 * HANSAN — shared order pricing rules.
 *
 * PHASE C DECISION
 * The PB1 restaurant tax rate is defined ONCE here and imported by BOTH:
 *   - the server (authoritative order persistence: src/lib/order-service.ts)
 *   - the POS (provisional on-screen total: PosCashierView)
 * so the amount shown to the cashier cannot drift from the amount the server
 * actually charges.
 *
 * THIS IS NOT A TAX ENGINE. The rate is a fixed 10% PB1 and this module invents
 * no formula. A configurable, outlet-scoped tax engine (rates, effective dating,
 * inclusive/exclusive, service charge) belongs to a later phase and is recorded
 * in docs/ARCHITECTURE-DECISIONS.md.
 *
 * The returned totals always satisfy `totalAmount === subtotal + taxPb1`, which
 * is enforced by the Order_total_consistency_check database constraint.
 */

export const PB1_TAX_RATE = 0.1;

/** Normalizes an amount to a non-negative integer IDR value. */
function normalizeAmount(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
}

export function computePb1Tax(subtotal: unknown): number {
  return Math.round(normalizeAmount(subtotal) * PB1_TAX_RATE);
}

export type OrderTotals = {
  subtotal: number;
  taxPb1: number;
  totalAmount: number;
};

export function computeOrderTotals(subtotal: unknown): OrderTotals {
  const normalizedSubtotal = normalizeAmount(subtotal);
  const taxPb1 = computePb1Tax(normalizedSubtotal);

  return {
    subtotal: normalizedSubtotal,
    taxPb1,
    totalAmount: normalizedSubtotal + taxPb1,
  };
}
