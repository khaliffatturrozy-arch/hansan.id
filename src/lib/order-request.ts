/**
 * HANSAN — POS order request boundary.
 *
 * Converts an untrusted request body into the ONLY fields the client is
 * authorized to choose. Everything else (user, staff, organization, outlet,
 * cashier identity, price, totals) is derived server-side.
 *
 * SECURITY CONTRACT — these body fields are IGNORED ENTIRELY and can never
 * influence the persisted order:
 *   organizationId, outletId, staffId, cashierName, approvalCode,
 *   price, unitPrice, subtotal, taxPb1, totalAmount, role, permissions
 *
 * They are not read, not defaulted from, and not merged. A client that supplies
 * them is not "corrected" — the values are simply discarded, so there is no
 * code path in which a client value can win.
 *
 * This module is pure (no Prisma, no Next.js) so the contract is directly
 * testable without a database.
 */

export const ORDER_TYPES = ["DINE_IN", "TAKEAWAY"] as const;
export const PAYMENT_METHODS = ["CASH", "QRIS", "CARD"] as const;

export type ParsedOrderType = (typeof ORDER_TYPES)[number];
export type ParsedPaymentMethod = (typeof PAYMENT_METHODS)[number];

export type ParsedOrderItem = {
  menuItemId: string;
  quantity: number;
  notes: string | null;
};

export type ParsedOrderRequest = {
  orderType: ParsedOrderType;
  tableNumber: string | null;
  customerName: string | null;
  paymentMethod: ParsedPaymentMethod;
  amountPaid: number;
  bankName: string | null;
  idempotencyKey: string | null;
  items: ParsedOrderItem[];
};

export class OrderRequestError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "OrderRequestError";
    this.statusCode = statusCode;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OrderRequestError("Payload order tidak valid.", 400);
  }
  return value as Record<string, unknown>;
}

function optionalString(value: unknown, maxLength = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function optionalInt(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.trunc(numeric);
}

/**
 * Extracts ONLY the identity fields that `validateClientIdentity` must inspect.
 *
 * These fields are NOT part of the accepted order contract. They are read here
 * solely so that a caller which still sends them is explicitly REJECTED rather
 * than silently accepted — a manipulated organization/outlet/role/permission
 * claim must never pass unnoticed.
 *
 * Everything else in the body is handled by `parseCreateOrderRequest`, which
 * never reads identity or pricing fields. `staffId`, `cashierName`,
 * `approvalCode`, `price`, `subtotal` and `totalAmount` are therefore ignored in
 * all cases: there is no code path in which a client-supplied value can win.
 */
export function extractClientIdentityClaims(body: unknown): {
  suppliedOrganizationId?: unknown;
  suppliedOutletId?: unknown;
  suppliedRole?: unknown;
  suppliedPermissions?: unknown;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }

  const record = body as Record<string, unknown>;

  return {
    suppliedOrganizationId: record.organizationId,
    suppliedOutletId: record.outletId,
    suppliedRole: record.role,
    suppliedPermissions: record.permissions,
  };
}

/**
 * Parses an untrusted body into the only fields the client is authorized to
 * choose. Identity and pricing fields present in the body are never read, so a
 * client value cannot reach the order service.
 */
export function parseCreateOrderRequest(body: unknown): ParsedOrderRequest {
  const record = asRecord(body);

  if (!Array.isArray(record.items) || record.items.length === 0) {
    throw new OrderRequestError("Payload order tidak valid atau item kosong.", 400);
  }

  const items: ParsedOrderItem[] = record.items.map((rawItem) => {
    const item = asRecord(rawItem);
    const menuItemId = typeof item.id === "string" ? item.id.trim() : "";
    const quantity = Number(item.quantity);

    if (!menuItemId) {
      throw new OrderRequestError("Setiap item order wajib memiliki id menu.", 400);
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new OrderRequestError("Jumlah item order harus lebih besar dari nol.", 400);
    }

    return {
      menuItemId,
      quantity: Math.trunc(quantity),
      notes: optionalString(item.notes, 500),
    };
  });

  const rawOrderType = optionalString(record.orderType)?.toUpperCase() ?? "DINE_IN";
  if (!ORDER_TYPES.includes(rawOrderType as ParsedOrderType)) {
    throw new OrderRequestError("Jenis order tidak valid.", 400);
  }

  const rawPaymentMethod = optionalString(record.paymentMethod)?.toUpperCase() ?? "CASH";
  if (!PAYMENT_METHODS.includes(rawPaymentMethod as ParsedPaymentMethod)) {
    throw new OrderRequestError("Metode pembayaran tidak valid.", 400);
  }

  return {
    orderType: rawOrderType as ParsedOrderType,
    tableNumber: optionalString(record.tableNumber, 60),
    customerName: optionalString(record.customerName, 120),
    paymentMethod: rawPaymentMethod as ParsedPaymentMethod,
    amountPaid: optionalInt(record.amountPaid),
    bankName: optionalString(record.bankName, 60),
    idempotencyKey: optionalString(record.idempotencyKey, 200),
    items,
  };
}
