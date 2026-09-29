export type OrderSummary = {
  id: string;
  organizationId: string;
  outletId: string;
  status: string;
  grossSales: number;
  netSales: number;
  paidAt: Date;
};

export type PaymentSummary = {
  id: string;
  organizationId: string;
  outletId: string;
  method: string;
  amount: number;
  status: string;
  createdAt: Date;
};

export type RefundSummary = {
  id: string;
  organizationId: string;
  outletId: string;
  orderId: string;
  refundedAmount: number;
  method: string;
  approvedBy: string;
  status: string;
  createdAt: Date;
};

export type OwnerOverviewMetric = {
  label: string;
  value: string;
  status: "empty" | "ready";
  detail: string;
};

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function buildOwnerOverviewSnapshot(input: {
  salesTotal: number;
  orderCount: number;
  paymentCount: number;
  customerCount: number;
  inventoryCount: number;
  reservationCount: number;
  staffCount: number;
}): OwnerOverviewMetric[] {
  return [
    {
      label: "Sales",
      value: input.salesTotal > 0 ? formatCurrency(input.salesTotal) : "No sales yet",
      status: input.salesTotal > 0 ? "ready" : "empty",
      detail: input.salesTotal > 0 ? `${input.orderCount} completed order(s)` : "No sales yet",
    },
    {
      label: "Orders",
      value: input.orderCount > 0 ? `${input.orderCount} orders` : "No orders yet",
      status: input.orderCount > 0 ? "ready" : "empty",
      detail: input.orderCount > 0 ? `${input.paymentCount} payment(s) captured` : "No orders yet",
    },
    {
      label: "Customers",
      value: input.customerCount > 0 ? `${input.customerCount} customers` : "No customers yet",
      status: input.customerCount > 0 ? "ready" : "empty",
      detail: input.customerCount > 0 ? "Customer records are active" : "No customers yet",
    },
    {
      label: "Inventory",
      value: input.inventoryCount > 0 ? `${input.inventoryCount} catalog items` : "No inventory data yet",
      status: input.inventoryCount > 0 ? "ready" : "empty",
      detail: input.inventoryCount > 0 ? "Inventory records available" : "No inventory data yet",
    },
    {
      label: "Payments",
      value: input.paymentCount > 0 ? `${input.paymentCount} payment transactions` : "No payment transactions yet",
      status: input.paymentCount > 0 ? "ready" : "empty",
      detail: input.paymentCount > 0 ? "Financial records are available" : "No payment transactions yet",
    },
    {
      label: "Reservations",
      value: input.reservationCount > 0 ? `${input.reservationCount} reservations` : "No reservations yet",
      status: input.reservationCount > 0 ? "ready" : "empty",
      detail: input.reservationCount > 0 ? "Reservation records are active" : "No reservations yet",
    },
    {
      label: "Staff",
      value: input.staffCount > 0 ? `${input.staffCount} staff members` : "No staff yet",
      status: input.staffCount > 0 ? "ready" : "empty",
      detail: input.staffCount > 0 ? "Staff access is configured" : "No staff yet",
    },
  ];
}

export function buildFinanceOverviewSnapshot(input: {
  paymentTotal: number;
  refundTotal: number;
  taxTotal: number;
  settlementCount: number;
}): OwnerOverviewMetric[] {
  return [
    {
      label: "Payments",
      value: input.paymentTotal > 0 ? formatCurrency(input.paymentTotal) : "No payment transactions yet",
      status: input.paymentTotal > 0 ? "ready" : "empty",
      detail: input.paymentTotal > 0 ? "Captured payment totals" : "No payment transactions yet",
    },
    {
      label: "Refunds",
      value: input.refundTotal > 0 ? formatCurrency(input.refundTotal) : "No refund records yet",
      status: input.refundTotal > 0 ? "ready" : "empty",
      detail: input.refundTotal > 0 ? "Refund totals recorded" : "No refund records yet",
    },
    {
      label: "Tax",
      value: input.taxTotal > 0 ? formatCurrency(input.taxTotal) : "No tax transactions yet",
      status: input.taxTotal > 0 ? "ready" : "empty",
      detail: input.taxTotal > 0 ? "Tax reports available" : "No tax transactions yet",
    },
    {
      label: "Settlements",
      value: input.settlementCount > 0 ? `${input.settlementCount} settlements` : "No settlements yet",
      status: input.settlementCount > 0 ? "ready" : "empty",
      detail: input.settlementCount > 0 ? "Settlement activity exists" : "No settlements yet",
    },
  ];
}

export class OwnerHQService {
  private readonly orders: OrderSummary[] = [];
  private readonly payments: PaymentSummary[] = [];
  private readonly refunds: RefundSummary[] = [];

  public recordOrder(input: OrderSummary): OrderSummary {
    this.orders.push(input);
    return input;
  }

  public recordPayment(input: PaymentSummary): PaymentSummary {
    this.payments.push(input);
    return input;
  }

  public recordRefund(input: RefundSummary): RefundSummary {
    this.refunds.push(input);
    return input;
  }

  public getSalesReport(input: { organizationId: string; outletId: string; period: string }): { totalGross: number; totalNet: number; completedOrders: number } {
    const records = this.orders.filter((order) => order.organizationId === input.organizationId && order.outletId === input.outletId && order.status === "COMPLETED");
    const totalGross = records.reduce((sum, order) => sum + order.grossSales, 0);
    const totalNet = records.reduce((sum, order) => sum + order.netSales, 0);
    return {
      totalGross,
      totalNet,
      completedOrders: records.length,
    };
  }

  public getPaymentReport(input: { organizationId: string; outletId: string; period: string }): Record<string, number> {
    const records = this.payments.filter((payment) => payment.organizationId === input.organizationId && payment.outletId === input.outletId && payment.status === "SUCCESS");
    const totals: Record<string, number> = {};
    for (const payment of records) {
      const key = payment.method.toLowerCase();
      totals[key] = (totals[key] ?? 0) + payment.amount;
    }
    return totals;
  }

  public getRefundReport(input: { organizationId: string; outletId: string; period: string }): { cashRefund: number; totalRefund: number; netSaleAfterRefund: number } {
    const records = this.refunds.filter((refund) => refund.organizationId === input.organizationId && refund.outletId === input.outletId && refund.status === "APPROVED");
    const totalRefund = records.reduce((sum, refund) => sum + refund.refundedAmount, 0);
    const cashRefund = records.filter((refund) => refund.method === "CASH").reduce((sum, refund) => sum + refund.refundedAmount, 0);
    const netSales = this.getSalesReport({ organizationId: input.organizationId, outletId: input.outletId, period: input.period }).totalNet;
    return {
      cashRefund,
      totalRefund,
      netSaleAfterRefund: netSales - totalRefund,
    };
  }
}
