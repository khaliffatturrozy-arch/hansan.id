export {};

/**
 * Phase C tests for the POS ORDER REQUEST BOUNDARY.
 *
 * These test the real production module `src/lib/order-request.ts`, which is the
 * only thing standing between an untrusted browser body and the order service.
 * The security-critical assertions are that client-supplied identity and pricing
 * can never survive the boundary.
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  parseCreateOrderRequest,
  extractClientIdentityClaims,
  OrderRequestError,
} = require("./order-request");

const VALID_BODY = {
  items: [{ id: "menu_1", quantity: 2 }],
  orderType: "DINE_IN",
  paymentMethod: "CASH",
  amountPaid: 100000,
  tableNumber: "A1",
  customerName: "Ayu",
};

describe("order request boundary", () => {
  it("accepts a valid cashier request and keeps the authorized fields", () => {
    const parsed = parseCreateOrderRequest(VALID_BODY);

    assert.equal(parsed.orderType, "DINE_IN");
    assert.equal(parsed.paymentMethod, "CASH");
    assert.equal(parsed.amountPaid, 100000);
    assert.equal(parsed.tableNumber, "A1");
    assert.equal(parsed.customerName, "Ayu");
    assert.deepEqual(parsed.items, [
      { menuItemId: "menu_1", quantity: 2, notes: null },
    ]);
  });

  it("strips every client-supplied identity field", () => {
    // A hostile body that tries to act as another tenant / another cashier.
    const parsed = parseCreateOrderRequest({
      ...VALID_BODY,
      organizationId: "attacker_org",
      outletId: "attacker_outlet",
      staffId: "attacker_staff",
      cashierName: "Attacker",
    });

    // The parsed contract has no field through which any of these could survive.
    assert.equal("organizationId" in parsed, false);
    assert.equal("outletId" in parsed, false);
    assert.equal("staffId" in parsed, false);
    assert.equal("cashierName" in parsed, false);
    assert.equal(JSON.stringify(parsed).includes("attacker"), false);
  });

  it("strips every client-supplied pricing field", () => {
    const parsed = parseCreateOrderRequest({
      ...VALID_BODY,
      price: 1,
      unitPrice: 1,
      subtotal: 1,
      taxPb1: 0,
      totalAmount: 1,
      changeAmount: 999999,
    });

    assert.equal("price" in parsed, false);
    assert.equal("subtotal" in parsed, false);
    assert.equal("taxPb1" in parsed, false);
    assert.equal("totalAmount" in parsed, false);
    assert.equal("changeAmount" in parsed, false);
    assert.equal(JSON.stringify(parsed).includes("999999"), false);
  });

  it("rejects a client-supplied approval code (no payment verification exists)", () => {
    const parsed = parseCreateOrderRequest({ ...VALID_BODY, approvalCode: "EDC-999999" });

    assert.equal("approvalCode" in parsed, false);
    assert.equal(JSON.stringify(parsed).includes("EDC-999999"), false);
  });

  it("surfaces identity claims separately so they can be rejected, not trusted", () => {
    const claims = extractClientIdentityClaims({
      organizationId: "attacker_org",
      outletId: "attacker_outlet",
      role: "OWNER",
      permissions: ["settings.manage"],
    });

    assert.equal(claims.suppliedOrganizationId, "attacker_org");
    assert.equal(claims.suppliedOutletId, "attacker_outlet");
    assert.equal(claims.suppliedRole, "OWNER");
    assert.deepEqual(claims.suppliedPermissions, ["settings.manage"]);

    // A body that is not an object yields no claims rather than throwing.
    assert.deepEqual(extractClientIdentityClaims(null), {});
  });

  it("rejects an order with no items", () => {
    assert.throws(() => parseCreateOrderRequest({ ...VALID_BODY, items: [] }), OrderRequestError);
    assert.throws(() => parseCreateOrderRequest({ ...VALID_BODY, items: "nope" }), OrderRequestError);
  });

  it("rejects items without a real menu id or a positive quantity", () => {
    assert.throws(
      () => parseCreateOrderRequest({ ...VALID_BODY, items: [{ id: "  ", quantity: 1 }] }),
      OrderRequestError
    );
    assert.throws(
      () => parseCreateOrderRequest({ ...VALID_BODY, items: [{ id: "menu_1", quantity: 0 }] }),
      OrderRequestError
    );
    assert.throws(
      () => parseCreateOrderRequest({ ...VALID_BODY, items: [{ id: "menu_1", quantity: -3 }] }),
      OrderRequestError
    );
  });

  it("rejects an unknown order type or payment method instead of guessing", () => {
    assert.throws(
      () => parseCreateOrderRequest({ ...VALID_BODY, orderType: "DELIVERY" }),
      OrderRequestError
    );
    assert.throws(
      () => parseCreateOrderRequest({ ...VALID_BODY, paymentMethod: "CRYPTO" }),
      OrderRequestError
    );
  });

  it("rejects a non-object body", () => {
    assert.throws(() => parseCreateOrderRequest(null), OrderRequestError);
    assert.throws(() => parseCreateOrderRequest("order"), OrderRequestError);
    assert.throws(() => parseCreateOrderRequest([VALID_BODY]), OrderRequestError);
  });
});
