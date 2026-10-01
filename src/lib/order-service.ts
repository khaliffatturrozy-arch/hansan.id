import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { computeOrderTotals } from "@/lib/pricing";

/**
 * PHASE C INPUT CONTRACT
 *
 * Identity, pricing and payment-authorization values are NOT part of this type,
 * because they must never be supplied by a caller that has not already been
 * authenticated and authorized:
 *
 *   REMOVED (previously accepted and silently ignored) : subtotal, taxPb1, totalAmount
 *   REMOVED (previously accepted and persisted)        : approvalCode
 *   REMOVED (always recomputed by this service)        : changeAmount
 *
 * `cashierName` is now REQUIRED and must be supplied by the server from the
 * authenticated Staff record. The previous `?? "System"` default fabricated an
 * operator identity for the receipt and the audit trail.
 */
export type CreateOrderInput = {
  organizationId: string;
  outletId: string;
  staffId: string;
  cashierName: string;
  orderType: "DINE_IN" | "TAKEAWAY";
  tableNumber?: string | null;
  customerName?: string | null;
  paymentMethod: "CASH" | "QRIS" | "CARD";
  amountPaid?: number;
  bankName?: string | null;
  idempotencyKey?: string | null;
  items: Array<{
    id: string;
    quantity: number;
    notes?: string | null;
  }>;
};

export class OrderPersistenceError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "OrderPersistenceError";
    this.statusCode = statusCode;
  }
}

function normalizeQuantity(value: unknown) {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? quantity : NaN;
}

function buildIdempotencyKey(input: CreateOrderInput) {
  const normalized = input.items
    .map((item) => `${item.id}:${normalizeQuantity(item.quantity)}`)
    .sort()
    .join("|");

  const payload = JSON.stringify({
    orderType: input.orderType,
    paymentMethod: input.paymentMethod,
    customerName: input.customerName ?? null,
    tableNumber: input.tableNumber ?? null,
    items: normalized,
  });

  return createHash("sha256").update(payload).digest("hex");
}

export async function createOrder(input: CreateOrderInput) {
  if (!process.env.DATABASE_URL) {
    throw new OrderPersistenceError(
      "BLOCKED_EXTERNAL_DEPENDENCY: DATABASE_URL belum diatur. Tambahkan konfigurasi database sebelum menyimpan order.",
      500
    );
  }

  if (!input.organizationId || !input.outletId || !input.staffId) {
    throw new OrderPersistenceError("Context organisasi, outlet, dan staff wajib valid.", 403);
  }

  if (!input.items || input.items.length === 0) {
    throw new OrderPersistenceError("Order minimal harus memiliki 1 item.", 400);
  }

  if (!input.orderType || !["DINE_IN", "TAKEAWAY"].includes(input.orderType)) {
    throw new OrderPersistenceError("Jenis order tidak valid.", 400);
  }

  const normalizedItems = input.items.map((item) => ({
    id: String(item.id ?? "").trim(),
    quantity: normalizeQuantity(item.quantity),
    notes: item.notes ?? null,
  }));

  const invalidItem = normalizedItems.find(
    (item) => !item.id || Number.isNaN(item.quantity) || item.quantity <= 0
  );

  if (invalidItem) {
    throw new OrderPersistenceError("Data item order tidak valid.", 400);
  }

  // TENANT-SCOPED MENU LOOKUP (Phase B).
  // The organizationId filter is MANDATORY. Without it, a menu item id belonging
  // to another tenant could be priced and persisted into this tenant's order.
  // MenuItem is now tenant-owned at the database level, and this query is the
  // only place the application reads the catalog.
  const menuItems = await prisma.menuItem.findMany({
    where: {
      organizationId: input.organizationId,
      id: { in: normalizedItems.map((item) => item.id) },
    },
    select: {
      id: true,
      name: true,
      price: true,
      stockCount: true,
      isAvailable: true,
    },
  });

  const menuMap = new Map(menuItems.map((item) => [item.id, item]));

  const orderEntries: Array<{
    id: string;
    quantity: number;
    notes: string | null;
    unitPrice: number;
    subtotal: number;
    name: string;
  }> = [];

  let serverSubtotal = 0;

  for (const item of normalizedItems) {
    const menuItem = menuMap.get(item.id);
    if (!menuItem) {
      throw new OrderPersistenceError(`Menu item tidak ditemukan untuk ID ${item.id}.`, 400);
    }

    if (!menuItem.isAvailable) {
      throw new OrderPersistenceError(`Menu ${menuItem.name} sedang tidak tersedia.`, 409);
    }

    if (menuItem.stockCount < item.quantity) {
      throw new OrderPersistenceError(
        `Stok ${menuItem.name} tidak cukup untuk qty ${item.quantity}.`,
        409
      );
    }

    const subtotal = menuItem.price * item.quantity;
    orderEntries.push({
      id: item.id,
      quantity: item.quantity,
      notes: item.notes,
      unitPrice: menuItem.price,
      subtotal,
      name: menuItem.name,
    });
    serverSubtotal += subtotal;
  }

  // Server-authoritative totals. The rate and rounding come from the shared
  // pricing rules (src/lib/pricing.ts) so the POS display and the persisted
  // order cannot drift, and `totalAmount === subtotal + taxPb1` is guaranteed
  // (also enforced by the Order_total_consistency_check database constraint).
  const totals = computeOrderTotals(serverSubtotal);
  const serverTax = totals.taxPb1;
  const serverTotal = totals.totalAmount;

  const amountPaid = (() => {
    if (input.paymentMethod !== "CASH") {
      return 0;
    }

    const value = Number(input.amountPaid ?? 0);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  })();

  if (input.paymentMethod === "CASH" && amountPaid < serverTotal) {
    throw new OrderPersistenceError("Uang yang diterima kurang dari total tagihan.", 400);
  }

  const changeAmount = input.paymentMethod === "CASH" ? Math.max(amountPaid - serverTotal, 0) : 0;

  const idempotencyKey = (input.idempotencyKey ?? buildIdempotencyKey(input)).trim();
  if (!idempotencyKey) {
    throw new OrderPersistenceError("Idempotency key tidak valid.", 400);
  }

  const existingOrder = await prisma.order.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      orderNumber: true,
      subtotal: true,
      taxPb1: true,
      totalAmount: true,
      amountPaid: true,
      changeAmount: true,
      cashierName: true,
      status: true,
      paymentMethod: true,
      createdAt: true,
      organizationId: true,
      outletId: true,
      staffId: true,
    },
  });

  if (existingOrder && (existingOrder.organizationId !== input.organizationId || existingOrder.outletId !== input.outletId)) {
    throw new OrderPersistenceError("Context outlet atau organisasi tidak sesuai dengan order yang sudah dibuat.", 409);
  }

  if (existingOrder) {
    return {
      id: existingOrder.id,
      orderNumber: existingOrder.orderNumber,
      subtotal: existingOrder.subtotal,
      taxPb1: existingOrder.taxPb1,
      totalAmount: existingOrder.totalAmount,
      amountPaid: existingOrder.amountPaid,
      changeAmount: existingOrder.changeAmount,
      cashierName: existingOrder.cashierName,
      status: existingOrder.status,
      paymentMethod: existingOrder.paymentMethod,
      createdAt: existingOrder.createdAt,
      duplicate: true,
    };
  }

  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  let orderNumber = `HN-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await prisma.order.findUnique({
      where: { orderNumber },
      select: { id: true },
    });

    if (!existing) {
      break;
    }

    orderNumber = `HN-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          organizationId: input.organizationId,
          outletId: input.outletId,
          staffId: input.staffId,
          orderNumber,
          idempotencyKey,
          orderType: input.orderType,
          tableNumber: input.tableNumber ?? null,
          customerName: input.customerName ?? null,
          // Cashier identity is the authenticated Staff member supplied by the
          // server route. No default is fabricated.
          cashierName: input.cashierName,
          subtotal: serverSubtotal,
          taxPb1: serverTax,
          totalAmount: serverTotal,
          // PHASE C LIFECYCLE DECISION — the initial state is PENDING.
          //  - COMPLETED was wrong: no fulfilment has occurred, yet every order
          //    looked finished the moment it was rung up.
          //  - PROCESSING was wrong: nothing is being prepared yet, and no KDS
          //    exists to acknowledge the ticket.
          //  - PENDING is the schema default: "recorded and accepted, not yet
          //    started". Payment is recorded by paymentMethod/amountPaid, not by
          //    status.
          // The remaining transitions and their authorization rules belong to a
          // later phase (order lifecycle + inventory).
          status: "PENDING",
          paymentMethod: input.paymentMethod,
          amountPaid,
          changeAmount,
          bankName: input.bankName ?? null,
          // Never recorded from a client. There is no payment gateway, and a
          // client-supplied approval code is not evidence of payment. The column
          // is retained for future gateway integration only.
          approvalCode: null,
        },
      });

      await tx.orderItem.createMany({
        data: orderEntries.map((entry) => ({
          orderId: createdOrder.id,
          menuItemId: entry.id,
          quantity: entry.quantity,
          unitPrice: entry.unitPrice,
          subtotal: entry.subtotal,
          notes: entry.notes,
        })),
      });

      // Inventory deduction is intentionally deferred. The current repo has no
      // complete stock ledger, recipe/BOM, or outlet-scoped inventory model.
      // Order creation must remain transaction-safe and atomic without making a
      // permanent, premature inventory mutation decision.
      return createdOrder;
    });

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      subtotal: order.subtotal,
      taxPb1: order.taxPb1,
      totalAmount: order.totalAmount,
      amountPaid: order.amountPaid,
      changeAmount: order.changeAmount,
      cashierName: order.cashierName,
      status: order.status,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt,
      duplicate: false,
    };
  } catch (error) {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes("duplicate") || message.includes("unique constraint")) {
        throw new OrderPersistenceError("Transaksi duplikat terdeteksi.", 409);
      }
    }

    throw new OrderPersistenceError("Gagal menyimpan order. Transaksi dibatalkan.", 500);
  }
}

export async function listRecentOrders(limit = 20, organizationId?: string, outletId?: string) {
  if (!process.env.DATABASE_URL) {
    return [];
  }

  return prisma.order.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      ...(outletId ? { outletId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      items: {
        include: {
          menuItem: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });
}
