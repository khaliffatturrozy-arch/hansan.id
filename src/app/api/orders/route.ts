import { NextResponse } from "next/server";
import { createOrder, listRecentOrders, OrderPersistenceError } from "@/lib/order-service";

export async function GET() {
  try {
    const orders = await listRecentOrders(20);
    return NextResponse.json({ ok: true, orders });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Gagal mengambil data order.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Payload order tidak valid atau item kosong.",
        },
        { status: 400 }
      );
    }

    const order = await createOrder({
      orderType: body.orderType,
      tableNumber: body.tableNumber,
      customerName: body.customerName,
      cashierName: body.cashierName,
      paymentMethod: body.paymentMethod,
      amountPaid: Number(body.amountPaid ?? 0),
      changeAmount: Number(body.changeAmount ?? 0),
      bankName: body.bankName,
      approvalCode: body.approvalCode,
      idempotencyKey: body.idempotencyKey,
      items: body.items,
    });

    const statusCode = order.duplicate ? 200 : 201;
    return NextResponse.json({ ok: true, order }, { status: statusCode });
  } catch (error) {
    const status = error instanceof OrderPersistenceError ? error.statusCode : 500;
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Gagal membuat order.",
      },
      { status }
    );
  }
}
