export {};

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { CrossModuleWorkflowService } = require("./cross-module-integration");

describe("cross module integration", () => {
  it("runs in-store sale, reservation, and website order workflows deterministically", () => {
    const service = new CrossModuleWorkflowService();

    const sale = service.runInStoreSale({
      organizationId: "org-1",
      outletId: "outlet-1",
      staffId: "staff-1",
      customerId: "customer-1",
      orderTotal: 150000,
      paymentMethod: "CASH",
      workflowId: "sale-1",
    });

    const reservation = service.runReservationDineIn({
      organizationId: "org-1",
      outletId: "outlet-1",
      customerId: "customer-2",
      guestCount: 4,
      reservationId: "rsv-1",
    });

    const website = service.runWebsiteOrder({
      organizationId: "org-1",
      outletId: "outlet-1",
      customerId: "customer-3",
      orderTotal: 120000,
      paymentMethod: "QRIS",
      workflowId: "website-1",
    });

    assert.equal(sale.orderStatus, "COMPLETED");
    assert.equal(reservation.reservationStatus, "SEATED");
    assert.equal(website.orderStatus, "COMPLETED");
    assert.equal(service.runPromotionLoyalty({
      organizationId: "org-1",
      outletId: "outlet-1",
      customerId: "customer-1",
      subtotal: 250000,
      promotionType: "percentage",
      pointsEarned: 250,
    }).pointsApplied, 250);
  });
});
