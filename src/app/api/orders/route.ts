import { NextResponse } from "next/server";
import { requireOutlet, requireProtectedRequest } from "@/lib/auth";
import { toSafeApiError } from "@/lib/api-errors";
import { extractClientIdentityClaims, parseCreateOrderRequest } from "@/lib/order-request";
import { createOrder, listRecentOrders } from "@/lib/order-service";
import { PERMISSION } from "@/lib/permissions";

/**
 * GET /api/orders
 *
 * Recent orders for the AUTHENTICATED tenant and the caller's own outlet.
 * Both scoping values come from the server-side session, never the request.
 */
export async function GET(request: Request) {
  try {
    const authContext = await requireProtectedRequest(request, [PERMISSION.ORDERS_READ]);
    const outletId = requireOutlet(authContext);

    const orders = await listRecentOrders(20, authContext.organizationId, outletId);

    return NextResponse.json({ ok: true, orders });
  } catch (error) {
    const { status, body } = toSafeApiError(error, "Gagal mengambil data order.");
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/orders
 *
 * PHASE C SERVER-DERIVED CONTRACT
 *
 * Accepted from the client (nothing else):
 *   items: [{ id, quantity, notes? }]   — menu item ids, never prices
 *   orderType, tableNumber?, customerName?
 *   paymentMethod, amountPaid? (cash tendered only), bankName?
 *   idempotencyKey?
 *
 * `changeAmount`, `price`, `unitPrice`, `subtotal`, `taxPb1` and `totalAmount`
 * are NOT accepted: all are derived from the server-resolved item prices.
 *
 * Derived server-side and therefore impossible to spoof:
 *   staffId, organizationId, outletId, cashierName, price, subtotal,
 *   taxPb1, totalAmount, authorization
 *
 * `staffId`, `cashierName`, `approvalCode`, `price`, `subtotal` and
 * `totalAmount` are never read from the body. `organizationId`, `outletId`,
 * `role` and `permissions` are read ONLY to be validated and rejected if they
 * contradict the authenticated context.
 */
export async function POST(request: Request) {
  try {
    let rawBody: unknown;

    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Payload order tidak valid.", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    // Shape/type boundary. Never reads identity or pricing fields.
    const parsed = parseCreateOrderRequest(rawBody);

    // Authentication + authorization. Client identity claims are rejected here
    // if they disagree with the authenticated staff context.
    const authContext = await requireProtectedRequest(
      request,
      [PERMISSION.ORDERS_CREATE],
      extractClientIdentityClaims(rawBody)
    );

    // Explicit, fail-loud outlet resolution. No empty-string fallback.
    const outletId = requireOutlet(authContext);

    const order = await createOrder({
      organizationId: authContext.organizationId,
      outletId,
      staffId: authContext.staffId,
      // Cashier identity comes from the authenticated Staff record.
      cashierName: authContext.staffName ?? authContext.email,
      orderType: parsed.orderType,
      tableNumber: parsed.tableNumber,
      customerName: parsed.customerName,
      paymentMethod: parsed.paymentMethod,
      amountPaid: parsed.amountPaid,
      bankName: parsed.bankName,
      idempotencyKey: parsed.idempotencyKey,
      items: parsed.items.map((item) => ({
        id: item.menuItemId,
        quantity: item.quantity,
        notes: item.notes,
      })),
    });

    return NextResponse.json({ ok: true, order }, { status: order.duplicate ? 200 : 201 });
  } catch (error) {
    const { status, body } = toSafeApiError(error, "Gagal membuat order.");
    return NextResponse.json(body, { status });
  }
}
