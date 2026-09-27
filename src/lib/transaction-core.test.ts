const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  OrderDomainService,
  InvalidOrderTransitionError,
  assertServerAuthoritativeContext,
  KdsRouter,
  TaxEngine,
  PaymentService,
  MockPaymentAdapter,
  InventoryEventBuilder,
  AuditLogger,
} = require("./transaction-core");

describe("transaction core", () => {
  it("creates a draft order with snapshot-safe totals", () => {
    const service = new OrderDomainService();
    const draft = service.createDraftOrder({
      organizationId: "org-1",
      outletId: "outlet-1",
      staffId: "staff-1",
      source: "IN_STORE",
      tableNumber: "A1",
      customerName: "Ayu",
      items: [
        {
          id: "item-1",
          name: "Hansan Latte",
          quantity: 2,
          unitPrice: 30000,
          modifierPrice: 2000,
          category: "coffee",
          station: "Kitchen",
        },
      ],
      discount: 5000,
      serviceCharge: 1500,
      taxPolicy: {
        type: "PERCENTAGE",
        rate: 0.1,
        appliesTo: "AFTER_DISCOUNT_AND_SERVICE",
      },
    });

    assert.equal(draft.status, "DRAFT");
    assert.equal(draft.subtotal, 64000);
    assert.equal(draft.discount, 5000);
    assert.equal(draft.serviceCharge, 1500);
    assert.equal(draft.taxAmount, 6050);
    assert.equal(draft.grandTotal, 66550);
    assert.equal(draft.items[0].unitPrice, 30000);
  });

  it("rejects invalid order lifecycle transitions", () => {
    const service = new OrderDomainService();
    const order = service.createDraftOrder({
      organizationId: "org-1",
      outletId: "outlet-1",
      staffId: "staff-1",
      source: "QR_TABLE",
      items: [{ id: "item-2", name: "Croissant", quantity: 1, unitPrice: 25000, category: "pastry", station: "Kitchen" }],
    });

    assert.throws(() => {
      service.transitionOrder(order, "REFUNDED");
    }, InvalidOrderTransitionError);
  });

  it("submits a duplicate order using the same idempotency key", () => {
    const service = new OrderDomainService();
    const order = service.createDraftOrder({
      organizationId: "org-1",
      outletId: "outlet-1",
      staffId: "staff-1",
      source: "WEBSITE",
      externalChannelOrderId: "ext-1001",
      items: [{ id: "item-3", name: "Taro Tea", quantity: 1, unitPrice: 25000, category: "non-coffee", station: "Bar" }],
    });

    const first = service.submitOrder(order, { idempotencyKey: "dup-key-1" });
    const duplicate = service.submitOrder(order, { idempotencyKey: "dup-key-1" });

    assert.equal(first.status, "PENDING");
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.orderId, first.orderId);
  });

  it("routes KDS items and transitions to completed status", () => {
    const router = new KdsRouter();
    const route = router.routeItem({
      orderId: "order-1",
      orderItemId: "item-3",
      menuItemId: "item-3",
      quantity: 2,
      category: "coffee",
      station: "Kitchen",
    });

    assert.equal(route.station, "Kitchen");
    assert.equal(route.status, "QUEUED");

    const completed = router.transitionStatus(route, "READY");
    assert.equal(completed.status, "READY");
    assert.equal(router.transitionStatus(completed, "COMPLETED").status, "COMPLETED");
  });

  it("processes mock payment through the payment adapter", () => {
    const paymentService = new PaymentService(new MockPaymentAdapter());
    const payment = paymentService.initiate({ orderId: "order-1", amount: 150000, method: "QRIS" });

    assert.equal(payment.status, "INITIATED");
    const pending = paymentService.transition(payment, "PENDING");
    const processing = paymentService.transition(pending, "PROCESSING");
    const success = paymentService.transition(processing, "SUCCESS");
    assert.equal(success.status, "SUCCESS");
  });

  it("applies percentage and fixed tax rules", () => {
    const base = TaxEngine.calculate({
      subtotal: 100000,
      discount: 10000,
      serviceCharge: 2000,
      mode: "PERCENTAGE",
      rate: 0.1,
      appliesTo: "AFTER_DISCOUNT_AND_SERVICE",
    });

    const fixed = TaxEngine.calculate({
      subtotal: 100000,
      mode: "FIXED_AMOUNT",
      fixedAmount: 1500,
      appliesTo: "SUBTOTAL",
    });

    assert.equal(base, 9200);
    assert.equal(fixed, 1500);
  });

  it("builds inventory consumption events and audit records", () => {
    const event = InventoryEventBuilder.build({
      orderId: "order-1",
      orderItemId: "item-1",
      menuItemId: "item-1",
      quantity: 2,
      recipeVersion: "recipe-v3",
      outletId: "outlet-1",
    });

    assert.equal(event.type, "INVENTORY_CONSUMPTION_REQUESTED");
    assert.equal(event.quantity, 2);

    const audit = new AuditLogger().record("ORDER_CREATED", {
      orderId: "order-1",
      organizationId: "org-1",
      outletId: "outlet-1",
    });

    assert.equal(audit.type, "ORDER_CREATED");
  });

  it("validates server authoritative context and rejects manipulated context", () => {
    assert.doesNotThrow(() => {
      assertServerAuthoritativeContext({
        authContext: { organizationId: "org-1", outletId: "outlet-1" },
        suppliedOrganizationId: "org-1",
        suppliedOutletId: "outlet-1",
      });
    });

    assert.throws(() => {
      assertServerAuthoritativeContext({
        authContext: { organizationId: "org-1", outletId: "outlet-1" },
        suppliedOrganizationId: "org-999",
        suppliedOutletId: "outlet-1",
      });
    });
  });
});
