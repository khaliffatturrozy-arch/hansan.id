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
  /**
   * PHASE C:
   *  "unavailable" = the domain is not implemented at all. It must never be
   *  rendered as 0, because a zero reads as real business data ("we have no
   *  customers") when the truth is "there is no customer model".
   */
  status: "empty" | "ready" | "unavailable";
  detail: string;
};

const NOT_IMPLEMENTED = "Not implemented";

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * PHASE C — HONEST OWNER OVERVIEW.
 *
 * Phase C changes the initial order status from COMPLETED to PENDING, so a
 * metric set that derived "Sales" and "Orders" only from COMPLETED orders would
 * report "No sales yet" and "No orders yet" while paid orders were sitting
 * unfulfilled. That would be a misleading zero. The snapshot now reports:
 *   - completed sales, with the basis stated explicitly
 *   - the true total order count, plus how many are awaiting completion
 *
 * Domains with no model are reported as `unavailable` rather than as 0.
 */
export function buildOwnerOverviewSnapshot(input: {
  /** Sum of totalAmount over COMPLETED orders only. */
  salesTotal: number;
  completedOrderCount: number;
  /** Every order recorded for the tenant, in any lifecycle state. */
  totalOrderCount: number;
  /** Accepted but not yet completed: PENDING / PROCESSING / READY. */
  awaitingCompletionCount: number;
  staffCount: number;
}): OwnerOverviewMetric[] {
  return [
    {
      label: "Sales (completed)",
      value:
        input.salesTotal > 0
          ? formatCurrency(input.salesTotal)
          : "No completed sales yet",
      status: input.salesTotal > 0 ? "ready" : "empty",
      detail:
        input.salesTotal > 0
          ? `From ${input.completedOrderCount} completed order(s)`
          : "Only orders that reached COMPLETED are counted here",
    },
    {
      label: "Orders",
      value: input.totalOrderCount > 0 ? `${input.totalOrderCount} orders` : "No orders yet",
      status: input.totalOrderCount > 0 ? "ready" : "empty",
      detail:
        input.awaitingCompletionCount > 0
          ? `${input.completedOrderCount} completed · ${input.awaitingCompletionCount} awaiting completion`
          : `${input.completedOrderCount} completed`,
    },
    {
      label: "Staff",
      value:
        input.staffCount > 0 ? `${input.staffCount} staff members` : "No staff yet",
      status: input.staffCount > 0 ? "ready" : "empty",
      detail: input.staffCount > 0 ? "Staff access is configured" : "No staff yet",
    },
    {
      label: "Customers",
      value: NOT_IMPLEMENTED,
      status: "unavailable",
      detail: "No customer model exists yet.",
    },
    {
      label: "Inventory",
      value: NOT_IMPLEMENTED,
      status: "unavailable",
      detail: "No inventory ledger exists yet.",
    },
    {
      label: "Reservations",
      value: NOT_IMPLEMENTED,
      status: "unavailable",
      detail: "No reservation model exists yet.",
    },
    {
      label: "Refunds",
      value: NOT_IMPLEMENTED,
      status: "unavailable",
      detail: "No refund model exists yet.",
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
