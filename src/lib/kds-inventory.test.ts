export {};

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  KdsRouter,
  resolveStationForMenuItem,
  UnitConversion,
  InventoryService,
  RecipeCatalog,
  ProductionCapacityService,
  OrderInventoryProcessor,
  InvalidKdsTransitionError,
  InsufficientStockError,
  InvalidUnitError,
} = require("./kds-inventory");

const { OrderDomainService } = require("./transaction-core");

describe("kds inventory", () => {
  it("routes kitchen items and bar items to the correct station", () => {
    assert.equal(resolveStationForMenuItem("coffee", undefined), "BAR");
    assert.equal(resolveStationForMenuItem("main-course"), "KITCHEN");
    assert.equal(resolveStationForMenuItem("general", "OTHER"), "OTHER");
  });

  it("enforces KDS transitions and queue ordering", () => {
    const router = new KdsRouter();
    const orderService = new OrderDomainService();
    const order = orderService.createDraftOrder({
      organizationId: "org-1",
      outletId: "outlet-1",
      staffId: "staff-1",
      source: "IN_STORE",
      items: [
        { id: "item-1", name: "Latte", quantity: 1, unitPrice: 25000, category: "coffee", station: "BAR" },
      ],
    });

    const first = router.routeOrderItem({
      order,
      item: order.items[0],
      organizationId: "org-1",
      outletId: "outlet-1",
      stationOverride: "BAR",
    });

    const second = router.routeOrderItem({
      order,
      item: { ...order.items[0], id: "item-2", name: "Burger", quantity: 1, category: "main-course" },
      organizationId: "org-1",
      outletId: "outlet-1",
    });

    assert.equal(first.station, "BAR");
    assert.equal(second.station, "KITCHEN");
    assert.deepEqual(
      router.getQueue().map((ticket: any) => ticket.orderItemId),
      [first.orderItemId, second.orderItemId]
    );

    assert.throws(() => router.transition(first, "COMPLETED"), InvalidKdsTransitionError);
    const ready = router.transition(first, "PREPARING");
    assert.equal(router.transition(ready, "READY").status, "READY");
  });

  it("supports unit conversion and rejects invalid cross-unit conversion", () => {
    assert.equal(UnitConversion.convert(1000, "g", "kg"), 1);
    assert.equal(UnitConversion.convert(500, "ml", "L"), 0.5);
    assert.throws(() => UnitConversion.convert(10, "g", "ml"), InvalidUnitError);
    assert.throws(() => UnitConversion.convert(10, "pcs", "L"), InvalidUnitError);
  });

  it("creates a recipe and calculates recipe quantity consumption", () => {
    const catalog = new RecipeCatalog();
    const recipe = {
      id: "recipe-1",
      menuItemId: "coffee-1",
      name: "Iced Latte",
      version: "v1",
      items: [
        { ingredientId: "espresso", quantity: 18, unit: "g" },
        { ingredientId: "milk", quantity: 150, unit: "ml" },
      ],
      isActive: true,
    };

    catalog.register(recipe);
    const fetched = catalog.getForMenuItem("coffee-1");

    assert.equal(fetched.version, "v1");
    const usage = recipe.items.map((entry) => ({
      ingredientId: entry.ingredientId,
      quantity: entry.quantity * 3,
      unit: entry.unit,
    }));

    assert.equal(usage[0].quantity, 54);
    assert.equal(usage[1].quantity, 450);
  });

  it("tracks stock movements and rejects insufficient stock", () => {
    const inventory = new InventoryService();
    const ingredient = {
      id: "espresso",
      organizationId: "org-1",
      outletId: "outlet-1",
      name: "Espresso",
      sku: "ESP-01",
      baseUnit: "g",
      isActive: true,
    };

    inventory.receiveIngredient({ ingredient, quantity: 250, unit: "g", createdBy: "staff-1" });
    inventory.consume({ ingredient, quantity: 100, unit: "g", referenceId: "ref-1", createdBy: "staff-1" });
    assert.equal(inventory.getStock("espresso", "outlet-1").quantity, 150);

    assert.throws(() => {
      inventory.consume({ ingredient, quantity: 200, unit: "g", referenceId: "ref-2", createdBy: "staff-1" });
    }, InsufficientStockError);
  });

  it("reuses order completion idempotency and prevents duplicate stock consumption", () => {
    const stock = new InventoryService();
    const recipes = new RecipeCatalog();
    const auditLogger = {
      record: (type: string, payload: Record<string, unknown>) => ({ type, payload }),
    };
    const processor = new OrderInventoryProcessor(stock, recipes, auditLogger);

    const ingredient = {
      id: "espresso",
      organizationId: "org-1",
      outletId: "outlet-1",
      name: "Espresso",
      sku: "ESP-01",
      baseUnit: "g",
      isActive: true,
    };

    stock.receiveIngredient({ ingredient, quantity: 300, unit: "g", createdBy: "staff-1" });
    recipes.register({
      id: "recipe-1",
      menuItemId: "coffee-1",
      name: "Espresso Recipe",
      version: "v1",
      items: [{ ingredientId: "espresso", quantity: 18, unit: "g" }],
      isActive: true,
    });

    const order = {
      id: "order-01",
      organizationId: "org-1",
      outletId: "outlet-1",
      staffId: "staff-1",
      source: "IN_STORE",
      status: "COMPLETED",
      subtotal: 150000,
      discount: 0,
      serviceCharge: 0,
      taxAmount: 15000,
      grandTotal: 165000,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [{ id: "coffee-1", name: "Espresso", quantity: 2, unitPrice: 15000, subtotal: 30000, category: "coffee", station: "BAR" }],
    };

    const first = processor.processCompletedOrder({
      order,
      organizationId: "org-1",
      outletId: "outlet-1",
      createdBy: "staff-1",
    });

    const second = processor.processCompletedOrder({
      order,
      organizationId: "org-1",
      outletId: "outlet-1",
      createdBy: "staff-1",
    });

    assert.equal(first.status, "OK");
    assert.equal(second.status, "ALREADY_PROCESSED");
    assert.equal(stock.getStock("espresso", "outlet-1").quantity, 264);
  });

  it("calculates production capacity from limiting ingredient", () => {
    const recipe = {
      id: "recipe-2",
      menuItemId: "latte-1",
      name: "Latte Recipe",
      version: "v1",
      items: [
        { ingredientId: "espresso", quantity: 18, unit: "g" },
        { ingredientId: "milk", quantity: 150, unit: "ml" },
      ],
      isActive: true,
    };

    const stock = {
      espresso: 180,
      milk: 1200,
    };

    const capacity = ProductionCapacityService.calculateCapacity({ recipe, stock });
    assert.equal(capacity.capacity, 8);
    assert.equal(capacity.limitingIngredientId, "milk");
  });

  it("rejects cross-outlet access in authoritative context validation", () => {
    assert.throws(() => {
      const { assertServerAuthoritativeContext } = require("./transaction-core");
      assertServerAuthoritativeContext({
        authContext: { organizationId: "org-1", outletId: "outlet-1" },
        suppliedOrganizationId: "org-1",
        suppliedOutletId: "outlet-2",
      });
    });
  });
});
