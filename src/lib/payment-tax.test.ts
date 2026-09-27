export {};

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  OrderDomainService,
  PaymentService,
  TaxEngine,
  InvalidPaymentTransitionError,
  PaymentServiceError,
} = require("./transaction-core");

describe("payment and tax", () => {
  it("creates a payment and enforces idempotency", () => {
    const service = new PaymentService();
    const payment = service.createPayment({
      orderId: "order-1",
      organizationId: "org-1",
      outletId: "outlet-1",
      amount: 185000,
      currency: "IDR",
      method: "CASH",
      idempotencyKey: "cash-key-1",
      authContext: { organizationId: "org-1", outletId: "outlet-1" },
    });
    const duplicate = service.createPayment({
      orderId: "order-1",
      organizationId: "org-1",
      outletId: "outlet-1",
      amount: 185000,
      currency: "IDR",
      method: "CASH",
      idempotencyKey: "cash-key-1",
      authContext: { organizationId: "org-1", outletId: "outlet-1" },
    });

    assert.equal(payment.status, "INITIATED");
    assert.equal(duplicate.id, payment.id);
    assert.equal(duplicate.idempotencyKey, payment.idempotencyKey);
  });

  it("supports cash payments with correct change and rejects insufficient cash", () => {
    const service = new PaymentService();
    const cash = service.createPayment({
      orderId: "order-cash-1",
      organizationId: "org-1",
      outletId: "outlet-1",
      amount: 185000,
      amountReceived: 200000,
      currency: "IDR",
      method: "CASH",
      authContext: { organizationId: "org-1", outletId: "outlet-1" },
    });

    const initiated = service.initiatePayment(cash);
    const processing = service.processPayment(initiated);
    const success = service.markSuccess(processing);

    assert.equal(success.status, "SUCCESS");
    assert.equal(success.amountReceived, 200000);
    assert.equal(success.change, 15000);

    assert.throws(() => {
      service.createPayment({
        orderId: "order-cash-2",
        organizationId: "org-1",
        outletId: "outlet-1",
        amount: 185000,
        amountReceived: 100000,
        currency: "IDR",
        method: "CASH",
        authContext: { organizationId: "org-1", outletId: "outlet-1" },
      });
    }, PaymentServiceError);
  });

  it("supports mock QRIS lifecycle and expiration mapping", () => {
    const service = new PaymentService();
    const payment = service.createPayment({
      orderId: "order-qris-1",
      organizationId: "org-1",
      outletId: "outlet-1",
      amount: 150000,
      method: "QRIS",
      authContext: { organizationId: "org-1", outletId: "outlet-1" },
    });

    const pending = service.initiatePayment(payment);
    const processing = service.processPayment(pending);
    const success = service.markSuccess(processing);

    assert.equal(success.status, "SUCCESS");
    assert.equal(success.metadata.provider, "mock-qris-provider");

    const pendingQr = service.initiatePayment(service.createPayment({
      orderId: "order-qris-2",
      organizationId: "org-1",
      outletId: "outlet-1",
      amount: 90000,
      method: "QRIS",
      authContext: { organizationId: "org-1", outletId: "outlet-1" },
    }));
    const expired = service.markExpired(pendingQr);
    assert.equal(expired.status, "EXPIRED");
  });

  it("supports mock EDC lifecycle and rejection handling", () => {
    const service = new PaymentService();
    const payment = service.createPayment({
      orderId: "order-edc-1",
      organizationId: "org-1",
      outletId: "outlet-1",
      amount: 220000,
      method: "EDC",
      authContext: { organizationId: "org-1", outletId: "outlet-1" },
    });

    const processing = service.processPayment(service.initiatePayment(payment));
    const approved = service.markSuccess(processing);
    assert.equal(approved.status, "SUCCESS");

    const edcPayment = service.processPayment(
      service.initiatePayment(service.createPayment({
        orderId: "order-edc-2",
        organizationId: "org-1",
        outletId: "outlet-1",
        amount: 50000,
        method: "EDC",
        authContext: { organizationId: "org-1", outletId: "outlet-1" },
      }))
    );
    const declined = service.markFailure(edcPayment);
    assert.equal(declined.status, "FAILED");
  });

  it("keeps UNKNOWN as a valid state and rejects invalid transitions", () => {
    const service = new PaymentService();
    const payment = service.createPayment({
      orderId: "order-unknown-1",
      organizationId: "org-1",
      outletId: "outlet-1",
      amount: 120000,
      method: "QRIS",
      authContext: { organizationId: "org-1", outletId: "outlet-1" },
    });

    const unknown = service.markUnknown(service.processPayment(service.initiatePayment(payment)));
    assert.equal(unknown.status, "UNKNOWN");

    assert.throws(() => {
      service.transition(unknown, "SUCCESS");
    }, InvalidPaymentTransitionError);

    assert.throws(() => {
      service.transition(service.markSuccess(service.processPayment(service.initiatePayment(payment))), "FAILED");
    }, InvalidPaymentTransitionError);
  });

  it("queries payment status and isolates outlets", () => {
    const service = new PaymentService();
    const payment = service.createPayment({
      orderId: "order-status-1",
      organizationId: "org-acme",
      outletId: "outlet-1",
      amount: 90000,
      method: "QRIS",
      authContext: { organizationId: "org-acme", outletId: "outlet-1" },
    });

    assert.equal(service.getPaymentStatus(payment.reference).status, "INITIATED");

    assert.throws(() => {
      service.createPayment({
        orderId: "order-status-2",
        organizationId: "org-acme",
        outletId: "outlet-2",
        amount: 180000,
        method: "CASH",
        authContext: { organizationId: "org-acme", outletId: "outlet-1" },
      });
    });
  });

  it("supports tax calculation across bases and all required modes", () => {
    const subtotalTax = TaxEngine.calculate({
      subtotal: 100000,
      discount: 0,
      serviceCharge: 0,
      mode: "PERCENTAGE",
      rate: 0.1,
      appliesTo: "SUBTOTAL",
    });

    const afterDiscountTax = TaxEngine.calculate({
      subtotal: 100000,
      discount: 20000,
      serviceCharge: 0,
      mode: "PERCENTAGE",
      rate: 0.1,
      appliesTo: "AFTER_DISCOUNT",
    });

    const afterServiceTax = TaxEngine.calculate({
      subtotal: 100000,
      discount: 0,
      serviceCharge: 6000,
      mode: "PERCENTAGE",
      rate: 0.1,
      appliesTo: "AFTER_SERVICE_CHARGE",
    });

    const afterBothTax = TaxEngine.calculate({
      subtotal: 100000,
      discount: 25000,
      serviceCharge: 5000,
      mode: "PERCENTAGE",
      rate: 0.1,
      appliesTo: "AFTER_DISCOUNT_AND_SERVICE",
    });

    const fixedTax = TaxEngine.calculate({
      subtotal: 100000,
      mode: "FIXED_AMOUNT",
      fixedAmount: 1500,
      appliesTo: "SUBTOTAL",
    });

    const inclusive = TaxEngine.calculate({
      subtotal: 100000,
      mode: "PERCENTAGE",
      rate: 0.1,
      appliesTo: "SUBTOTAL",
      isInclusive: true,
    });

    assert.equal(subtotalTax, 10000);
    assert.equal(afterDiscountTax, 8000);
    assert.equal(afterServiceTax, 10600);
    assert.equal(afterBothTax, 8000);
    assert.equal(fixedTax, 1500);
    assert.equal(inclusive, 9091);
  });

  it("applies multiple tax rules and preserves a snapshot", () => {
    const result = TaxEngine.calculateOrder({
      subtotal: 100000,
      discount: 15000,
      serviceCharge: 5000,
      rules: [
        { id: "vat", name: "VAT", code: "VAT", type: "PERCENTAGE", rate: 0.1, appliesTo: "SUBTOTAL", priority: 100 },
        { id: "service-tax", name: "Service Tax", code: "STX", type: "PERCENTAGE", rate: 0.05, appliesTo: "AFTER_DISCOUNT_AND_SERVICE", priority: 200 },
      ],
    });

    assert.equal(result.taxAmount, 14500);
    assert.equal(result.snapshots[0].code, "VAT");
    assert.equal(result.snapshots[1].code, "STX");
    assert.equal(result.snapshots[0].taxableAmount, 100000);
  });

  it("integrates order total into payment and audit flow", () => {
    const service = new OrderDomainService();
    const draft = service.createDraftOrder({
      organizationId: "org-1",
      outletId: "outlet-1",
      staffId: "staff-1",
      source: "IN_STORE",
      items: [{ id: "item-1", name: "Burger", quantity: 1, unitPrice: 100000, category: "food", station: "Kitchen" }],
      taxPolicy: { type: "PERCENTAGE", rate: 0.1, appliesTo: "SUBTOTAL" },
    });

    const submitted = service.submitOrder(draft, { idempotencyKey: "order-integration-1" });
    const paymentService = new PaymentService();
    const payment = paymentService.createPayment({
      orderId: submitted.orderId,
      organizationId: "org-1",
      outletId: "outlet-1",
      amount: submitted.order.grandTotal,
      method: "CASH",
      amountReceived: submitted.order.grandTotal,
      authContext: { organizationId: "org-1", outletId: "outlet-1" },
    });

    const paid = paymentService.markSuccess(paymentService.processPayment(paymentService.initiatePayment(payment)));
    assert.equal(paid.amount, draft.grandTotal);
    assert.equal(paid.status, "SUCCESS");
  });
});
