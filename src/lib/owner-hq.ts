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
