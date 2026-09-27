export {};

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { PromotionEngineService } = require("./promotion-engine");

describe("promotion engine", () => {
  it("applies a campaign discount and prevents duplicate redemption", () => {
    const service = new PromotionEngineService();
    const promo = service.createPromotion({
      id: "promo-1",
      organizationId: "org-1",
      outletId: "outlet-1",
      name: "Weekend 10% Off",
      description: "10% off all main courses",
      type: "percentage",
      audience: "everyone",
      benefit: { type: "percentage", value: 10 },
      minSpend: 50000,
      startAt: new Date("2026-01-01T00:00:00Z"),
      endAt: new Date("2026-12-31T00:00:00Z"),
      active: true,
      stackingEnabled: false,
      priority: 10,
    });

    const order = {
      id: "order-100",
      organizationId: "org-1",
      outletId: "outlet-1",
      subtotal: 200000,
      customerId: "customer-1",
    };

    const result = service.applyPromotionToOrder({
      promotionId: promo.id,
      order,
      customerId: "customer-1",
      channel: "IN_STORE",
    });

    const duplicate = service.applyPromotionToOrder({
      promotionId: promo.id,
      order,
      customerId: "customer-1",
      channel: "IN_STORE",
    });

    assert.equal(result.discountAmount, 20000);
    assert.equal(duplicate.duplicate, true);
  });

  it("supports vouchers and deterministic stacking order", () => {
    const service = new PromotionEngineService();
    const voucher = service.issueVoucher({
      id: "v-1",
      organizationId: "org-1",
      outletId: "outlet-1",
      code: "SAVE10",
      value: 10000,
      type: "fixed",
      minSpend: 60000,
      customerId: "customer-2",
      maxUses: 1,
      active: true,
    });

    const promo = service.createPromotion({
      id: "promo-2",
      organizationId: "org-1",
      outletId: "outlet-1",
      name: "Buffet Boost",
      description: "Extra 5% for members",
      type: "percentage",
      audience: "members",
      benefit: { type: "percentage", value: 5 },
      minSpend: 0,
      startAt: new Date("2026-01-01T00:00:00Z"),
      endAt: new Date("2026-12-31T00:00:00Z"),
      active: true,
      stackingEnabled: true,
      priority: 5,
    });

    const order = {
      id: "order-200",
      organizationId: "org-1",
      outletId: "outlet-1",
      subtotal: 120000,
      customerId: "customer-2",
    };

    const voucherResult = service.applyVoucher({
      voucherId: voucher.id,
      order,
      customerId: "customer-2",
    });

    const campaignResult = service.applyPromotionToOrder({
      promotionId: promo.id,
      order,
      customerId: "customer-2",
      channel: "WEBSITE",
    });

    assert.equal(voucherResult.appliedAmount, 10000);
    assert.equal(campaignResult.discountAmount, 6000);
    assert.deepEqual(service.getAnalytics("org-1", "outlet-1").topReward, ["promo-2"]);
  });
});
