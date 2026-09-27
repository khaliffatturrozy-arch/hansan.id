import { assertServerAuthoritativeContext, type OrderRecord, type OrderItemSnapshot } from "./transaction-core";

export type KdsStation = "KITCHEN" | "BAR" | "OTHER";
export type KdsStatus = "QUEUED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
export type InventoryUnit = "g" | "ml" | "pcs" | "kg" | "L";
export type StockMovementType = "RECEIVE" | "ADJUSTMENT" | "WASTE" | "CONSUMPTION" | "REVERSAL";

export type KdsTicket = {
  id: string;
  orderId: string;
  orderItemId: string;
  menuItemId: string;
  itemName: string;
  quantity: number;
  modifiers?: string[];
  notes?: string;
  station: KdsStation;
  outletId: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
  status: KdsStatus;
};

export type RecipeItem = {
  ingredientId: string;
  quantity: number;
  unit: InventoryUnit;
};

export type RecipeVersion = {
  id: string;
  menuItemId: string;
  name: string;
  version: string;
  items: RecipeItem[];
  yieldQuantity?: number;
  isActive: boolean;
};

export type Ingredient = {
  id: string;
  organizationId: string;
  outletId: string;
  name: string;
  sku: string;
  baseUnit: InventoryUnit;
  isActive: boolean;
};

export type StockState = {
  ingredientId: string;
  outletId: string;
  organizationId: string;
  quantity: number;
  unit: InventoryUnit;
  updatedAt: Date;
};

export type StockMovement = {
  id: string;
  organizationId: string;
  outletId: string;
  ingredientId: string;
  type: StockMovementType;
  quantity: number;
  unit: InventoryUnit;
  referenceType: "ORDER_COMPLETION" | "ADJUSTMENT" | "WASTE" | "RECEIVE" | "REVERSAL";
  referenceId: string;
  reason: string;
  createdAt: Date;
  createdBy: string;
};

export class InvalidKdsTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidKdsTransitionError";
  }
}

export class InvalidUnitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUnitError";
  }
}

export class InsufficientStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientStockError";
  }
}

export class DuplicateConsumptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateConsumptionError";
  }
}

export const KDS_TRANSITION_MAP: Record<KdsStatus, KdsStatus[]> = {
  QUEUED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function resolveStationForMenuItem(category?: string, stationOverride?: KdsStation): KdsStation {
  const normalized = (category ?? "").toLowerCase();

  if (stationOverride) {
    return stationOverride;
  }

  if (normalized.includes("coffee") || normalized.includes("tea") || normalized.includes("beverage") || normalized.includes("drink")) {
    return "BAR";
  }

  if (normalized.includes("main") || normalized.includes("food") || normalized.includes("pastry") || normalized.includes("snack")) {
    return "KITCHEN";
  }

  return "OTHER";
}

export class KdsRouter {
  private readonly queue: KdsTicket[] = [];

  routeOrderItem({
    order,
    item,
    organizationId,
    outletId,
    stationOverride,
  }: {
    order: OrderRecord;
    item: OrderItemSnapshot;
    organizationId: string;
    outletId: string;
    stationOverride?: KdsStation;
  }): KdsTicket {
    assertServerAuthoritativeContext({
      authContext: { organizationId, outletId },
      suppliedOrganizationId: order.organizationId,
      suppliedOutletId: order.outletId,
    });

    const ticket: KdsTicket = {
      id: `kds_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      orderId: order.id,
      orderItemId: item.id,
      menuItemId: item.id,
      itemName: item.name,
      quantity: item.quantity,
      modifiers: [],
      notes: undefined,
      station: resolveStationForMenuItem(item.category, stationOverride),
      outletId,
      organizationId,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: "QUEUED",
    };

    this.queue.push(ticket);
    return ticket;
  }

  transition(ticket: KdsTicket, nextStatus: KdsStatus): KdsTicket {
    const allowed = KDS_TRANSITION_MAP[ticket.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new InvalidKdsTransitionError(`Invalid KDS transition: ${ticket.status} -> ${nextStatus}`);
    }

    return {
      ...ticket,
      status: nextStatus,
      updatedAt: new Date(),
    };
  }

  getQueue(station?: KdsStation): KdsTicket[] {
    const tickets = [...this.queue];
    return tickets
      .filter((ticket) => (station ? ticket.station === station : true))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  getActiveTickets(): KdsTicket[] {
    return this.getQueue().filter((ticket) => ticket.status !== "COMPLETED" && ticket.status !== "CANCELLED");
  }
}

export const INVENTORY_CONVERSION_MATRIX: Record<string, number> = {
  "kg->g": 1000,
  "g->kg": 0.001,
  "L->ml": 1000,
  "ml->L": 0.001,
};

export class UnitConversion {
  static normalize(unit: string): InventoryUnit {
    const normalized = unit.trim().toLowerCase();
    if (["g", "ml", "pcs", "kg", "l"].includes(normalized)) {
      return normalized === "l" ? "L" : (normalized as InventoryUnit);
    }
    throw new InvalidUnitError(`Unsupported unit: ${unit}`);
  }

  static convert(quantity: number, fromUnit: string, toUnit: string): number {
    const from = this.normalize(fromUnit);
    const to = this.normalize(toUnit);

    if (from === to) {
      return quantity;
    }

    if (from === "g" && to === "kg") {
      return quantity * INVENTORY_CONVERSION_MATRIX["g->kg"];
    }
    if (from === "kg" && to === "g") {
      return quantity * INVENTORY_CONVERSION_MATRIX["kg->g"];
    }
    if (from === "ml" && to === "L") {
      return quantity * INVENTORY_CONVERSION_MATRIX["ml->L"];
    }
    if (from === "L" && to === "ml") {
      return quantity * INVENTORY_CONVERSION_MATRIX["L->ml"];
    }

    throw new InvalidUnitError(`Invalid conversion: ${from} -> ${to}`);
  }
}

export type StockRequirement = {
  ingredientId: string;
  quantity: number;
  unit: InventoryUnit;
};

export class InventoryService {
  private readonly stock = new Map<string, StockState>();
  private readonly movements: StockMovement[] = [];

  receiveIngredient(input: {
    ingredient: Ingredient;
    quantity: number;
    unit: InventoryUnit;
    createdBy: string;
  }): StockState {
    const normalized = Math.max(0, Number(input.quantity));
    if (normalized <= 0) {
      throw new InvalidUnitError("Received quantity must be greater than zero.");
    }

    const key = `${input.ingredient.outletId}:${input.ingredient.id}`;
    const current = this.stock.get(key) ?? {
      ingredientId: input.ingredient.id,
      outletId: input.ingredient.outletId,
      organizationId: input.ingredient.organizationId,
      quantity: 0,
      unit: input.ingredient.baseUnit,
      updatedAt: new Date(),
    };

    const converted = UnitConversion.convert(normalized, input.unit, current.unit);
    const nextQuantity = current.quantity + converted;
    const updated: StockState = {
      ...current,
      quantity: nextQuantity,
      updatedAt: new Date(),
    };

    this.stock.set(key, updated);
    this.movements.push({
      id: `movement_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      organizationId: input.ingredient.organizationId,
      outletId: input.ingredient.outletId,
      ingredientId: input.ingredient.id,
      type: "RECEIVE",
      quantity: normalized,
      unit: UnitConversion.normalize(input.unit),
      referenceType: "RECEIVE",
      referenceId: `receive_${input.ingredient.id}`,
      reason: "stock_received",
      createdAt: new Date(),
      createdBy: input.createdBy,
    });

    return updated;
  }

  getStock(ingredientId: string, outletId: string): StockState | null {
    return this.stock.get(`${outletId}:${ingredientId}`) ?? null;
  }

  adjustStock({
    ingredient,
    quantity,
    unit,
    direction,
    reason,
    createdBy,
    referenceId,
  }: {
    ingredient: Ingredient;
    quantity: number;
    unit: InventoryUnit;
    direction: "INCREASE" | "DECREASE";
    reason: string;
    createdBy: string;
    referenceId: string;
  }): StockState {
    const key = `${ingredient.outletId}:${ingredient.id}`;
    const state = this.stock.get(key) ?? {
      ingredientId: ingredient.id,
      outletId: ingredient.outletId,
      organizationId: ingredient.organizationId,
      quantity: 0,
      unit: ingredient.baseUnit,
      updatedAt: new Date(),
    };

    const converted = UnitConversion.convert(Math.max(0, Number(quantity)), unit, state.unit);
    const nextQuantity = direction === "INCREASE" ? state.quantity + converted : state.quantity - converted;
    if (nextQuantity < 0) {
      throw new InsufficientStockError(`Insufficient stock for ${ingredient.name}`);
    }

    const updated = { ...state, quantity: nextQuantity, updatedAt: new Date() };
    this.stock.set(key, updated);
    this.movements.push({
      id: `movement_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      organizationId: ingredient.organizationId,
      outletId: ingredient.outletId,
      ingredientId: ingredient.id,
      type: "ADJUSTMENT",
      quantity: Math.abs(converted),
      unit: state.unit,
      referenceType: "ADJUSTMENT",
      referenceId,
      reason,
      createdAt: new Date(),
      createdBy,
    });

    return updated;
  }

  recordWaste({
    ingredient,
    quantity,
    unit,
    reason,
    createdBy,
    referenceId,
  }: {
    ingredient: Ingredient;
    quantity: number;
    unit: InventoryUnit;
    reason: string;
    createdBy: string;
    referenceId: string;
  }): StockState {
    return this.adjustStock({
      ingredient,
      quantity,
      unit,
      direction: "DECREASE",
      reason,
      createdBy,
      referenceId,
    });
  }

  consume({
    ingredient,
    quantity,
    unit,
    referenceId,
    createdBy,
  }: {
    ingredient: Ingredient;
    quantity: number;
    unit: InventoryUnit;
    referenceId: string;
    createdBy: string;
  }): StockState {
    const key = `${ingredient.outletId}:${ingredient.id}`;
    const state = this.stock.get(key) ?? {
      ingredientId: ingredient.id,
      outletId: ingredient.outletId,
      organizationId: ingredient.organizationId,
      quantity: 0,
      unit: ingredient.baseUnit,
      updatedAt: new Date(),
    };

    const converted = UnitConversion.convert(quantity, unit, state.unit);
    if (converted > state.quantity) {
      throw new InsufficientStockError(`Insufficient stock for ${ingredient.name}`);
    }

    const updated = { ...state, quantity: state.quantity - converted, updatedAt: new Date() };
    this.stock.set(key, updated);
    this.movements.push({
      id: `movement_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      organizationId: ingredient.organizationId,
      outletId: ingredient.outletId,
      ingredientId: ingredient.id,
      type: "CONSUMPTION",
      quantity: converted,
      unit: state.unit,
      referenceType: "ORDER_COMPLETION",
      referenceId,
      reason: "recipe_consumption",
      createdAt: new Date(),
      createdBy,
    });

    return updated;
  }

  reverse({
    ingredient,
    quantity,
    unit,
    referenceId,
    createdBy,
    reason,
  }: {
    ingredient: Ingredient;
    quantity: number;
    unit: InventoryUnit;
    referenceId: string;
    createdBy: string;
    reason: string;
  }): StockState {
    const key = `${ingredient.outletId}:${ingredient.id}`;
    const state = this.stock.get(key) ?? {
      ingredientId: ingredient.id,
      outletId: ingredient.outletId,
      organizationId: ingredient.organizationId,
      quantity: 0,
      unit: ingredient.baseUnit,
      updatedAt: new Date(),
    };

    const converted = UnitConversion.convert(quantity, unit, state.unit);
    const updated = { ...state, quantity: state.quantity + converted, updatedAt: new Date() };
    this.stock.set(key, updated);
    this.movements.push({
      id: `movement_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      organizationId: ingredient.organizationId,
      outletId: ingredient.outletId,
      ingredientId: ingredient.id,
      type: "REVERSAL",
      quantity: converted,
      unit: state.unit,
      referenceType: "REVERSAL",
      referenceId,
      reason,
      createdAt: new Date(),
      createdBy,
    });

    return updated;
  }

  getMovements(): StockMovement[] {
    return [...this.movements];
  }
}

export type RecipeLookupResult = {
  recipe: RecipeVersion;
  item: RecipeItem[];
};

export class RecipeCatalog {
  private readonly recipes = new Map<string, RecipeVersion>();

  register(recipe: RecipeVersion): void {
    this.recipes.set(`${recipe.menuItemId}:${recipe.version}`, recipe);
  }

  getForMenuItem(menuItemId: string, version?: string): RecipeVersion | undefined {
    if (version) {
      return this.recipes.get(`${menuItemId}:${version}`);
    }

    return [...this.recipes.values()].find((recipe) => recipe.menuItemId === menuItemId && recipe.isActive);
  }
}

export class ProductionCapacityService {
  static calculateCapacity({
    recipe,
    stock,
  }: {
    recipe: RecipeVersion;
    stock: Record<string, number>;
  }): { capacity: number; limitingIngredientId: string | null } {
    const capacities: number[] = [];
    let limitingIngredientId: string | null = null;

    for (const item of recipe.items) {
      const available = stock[item.ingredientId] ?? 0;
      const required = item.quantity;
      if (required <= 0) {
        continue;
      }
      const capacity = available / required;
      capacities.push(capacity);
      if (capacity === Math.min(...capacities)) {
        limitingIngredientId = item.ingredientId;
      }
    }

    if (capacities.length === 0) {
      return { capacity: 0, limitingIngredientId: null };
    }

    return {
      capacity: Math.floor(Math.min(...capacities)),
      limitingIngredientId,
    };
  }
}

export class OrderInventoryProcessor {
  private readonly completedOrders = new Map<string, { orderId: string; movements: StockMovement[] }>();

  constructor(
    private readonly inventoryService: InventoryService,
    private readonly recipeCatalog: RecipeCatalog,
    private readonly auditLogger: { record: (type: string, payload: Record<string, unknown>) => { type: string } }
  ) {}

  processCompletedOrder({
    order,
    organizationId,
    outletId,
    createdBy,
    recipeVersion,
  }: {
    order: OrderRecord;
    organizationId: string;
    outletId: string;
    createdBy: string;
    recipeVersion?: string;
  }): { status: "OK" | "INSUFFICIENT_STOCK" | "ALREADY_PROCESSED"; movements: StockMovement[]; audit: Array<{ type: string }> } {
    assertServerAuthoritativeContext({
      authContext: { organizationId, outletId },
      suppliedOrganizationId: order.organizationId,
      suppliedOutletId: order.outletId,
    });

    const dedupeKey = `ORDER_COMPLETION:${order.id}`;
    if (this.completedOrders.has(dedupeKey)) {
      return {
        status: "ALREADY_PROCESSED",
        movements: this.completedOrders.get(dedupeKey)?.movements ?? [],
        audit: [],
      };
    }

    const movements: StockMovement[] = [];
    const audit: Array<{ type: string }> = [];

    for (const item of order.items) {
      const recipe = this.recipeCatalog.getForMenuItem(item.id, recipeVersion);
      if (!recipe) {
        throw new Error(`Missing recipe for menu item ${item.id}`);
      }

      audit.push(this.auditLogger.record("INVENTORY_CONSUMPTION_REQUESTED", {
        orderId: order.id,
        orderItemId: item.id,
        menuItemId: item.id,
        quantity: item.quantity,
      }));

      for (const recipeEntry of recipe.items) {
        const ingredient = {
          id: recipeEntry.ingredientId,
          organizationId,
          outletId,
          name: recipeEntry.ingredientId,
          sku: recipeEntry.ingredientId,
          baseUnit: recipeEntry.unit,
          isActive: true,
        };

        const stock = this.inventoryService.getStock(ingredient.id, outletId);
        const requiredUnits = recipeEntry.quantity * item.quantity;

        if (!stock || stock.quantity < requiredUnits) {
          throw new InsufficientStockError(`Insufficient stock for ingredient ${ingredient.id}`);
        }

        const movement = this.inventoryService.consume({
          ingredient,
          quantity: requiredUnits,
          unit: ingredient.baseUnit,
          referenceId: dedupeKey,
          createdBy,
        });

        movements.push({
          id: `movement_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
          organizationId,
          outletId,
          ingredientId: ingredient.id,
          type: "CONSUMPTION",
          quantity: requiredUnits,
          unit: ingredient.baseUnit,
          referenceType: "ORDER_COMPLETION",
          referenceId: dedupeKey,
          reason: "recipe_consumption",
          createdAt: new Date(),
          createdBy,
        });

        if (movement) {
          audit.push(this.auditLogger.record("INVENTORY_CONSUMED", {
            orderId: order.id,
            ingredientId: ingredient.id,
            quantity: requiredUnits,
          }));
        }
      }
    }

    this.completedOrders.set(dedupeKey, { orderId: order.id, movements });
    return { status: "OK", movements, audit };
  }
}

export type WasteInput = {
  ingredient: Ingredient;
  quantity: number;
  unit: InventoryUnit;
  reason: string;
  createdBy: string;
  referenceId: string;
};

export class InventoryAdjustmentService {
  constructor(private readonly inventoryService: InventoryService) {}

  waste(input: WasteInput): StockState {
    return this.inventoryService.recordWaste({
      ingredient: input.ingredient,
      quantity: input.quantity,
      unit: input.unit,
      reason: input.reason,
      createdBy: input.createdBy,
      referenceId: input.referenceId,
    });
  }

  adjust(input: {
    ingredient: Ingredient;
    quantity: number;
    unit: InventoryUnit;
    direction: "INCREASE" | "DECREASE";
    reason: string;
    createdBy: string;
    referenceId: string;
  }): StockState {
    return this.inventoryService.adjustStock(input);
  }
}
