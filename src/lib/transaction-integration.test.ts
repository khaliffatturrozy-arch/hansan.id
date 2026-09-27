export {};

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  OrderDomainService,
  PaymentService,
  TaxEngine,
  AuditLogger,
  MockPaymentAdapter,
} = require("./transaction-core");
const {
  InventoryService,
  RecipeCatalog,
  OrderInventoryProcessor,
  InsufficientStockError,
} = require("./kds-inventory");

describe("transaction integration", () => {
  it("executes the end-to-end order lifecycle with tax, KDS, payment, inventory, and audit", () => {
    const orderService = new OrderDomainService();
    const paymentService = new PaymentService(new MockPaymentAdapter());
    const inventory = new InventoryService();
    const recipes = new RecipeCatalog();
    const auditLogger = new AuditLogger();
    const processor = new OrderInventoryProcessor(inventory, recipes, auditLogger);

    const ingredient = {
      id: "espresso",
      organizationId: "org-1",
      outletId: "outlet-1",
      name: "Espresso",
      sku: "ESP-01",
      baseUnit: "g",
      isActive: true,
    };

    inventory.receiveIngredient({ ingredient, quantity: 500, unit: "g", createdBy: "staff-1" });
    recipes.register({
      id: "recipe-1",
      menuItemId: "coffee-1",
      name: "Espresso",
      version: "v1",
      items: [{ ingredientId: "espresso", quantity: 18, unit: "g" }],
      isActive: true,
    });

    const draft = orderService.createDraftOrder({
      organizationId: "org-1",
      outletId: "outlet-1",
      staffId: "staff-1",
      source: "IN_STORE",
      items: [{ id: "coffee-1", name: "Espresso", quantity: 2, unitPrice: 50000, category: "coffee", station: "BAR" }],
      taxPolicy: { type: "PERCENTAGE", rate: 0.1, appliesTo: "SUBTOTAL" },
    });

    const taxSnapshot = TaxEngine.calculateOrder({
      subtotal: draft.subtotal,
      discount: draft.discount,
      serviceCharge: draft.serviceCharge,
      rules: [{
        id: "vat",
        name: "VAT",
        code: "VAT",
        type: "PERCENTAGE",
        rate: 0.1,
        appliesTo: "SUBTOTAL",
        priority: 100,
      }],
    });

    const submitted = orderService.submitOrder(draft, { idempotencyKey: "e2e-order-1" });
    const confirmed = orderService.transitionOrder(submitted.order, "CONFIRMED");
    const processing = orderService.transitionOrder(confirmed, "PROCESSING");
    const ready = orderService.transitionOrder(processing, "READY");
    const finalizedOrder = {
      ...ready,
      metadata: {
        ...(ready.metadata ?? {}),
        taxSnapshot,
      },
    };

    const payment = paymentService.createPayment({
      orderId: finalizedOrder.id,
      organizationId: "org-1",
      outletId: "outlet-1",
      amount: finalizedOrder.grandTotal,
      method: "CASH",
      amountReceived: finalizedOrder.grandTotal,
      authContext: { organizationId: "org-1", outletId: "outlet-1" },
    });

    const paid = paymentService.markSuccess(
      paymentService.processPayment(paymentService.initiatePayment(payment))
    );

    const completed = orderService.completeOrder(finalizedOrder, {
      authContext: { organizationId: "org-1", outletId: "outlet-1" },
      auditLogger,
      inventoryProcessor: processor,
      createdBy: "staff-1",
      paymentStatus: paid.status,
      recipeVersion: "v1",
    });

    assert.equal(completed.order.status, "COMPLETED");
    assert.equal(paid.status, "SUCCESS");
    assert.equal(completed.inventory.length, 1);
    assert.equal(completed.audit.some((event: { type: string }) => event.type === "ORDER_COMPLETED"), true);
    assert.equal(completed.audit.some((event: { type: string }) => event.type === "INVENTORY_CONSUMED"), true);
    assert.ok(finalizedOrder.metadata.taxSnapshot);
    assert.equal(inventory.getStock("espresso", "outlet-1").quantity, 464);
  });

  it("rejects duplicate completion and insufficient inventory deterministically", () => {
    const orderService = new OrderDomainService();
    const inventory = new InventoryService();
    const recipes = new RecipeCatalog();
    const auditLogger = new AuditLogger();
    const processor = new OrderInventoryProcessor(inventory, recipes, auditLogger);

    const ingredient = {
      id: "milk",
      organizationId: "org-1",
      outletId: "outlet-1",
      name: "Milk",
      sku: "MILK-01",
      baseUnit: "ml",
      isActive: true,
    };

    inventory.receiveIngredient({ ingredient, quantity: 100, unit: "ml", createdBy: "staff-1" });
    recipes.register({
      id: "recipe-2",
      menuItemId: "drink-1",
      name: "Milk Drink",
      version: "v1",
      items: [{ ingredientId: "milk", quantity: 200, unit: "ml" }],
      isActive: true,
    });

    const order = {
      ...orderService.createDraftOrder({
        organizationId: "org-1",
        outletId: "outlet-1",
        staffId: "staff-1",
        source: "IN_STORE",
        items: [{ id: "drink-1", name: "Milk Drink", quantity: 1, unitPrice: 25000, category: "beverage", station: "BAR" }],
      }),
      status: "READY",
    };

    assert.throws(() => {
      orderService.completeOrder(order, {
        authContext: { organizationId: "org-1", outletId: "outlet-1" },
        inventoryProcessor: processor,
        auditLogger,
        createdBy: "staff-1",
      });
    }, /Insufficient stock/i);

    const espressoIngredient = {
      id: "espresso",
      organizationId: "org-1",
      outletId: "outlet-1",
      name: "Espresso",
      sku: "ESP-01",
      baseUnit: "g",
      isActive: true,
    };

    inventory.receiveIngredient({ ingredient: espressoIngredient, quantity: 500, unit: "g", createdBy: "staff-1" });
    recipes.register({
      id: "recipe-3",
      menuItemId: "coffee-1",
      name: "Espresso",
      version: "v1",
      items: [{ ingredientId: "espresso", quantity: 18, unit: "g" }],
      isActive: true,
    });

    const secondOrder = orderService.createDraftOrder({
      organizationId: "org-1",
      outletId: "outlet-1",
      staffId: "staff-1",
      source: "IN_STORE",
      items: [{ id: "coffee-1", name: "Espresso", quantity: 1, unitPrice: 20000, category: "coffee", station: "BAR" }],
    });

    const readyOrder = { ...secondOrder, status: "READY" };
    const firstCompletion = orderService.completeOrder(readyOrder, {
      authContext: { organizationId: "org-1", outletId: "outlet-1" },
      inventoryProcessor: processor,
      auditLogger,
      createdBy: "staff-1",
    });
    const duplicate = orderService.completeOrder(readyOrder, {
      authContext: { organizationId: "org-1", outletId: "outlet-1" },
      inventoryProcessor: processor,
      auditLogger,
      createdBy: "staff-1",
    });

    assert.equal(firstCompletion.order.status, "COMPLETED");
    assert.equal(duplicate.duplicate, true);
  });

  it("rejects invalid lifecycle transitions and cross-outlet completion attempts", () => {
    const service = new OrderDomainService();
    const order = service.createDraftOrder({
      organizationId: "org-1",
      outletId: "outlet-1",
      staffId: "staff-1",
      source: "IN_STORE",
      items: [{ id: "item-1", name: "Latte", quantity: 1, unitPrice: 25000, category: "coffee", station: "BAR" }],
    });

    assert.throws(() => service.completeOrder(order, { authContext: { organizationId: "org-1", outletId: "outlet-1" } }));
    assert.throws(() => service.transitionOrder({ ...order, status: "COMPLETED" }, "PROCESSING"));

    assert.throws(() => {
      service.completeOrder({ ...order, status: "READY", organizationId: "org-1", outletId: "outlet-2" }, {
        authContext: { organizationId: "org-1", outletId: "outlet-1" },
        suppliedOrganizationId: "org-1",
        suppliedOutletId: "outlet-2",
      });
    });
  });
});
