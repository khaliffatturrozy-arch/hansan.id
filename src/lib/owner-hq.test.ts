export {};

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { OwnerHQService, buildOwnerOverviewSnapshot } = require("./owner-hq");

describe("owner HQ", () => {
  it("derives sales, payment, and refund summaries from source-of-truth records", () => {
    const service = new OwnerHQService();
    service.recordOrder({ id: "o-1", organizationId: "org-1", outletId: "outlet-1", status: "COMPLETED", grossSales: 250000, netSales: 220000, paidAt: new Date("2026-09-27T12:00:00Z") });
    service.recordOrder({ id: "o-2", organizationId: "org-1", outletId: "outlet-1", status: "CANCELLED", grossSales: 50000, netSales: 0, paidAt: new Date("2026-09-27T12:30:00Z") });
    service.recordPayment({ id: "p-1", organizationId: "org-1", outletId: "outlet-1", method: "QRIS", amount: 250000, status: "SUCCESS", createdAt: new Date("2026-09-27T12:00:00Z") });
    service.recordRefund({ id: "r-1", organizationId: "org-1", outletId: "outlet-1", orderId: "o-1", refundedAmount: 100000, method: "CASH", approvedBy: "manager-1", status: "APPROVED", createdAt: new Date("2026-09-27T13:00:00Z") });

    const sales = service.getSalesReport({ organizationId: "org-1", outletId: "outlet-1", period: "daily" });
    const payments = service.getPaymentReport({ organizationId: "org-1", outletId: "outlet-1", period: "daily" });
    const refund = service.getRefundReport({ organizationId: "org-1", outletId: "outlet-1", period: "daily" });

    assert.equal(sales.totalGross, 250000);
    assert.equal(payments.qris, 250000);
    assert.equal(refund.cashRefund, 100000);
    assert.equal(refund.netSaleAfterRefund, 120000);
  });
});

describe("owner HQ overview honesty", () => {
  it("does not report zero orders when orders await completion", () => {
    // PHASE C: orders are created PENDING. Reporting "No orders yet" here would
    // be a misleading zero for a tenant that has paid but unfulfilled orders.
    const snapshot = buildOwnerOverviewSnapshot({
      salesTotal: 0,
      completedOrderCount: 0,
      totalOrderCount: 3,
      awaitingCompletionCount: 3,
      staffCount: 1,
    });

    const orders = snapshot.find((metric: { label: string; value: string; detail: string }) => metric.label === "Orders");
    assert.match(orders.value, /3 orders/);
    assert.match(orders.detail, /awaiting completion/);
  });

  it("states that sales count only completed orders", () => {
    const snapshot = buildOwnerOverviewSnapshot({
      salesTotal: 0,
      completedOrderCount: 0,
      totalOrderCount: 1,
      awaitingCompletionCount: 1,
      staffCount: 1,
    });

    const sales = snapshot.find((metric: { label: string; value: string; detail: string }) => metric.label === "Sales (completed)");
    assert.match(sales.detail, /COMPLETED/);
  });

  it("marks unimplemented domains as unavailable rather than zero", () => {
    const snapshot = buildOwnerOverviewSnapshot({
      salesTotal: 0,
      completedOrderCount: 0,
      totalOrderCount: 0,
      awaitingCompletionCount: 0,
      staffCount: 0,
    });

    for (const label of ["Customers", "Inventory", "Reservations", "Refunds"]) {
      const metric = snapshot.find((entry: { label: string; status: string; value: string }) => entry.label === label);
      assert.equal(metric.status, "unavailable");
      assert.equal(metric.value, "Not implemented");
    }
  });
});
