import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type CreateOrderInput = {
  orderType: "DINE_IN" | "TAKEAWAY";
  tableNumber?: string | null;
  customerName?: string | null;
  cashierName?: string | null;
  subtotal?: number;
  taxPb1?: number;
  totalAmount?: number;
  paymentMethod: "CASH" | "QRIS" | "CARD";
  amountPaid?: number;
  changeAmount?: number;
  bankName?: string | null;
  approvalCode?: string | null;
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
      "DATABASE_URL belum diatur. Tambahkan konfigurasi database sebelum menyimpan order.",
      500
    );
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

  const menuItems = await prisma.menuItem.findMany({
    where: {
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

  const serverTax = Math.round(serverSubtotal * 0.1);
  const serverTotal = serverSubtotal + serverTax;

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
      totalAmount: true,
      status: true,
      createdAt: true,
    },
  });

  if (existingOrder) {
    return {
      id: existingOrder.id,
      orderNumber: existingOrder.orderNumber,
      status: existingOrder.status,
      totalAmount: existingOrder.totalAmount,
      paymentMethod: input.paymentMethod,
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
          orderNumber,
          idempotencyKey,
          orderType: input.orderType,
          tableNumber: input.tableNumber ?? null,
          customerName: input.customerName ?? null,
          cashierName: input.cashierName ?? "System",
          subtotal: serverSubtotal,
          taxPb1: serverTax,
          totalAmount: serverTotal,
          status: "COMPLETED",
          paymentMethod: input.paymentMethod,
          amountPaid,
          changeAmount,
          bankName: input.bankName ?? null,
          approvalCode: input.approvalCode ?? null,
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
      status: order.status,
      totalAmount: order.totalAmount,
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

export async function listRecentOrders(limit = 20) {
  if (!process.env.DATABASE_URL) {
    return [];
  }

  return prisma.order.findMany({
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
