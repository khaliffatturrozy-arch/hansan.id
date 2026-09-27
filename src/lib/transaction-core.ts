export const ORDER_SOURCES = [
  "IN_STORE",
  "QR_TABLE",
  "WEBSITE",
  "GOFOOD",
  "GRABFOOD",
  "SHOPEEFOOD",
] as const;

export type OrderSource = (typeof ORDER_SOURCES)[number];

export type OrderStatus =
  | "DRAFT"
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUND_PENDING"
  | "REFUNDED";

export type KdsStatus = "QUEUED" | "PREPARING" | "READY" | "COMPLETED";

export type PaymentMethod = "CASH" | "QRIS" | "EDC";

export type PaymentStatus =
  | "INITIATED"
  | "PENDING"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED"
  | "UNKNOWN";

export type TaxCalculationMode = "PERCENTAGE" | "FIXED_AMOUNT";

export type TaxAppliesTo =
  | "SUBTOTAL"
  | "AFTER_DISCOUNT"
  | "AFTER_SERVICE_CHARGE"
  | "AFTER_DISCOUNT_AND_SERVICE";

export type OrderItemSnapshot = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  modifierPrice?: number;
  subtotal: number;
  category?: string;
  station?: string;
  notes?: string;
};

export type TaxPolicy = {
  type: TaxCalculationMode;
  rate?: number;
  fixedAmount?: number;
  appliesTo: TaxAppliesTo;
};

export type OrderContext = {
  organizationId: string;
  outletId: string;
  staffId: string;
};

export type OrderDraftInput = OrderContext & {
  source: OrderSource;
  orderChannel?: string;
  tableNumber?: string | null;
  customerName?: string | null;
  externalChannelOrderId?: string | null;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    modifierPrice?: number;
    category?: string;
    station?: string;
    notes?: string;
  }>;
  discount?: number;
  serviceCharge?: number;
  taxPolicy?: TaxPolicy;
};

export type OrderRecord = {
  id: string;
  organizationId: string;
  outletId: string;
  staffId: string;
  source: OrderSource;
  orderChannel?: string;
  tableNumber?: string | null;
  customerName?: string | null;
  externalChannelOrderId?: string | null;
  status: OrderStatus;
  idempotencyKey?: string | null;
  subtotal: number;
  discount: number;
  serviceCharge: number;
  taxAmount: number;
  grandTotal: number;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemSnapshot[];
  metadata?: Record<string, unknown>;
};

export type OrderSubmissionResult = {
  duplicate: boolean;
  orderId: string;
  status: OrderStatus;
  order?: OrderRecord;
};

export type OrderCompletionResult = {
  duplicate: boolean;
  order: OrderRecord;
  audit: AuditEvent[];
  inventory: Array<Record<string, unknown>>;
};

export type OrderLifecycleOptions = {
  authContext?: { organizationId?: string; outletId?: string } | null;
  suppliedOrganizationId?: unknown;
  suppliedOutletId?: unknown;
  auditLogger?: { record: (type: string, payload: Record<string, unknown>) => AuditEvent } | null;
  createdBy?: string;
  inventoryProcessor?: {
    processCompletedOrder: (args: {
      order: OrderRecord;
      organizationId: string;
      outletId: string;
      createdBy: string;
      recipeVersion?: string;
    }) => { status: "OK" | "INSUFFICIENT_STOCK" | "ALREADY_PROCESSED"; movements: Array<Record<string, unknown>>; audit: Array<{ type: string; payload: Record<string, unknown>; createdAt: Date }> };
  } | null;
  paymentStatus?: PaymentStatus;
  recipeVersion?: string;
};

export type ContextValidationInput = {
  authContext?: { organizationId?: string; outletId?: string } | null;
  suppliedOrganizationId?: unknown;
  suppliedOutletId?: unknown;
};

export class InvalidOrderTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOrderTransitionError";
  }
}

export class InvalidContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidContextError";
  }
}

export class DuplicateSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateSubmissionError";
  }
}

export class InvalidPaymentTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPaymentTransitionError";
  }
}

export class PaymentServiceError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PaymentServiceError";
    this.statusCode = statusCode;
  }
}

export function assertServerAuthoritativeContext({
  authContext,
  suppliedOrganizationId,
  suppliedOutletId,
}: ContextValidationInput): void {
  if (!authContext) {
    throw new InvalidContextError("Authentication required.");
  }

  const suppliedOrg = typeof suppliedOrganizationId === "string" ? suppliedOrganizationId.trim() : null;
  const suppliedOutlet = typeof suppliedOutletId === "string" ? suppliedOutletId.trim() : null;

  if (suppliedOrg && authContext.organizationId && suppliedOrg !== authContext.organizationId) {
    throw new InvalidContextError("Manipulated organization context detected.");
  }

  if (suppliedOutlet && authContext.outletId && suppliedOutlet !== authContext.outletId) {
    throw new InvalidContextError("Manipulated outlet context detected.");
  }
}

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["PENDING"],
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["READY", "CANCELLED"],
  READY: ["COMPLETED"],
  COMPLETED: ["REFUND_PENDING", "REFUNDED"],
  CANCELLED: [],
  REFUND_PENDING: ["REFUNDED"],
  REFUNDED: [],
};

export const KDS_TRANSITIONS: Record<KdsStatus, KdsStatus[]> = {
  QUEUED: ["PREPARING", "READY"],
  PREPARING: ["READY"],
  READY: ["COMPLETED"],
  COMPLETED: [],
};

export const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  INITIATED: ["PENDING", "CANCELLED"],
  PENDING: ["PROCESSING", "EXPIRED"],
  PROCESSING: ["SUCCESS", "FAILED", "UNKNOWN"],
  SUCCESS: [],
  FAILED: [],
  EXPIRED: [],
  CANCELLED: [],
  UNKNOWN: [],
};

export type PaymentMetadata = {
  provider?: string;
  terminalId?: string;
  merchantId?: string;
  approvalCode?: string;
  RRN?: string;
  externalReference?: string;
  providerStatus?: string;
};

export type PaymentRule = {
  id: string;
  name: string;
  code: string;
  type: TaxCalculationMode;
  rate?: number;
  fixedAmount?: number;
  appliesTo: TaxAppliesTo;
  isInclusive?: boolean;
  priority?: number;
};

export type TaxSnapshot = {
  taxId: string;
  taxName: string;
  taxCode: string;
  code?: string;
  rate: number;
  type: TaxCalculationMode;
  calculationMethod: "PERCENTAGE" | "FIXED_AMOUNT";
  taxableAmount: number;
  taxAmount: number;
  isInclusive: boolean;
  priority: number;
  createdAt: Date;
};

export type PaymentTransaction = {
  id: string;
  orderId: string;
  organizationId: string;
  outletId: string;
  amount: number;
  amountDue?: number;
  amountReceived?: number;
  change?: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string;
  provider: string;
  metadata: PaymentMetadata;
  idempotencyKey?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentLifecycleEvent = {
  type: string;
  paymentId: string;
  orderId: string;
  status: PaymentStatus;
  createdAt: Date;
};

export class PaymentAdapter {
  constructor(private readonly provider: MockPaymentProvider = new MockPaymentProvider()) {}

  public create({ orderId, amount, method, reference, metadata }: {
    orderId: string;
    amount: number;
    method: PaymentMethod;
    reference: string;
    metadata?: PaymentMetadata;
  }): PaymentMetadata {
    const providerState = this.provider.createProviderState({ orderId, amount, method, reference });
    return {
      ...metadata,
      provider: providerState.provider,
      providerStatus: providerState.providerStatus,
      externalReference: providerState.externalReference,
    };
  }
}

export class MockPaymentProvider {
  createProviderState({ orderId, amount, method, reference }: {
    orderId: string;
    amount: number;
    method: PaymentMethod;
    reference: string;
  }): { provider: string; providerStatus: string; externalReference: string } {
    switch (method) {
      case "QRIS":
        return {
          provider: "mock-qris-provider",
          providerStatus: "QR_GENERATED",
          externalReference: `qris_${reference}_${amount}`,
        };
      case "EDC":
        return {
          provider: "mock-edc-provider",
          providerStatus: "SENT_TO_TERMINAL",
          externalReference: `edc_${reference}_${amount}`,
        };
      case "CASH":
      default:
        return {
          provider: "mock-cash-provider",
          providerStatus: "INITIATED",
          externalReference: `cash_${reference}_${amount}`,
        };
    }
  }
}

export class OrderDomainService {
  private readonly submissionRegistry = new Map<string, OrderRecord>();
  private readonly completionRegistry = new Map<string, OrderRecord>();

  createDraftOrder(input: OrderDraftInput): OrderRecord {
    const normalizedItems = input.items.map((item) => {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const modifierPrice = Number(item.modifierPrice ?? 0);
      const subtotal = (unitPrice + modifierPrice) * quantity;

      return {
        id: item.id,
        name: item.name,
        quantity,
        unitPrice,
        modifierPrice,
        subtotal,
        category: item.category ?? "general",
        station: item.station ?? "Kitchen",
        notes: item.notes ?? undefined,
      } satisfies OrderItemSnapshot;
    });

    const subtotal = normalizedItems.reduce((sum, item) => sum + item.subtotal, 0);
    const discount = Math.max(0, Number(input.discount ?? 0));
    const serviceCharge = Math.max(0, Number(input.serviceCharge ?? 0));
    const taxPolicy = input.taxPolicy ?? {
      type: "PERCENTAGE",
      rate: 0.1,
      appliesTo: "AFTER_DISCOUNT_AND_SERVICE",
    };

    const taxAmount = TaxEngine.calculate({
      subtotal,
      discount,
      serviceCharge,
      mode: taxPolicy.type,
      rate: taxPolicy.rate ?? 0,
      fixedAmount: taxPolicy.fixedAmount ?? 0,
      appliesTo: taxPolicy.appliesTo,
    });

    const grandTotal = subtotal - discount + serviceCharge + taxAmount;
    const now = new Date();

    return {
      id: `order_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
      organizationId: input.organizationId,
      outletId: input.outletId,
      staffId: input.staffId,
      source: input.source,
      orderChannel: input.orderChannel,
      tableNumber: input.tableNumber ?? null,
      customerName: input.customerName ?? null,
      externalChannelOrderId: input.externalChannelOrderId ?? null,
      status: "DRAFT",
      subtotal,
      discount,
      serviceCharge,
      taxAmount,
      grandTotal,
      createdAt: now,
      updatedAt: now,
      items: normalizedItems,
      metadata: {
        orderSource: input.source,
        orderChannel: input.orderChannel ?? input.source,
      },
    };
  }

  submitOrder(
    order: OrderRecord,
    options: { idempotencyKey?: string | null; suppliedOrganizationId?: unknown; suppliedOutletId?: unknown }
  ): OrderSubmissionResult {
    assertServerAuthoritativeContext({
      authContext: {
        organizationId: order.organizationId,
        outletId: order.outletId,
      },
      suppliedOrganizationId: options.suppliedOrganizationId,
      suppliedOutletId: options.suppliedOutletId,
    });

    const idempotencyKey = (options.idempotencyKey ?? `${order.organizationId}:${order.outletId}:${order.id}`).trim();
    if (!idempotencyKey) {
      throw new DuplicateSubmissionError("Order idempotency key is required.");
    }

    const existing = this.submissionRegistry.get(idempotencyKey);
    if (existing) {
      return {
        duplicate: true,
        orderId: existing.id,
        status: existing.status,
        order: existing,
      };
    }

    if (order.status !== "DRAFT") {
      throw new InvalidOrderTransitionError(`Order cannot be submitted from status ${order.status}.`);
    }

    const submitted: OrderRecord = {
      ...order,
      idempotencyKey,
      status: "PENDING",
      updatedAt: new Date(),
    };

    this.submissionRegistry.set(idempotencyKey, submitted);

    return {
      duplicate: false,
      orderId: submitted.id,
      status: submitted.status,
      order: submitted,
    };
  }

  transitionOrder(order: OrderRecord, nextStatus: OrderStatus): OrderRecord {
    const allowed = ORDER_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new InvalidOrderTransitionError(
        `Invalid transition: ${order.status} -> ${nextStatus}`
      );
    }

    return {
      ...order,
      status: nextStatus,
      updatedAt: new Date(),
    };
  }

  confirmOrder(order: OrderRecord, options: OrderLifecycleOptions = {}): { order: OrderRecord; audit: AuditEvent[] } {
    const auditLogger = options.auditLogger ?? new AuditLogger();
    const updated = this.transitionOrder(order, "CONFIRMED");
    const audit = [
      auditLogger.record("ORDER_CONFIRMED", {
        orderId: order.id,
        organizationId: order.organizationId,
        outletId: order.outletId,
        staffId: order.staffId,
      }),
    ];

    return { order: updated, audit };
  }

  startProcessing(order: OrderRecord, options: OrderLifecycleOptions = {}): { order: OrderRecord; audit: AuditEvent[] } {
    const auditLogger = options.auditLogger ?? new AuditLogger();
    const updated = this.transitionOrder(order, "PROCESSING");
    const audit = [
      auditLogger.record("ORDER_PROCESSING", {
        orderId: order.id,
        organizationId: order.organizationId,
        outletId: order.outletId,
        staffId: order.staffId,
      }),
    ];

    return { order: updated, audit };
  }

  markReady(order: OrderRecord, options: OrderLifecycleOptions = {}): { order: OrderRecord; audit: AuditEvent[] } {
    const auditLogger = options.auditLogger ?? new AuditLogger();
    const updated = this.transitionOrder(order, "READY");
    const audit = [
      auditLogger.record("ORDER_READY", {
        orderId: order.id,
        organizationId: order.organizationId,
        outletId: order.outletId,
        staffId: order.staffId,
      }),
    ];

    return { order: updated, audit };
  }

  cancelOrder(order: OrderRecord, options: OrderLifecycleOptions = {}): { order: OrderRecord; audit: AuditEvent[] } {
    const auditLogger = options.auditLogger ?? new AuditLogger();
    const updated = this.transitionOrder(order, "CANCELLED");
    const audit = [
      auditLogger.record("ORDER_CANCELLED", {
        orderId: order.id,
        organizationId: order.organizationId,
        outletId: order.outletId,
        staffId: order.staffId,
      }),
    ];

    return { order: updated, audit };
  }

  completeOrder(order: OrderRecord, options: OrderLifecycleOptions = {}): OrderCompletionResult {
    const authContext = options.authContext ?? { organizationId: order.organizationId, outletId: order.outletId };
    assertServerAuthoritativeContext({
      authContext,
      suppliedOrganizationId: options.suppliedOrganizationId,
      suppliedOutletId: options.suppliedOutletId,
    });

    const previous = this.completionRegistry.get(order.id);
    if (order.status === "COMPLETED" || previous) {
      const canonical = previous ?? order;
      return {
        duplicate: true,
        order: canonical,
        audit: [],
        inventory: [],
      };
    }

    if (order.status !== "READY") {
      throw new InvalidOrderTransitionError(`Order cannot be completed from status ${order.status}.`);
    }

    const auditLogger = options.auditLogger ?? new AuditLogger();
    const completed = this.transitionOrder(order, "COMPLETED");
    const audit: AuditEvent[] = [
      auditLogger.record("ORDER_COMPLETED", {
        orderId: order.id,
        organizationId: order.organizationId,
        outletId: order.outletId,
        staffId: order.staffId,
        paymentStatus: options.paymentStatus ?? "UNKNOWN",
      }),
    ];

    const inventoryProcessor = options.inventoryProcessor;
    let inventory: Array<Record<string, unknown>> = [];

    if (inventoryProcessor) {
      const processorResult = inventoryProcessor.processCompletedOrder({
        order: completed,
        organizationId: order.organizationId,
        outletId: order.outletId,
        createdBy: options.createdBy ?? order.staffId,
        recipeVersion: options.recipeVersion,
      });

      if (processorResult.status === "INSUFFICIENT_STOCK") {
        throw new Error(`Inventory consumption rejected for order ${order.id}.`);
      }

      inventory = processorResult.movements ?? [];
      for (const event of processorResult.audit ?? []) {
        audit.push(auditLogger.record(event.type, event.payload ?? {}));
      }
    }

    this.completionRegistry.set(order.id, completed);
    return {
      duplicate: false,
      order: completed,
      audit,
      inventory,
    };
  }

  buildInventoryConsumptionEvent(order: OrderRecord, item: OrderItemSnapshot): InventoryConsumptionEvent {
    return InventoryEventBuilder.build({
      orderId: order.id,
      orderItemId: item.id,
      menuItemId: item.id,
      quantity: item.quantity,
      recipeVersion: `recipe:${order.organizationId}:${order.outletId}`,
      outletId: order.outletId,
    });
  }
}

export class TaxEngine {
  static calculate({
    subtotal,
    discount = 0,
    serviceCharge = 0,
    mode,
    rate = 0,
    fixedAmount = 0,
    appliesTo,
    isInclusive = false,
  }: {
    subtotal: number;
    discount?: number;
    serviceCharge?: number;
    mode: TaxCalculationMode;
    rate?: number;
    fixedAmount?: number;
    appliesTo: TaxAppliesTo;
    isInclusive?: boolean;
  }): number {
    const base = (() => {
      switch (appliesTo) {
        case "SUBTOTAL":
          return subtotal;
        case "AFTER_DISCOUNT":
          return subtotal - discount;
        case "AFTER_SERVICE_CHARGE":
          return subtotal + serviceCharge;
        case "AFTER_DISCOUNT_AND_SERVICE":
          return subtotal - discount + serviceCharge;
        default:
          return subtotal;
      }
    })();

    if (mode === "PERCENTAGE") {
      const resolvedRate = rate ?? 0;
      if (resolvedRate <= 0) {
        return 0;
      }
      if (isInclusive) {
        return Math.round((base * resolvedRate) / (1 + resolvedRate));
      }
      return Math.round(base * resolvedRate);
    }

    return Math.max(0, fixedAmount);
  }

  static calculateOrder({
    subtotal,
    discount = 0,
    serviceCharge = 0,
    rules = [],
  }: {
    subtotal: number;
    discount?: number;
    serviceCharge?: number;
    rules?: PaymentRule[];
  }): {
    taxAmount: number;
    taxableAmount: number;
    snapshots: TaxSnapshot[];
  } {
    const orderedRules = [...rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    let taxAmount = 0;
    const snapshots: TaxSnapshot[] = [];

    for (const rule of orderedRules) {
      const taxableAmount = (() => {
        switch (rule.appliesTo) {
          case "SUBTOTAL":
            return subtotal;
          case "AFTER_DISCOUNT":
            return subtotal - discount;
          case "AFTER_SERVICE_CHARGE":
            return subtotal + serviceCharge;
          case "AFTER_DISCOUNT_AND_SERVICE":
            return subtotal - discount + serviceCharge;
          default:
            return subtotal;
        }
      })();

      const rate = rule.rate ?? 0;
      const taxValue = this.calculate({
        subtotal,
        discount,
        serviceCharge,
        mode: rule.type,
        rate,
        fixedAmount: rule.fixedAmount ?? 0,
        appliesTo: rule.appliesTo,
        isInclusive: rule.isInclusive ?? false,
      });

      taxAmount += taxValue;
      snapshots.push({
        taxId: rule.id,
        taxName: rule.name,
        taxCode: rule.code,
        code: rule.code,
        rate,
        type: rule.type,
        calculationMethod: rule.type,
        taxableAmount,
        taxAmount: taxValue,
        isInclusive: rule.isInclusive ?? false,
        priority: rule.priority ?? 0,
        createdAt: new Date(),
      });
    }

    return {
      taxAmount,
      taxableAmount: subtotal - discount + serviceCharge,
      snapshots,
    };
  }
}

export class MockPaymentAdapter {
  create({ orderId, amount, method, reference, metadata }: {
    orderId: string;
    amount: number;
    method: PaymentMethod;
    reference: string;
    metadata?: PaymentMetadata;
  }): PaymentMetadata {
    if (method === "QRIS") {
      return {
        provider: "mock-qris-provider",
        providerStatus: "QR_GENERATED",
        externalReference: `qris_${reference}_${amount}`,
        ...metadata,
      };
    }

    if (method === "EDC") {
      return {
        provider: "mock-edc-provider",
        providerStatus: "SENT_TO_TERMINAL",
        externalReference: `edc_${reference}_${amount}`,
        ...metadata,
      };
    }

    return {
      provider: "mock-cash-provider",
      providerStatus: "INITIATED",
      externalReference: `cash_${reference}_${amount}`,
      ...metadata,
    };
  }

  async authorize(): Promise<"SUCCESS" | "FAILED"> {
    return "SUCCESS";
  }
}

export class PaymentService {
  private readonly paymentRegistry = new Map<string, PaymentTransaction>();
  private readonly idempotencyRegistry = new Map<string, string>();

  constructor(private readonly adapter: PaymentAdapter | MockPaymentAdapter = new PaymentAdapter()) {}

  private normalizeContext(authContext?: { organizationId?: string; outletId?: string } | null, organizationId?: string, outletId?: string) {
    const normalizedOrg = typeof organizationId === "string" ? organizationId.trim() : null;
    const normalizedOutlet = typeof outletId === "string" ? outletId.trim() : null;

    assertServerAuthoritativeContext({
      authContext,
      suppliedOrganizationId: normalizedOrg,
      suppliedOutletId: normalizedOutlet,
    });

    if (authContext && normalizedOrg && authContext.organizationId && normalizedOrg !== authContext.organizationId) {
      throw new PaymentServiceError("Manipulated organization context detected.");
    }

    if (authContext && normalizedOutlet && authContext.outletId && normalizedOutlet !== authContext.outletId) {
      throw new PaymentServiceError("Manipulated outlet context detected.");
    }
  }

  createPayment({
    orderId,
    organizationId,
    outletId,
    amount,
    currency = "IDR",
    method,
    idempotencyKey,
    authContext,
    amountReceived,
    amountDue,
    metadata,
    reference,
  }: {
    orderId: string;
    organizationId: string;
    outletId: string;
    amount: number;
    currency?: string;
    method: PaymentMethod;
    idempotencyKey?: string;
    authContext?: { organizationId?: string; outletId?: string } | null;
    amountReceived?: number;
    amountDue?: number;
    metadata?: PaymentMetadata;
    reference?: string;
  }): PaymentTransaction {
    this.normalizeContext(authContext, organizationId, outletId);

    const resolvedIdempotencyKey = (idempotencyKey ?? `${organizationId}:${outletId}:${orderId}:${method}:${amount}`).trim();
    if (this.idempotencyRegistry.has(resolvedIdempotencyKey)) {
      const existingId = this.idempotencyRegistry.get(resolvedIdempotencyKey);
      if (existingId && this.paymentRegistry.has(existingId)) {
        return this.paymentRegistry.get(existingId)!;
      }
    }

    const due = amountDue ?? amount;
    const received = amountReceived ?? due;
    if (method === "CASH" && received < due) {
      throw new PaymentServiceError("Insufficient cash received for this payment.");
    }

    const now = new Date();
    const baseReference = reference ?? `pay_${orderId}_${organizationId}_${outletId}_${method}_${now.getTime()}`;
    const providerMetadata = this.adapter.create({
      orderId,
      amount,
      method,
      reference: baseReference,
      metadata,
    });

    const payment: PaymentTransaction = {
      id: `payment_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
      orderId,
      organizationId,
      outletId,
      amount,
      amountDue: due,
      amountReceived: method === "CASH" ? received : undefined,
      change: method === "CASH" ? Math.max(received - due, 0) : 0,
      currency,
      method,
      status: "INITIATED",
      reference: baseReference,
      provider: providerMetadata.provider ?? "mock-payment-adapter",
      metadata: {
        ...providerMetadata,
        provider: providerMetadata.provider ?? "mock-payment-adapter",
        terminalId: metadata?.terminalId,
        merchantId: metadata?.merchantId,
        approvalCode: metadata?.approvalCode,
        RRN: metadata?.RRN,
        externalReference: providerMetadata.externalReference ?? metadata?.externalReference,
      },
      idempotencyKey: resolvedIdempotencyKey,
      createdAt: now,
      updatedAt: now,
    };

    this.paymentRegistry.set(payment.id, payment);
    this.idempotencyRegistry.set(resolvedIdempotencyKey, payment.id);

    return payment;
  }

  initiatePayment(payment: PaymentTransaction): PaymentTransaction {
    if (payment.status === "INITIATED") {
      return this.transition(payment, "PENDING");
    }
    return this.transition(payment, "PENDING");
  }

  initiate({ orderId, amount, method }: { orderId: string; amount: number; method: PaymentMethod }): PaymentTransaction {
    const now = new Date();
    return {
      id: `payment_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
      orderId,
      organizationId: "org-local",
      outletId: "outlet-local",
      amount,
      currency: "IDR",
      method,
      status: "INITIATED",
      reference: `pay_${orderId}_org-local_outlet-local_${method}_${now.getTime()}`,
      provider: "mock-payment-adapter",
      metadata: { provider: "mock-payment-adapter", providerStatus: "INITIATED" },
      createdAt: now,
      updatedAt: now,
    };
  }

  processPayment(payment: PaymentTransaction): PaymentTransaction {
    if (payment.status === "INITIATED") {
      return this.transition(this.transition(payment, "PENDING"), "PROCESSING");
    }
    if (payment.status === "PENDING") {
      return this.transition(payment, "PROCESSING");
    }
    return payment;
  }

  markSuccess(payment: PaymentTransaction): PaymentTransaction {
    if (payment.status === "PENDING") {
      return this.transition(this.transition(payment, "PROCESSING"), "SUCCESS");
    }
    return this.transition(payment, "SUCCESS");
  }

  markFailure(payment: PaymentTransaction): PaymentTransaction {
    if (payment.status === "PENDING") {
      return this.transition(payment, "FAILED");
    }
    return this.transition(payment, "FAILED");
  }

  markExpired(payment: PaymentTransaction): PaymentTransaction {
    return this.transition(payment, "EXPIRED");
  }

  markCancelled(payment: PaymentTransaction): PaymentTransaction {
    return this.transition(payment, "CANCELLED");
  }

  markUnknown(payment: PaymentTransaction): PaymentTransaction {
    return this.transition(payment, "UNKNOWN");
  }

  transition(payment: PaymentTransaction, nextStatus: PaymentStatus): PaymentTransaction {
    const allowed = PAYMENT_TRANSITIONS[payment.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new InvalidPaymentTransitionError(
        `Invalid payment transition: ${payment.status} -> ${nextStatus}`
      );
    }

    const updated: PaymentTransaction = {
      ...payment,
      status: nextStatus,
      updatedAt: new Date(),
      metadata: {
        ...payment.metadata,
        providerStatus: nextStatus,
      },
    };

    this.paymentRegistry.set(payment.id, updated);
    return updated;
  }

  getPaymentStatus(reference: string): PaymentTransaction {
    const match = [...this.paymentRegistry.values()].find((payment) => payment.reference === reference);
    if (!match) {
      throw new PaymentServiceError(`Payment ${reference} was not found.`);
    }
    return match;
  }
}

export type KdsRoutingInput = {
  orderId: string;
  orderItemId: string;
  menuItemId: string;
  quantity: number;
  category?: string;
  station?: string;
};

export type KdsTicket = {
  orderId: string;
  orderItemId: string;
  menuItemId: string;
  quantity: number;
  category?: string;
  station: string;
  status: KdsStatus;
  routedAt: Date;
};

export class KdsRouter {
  routeItem(input: KdsRoutingInput): KdsTicket {
    const station = input.station ?? (input.category === "coffee" ? "Kitchen" : "Bar");

    return {
      orderId: input.orderId,
      orderItemId: input.orderItemId,
      menuItemId: input.menuItemId,
      quantity: input.quantity,
      category: input.category ?? "general",
      station,
      status: "QUEUED",
      routedAt: new Date(),
    };
  }

  transitionStatus(ticket: KdsTicket, nextStatus: KdsStatus): KdsTicket {
    const allowed = KDS_TRANSITIONS[ticket.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new InvalidOrderTransitionError(
        `Invalid KDS transition: ${ticket.status} -> ${nextStatus}`
      );
    }

    return {
      ...ticket,
      status: nextStatus,
      routedAt: new Date(),
    };
  }
}

export type InventoryConsumptionEvent = {
  type: "INVENTORY_CONSUMPTION_REQUESTED";
  orderId: string;
  orderItemId: string;
  menuItemId: string;
  quantity: number;
  recipeVersion: string;
  outletId: string;
  timestamp: Date;
};

export class InventoryEventBuilder {
  static build({
    orderId,
    orderItemId,
    menuItemId,
    quantity,
    recipeVersion,
    outletId,
  }: {
    orderId: string;
    orderItemId: string;
    menuItemId: string;
    quantity: number;
    recipeVersion: string;
    outletId: string;
  }): InventoryConsumptionEvent {
    return {
      type: "INVENTORY_CONSUMPTION_REQUESTED",
      orderId,
      orderItemId,
      menuItemId,
      quantity,
      recipeVersion,
      outletId,
      timestamp: new Date(),
    };
  }
}

export type AuditEvent = {
  type: string;
  payload: Record<string, unknown>;
  createdAt: Date;
};

export class AuditLogger {
  record(type: string, payload: Record<string, unknown>): AuditEvent {
    return {
      type,
      payload,
      createdAt: new Date(),
    };
  }
}
