export {};

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { CustomerLoyaltyService } = require("./customer-loyalty");

describe("customer loyalty", () => {
  it("creates a customer, verifies identity, and accrues points without duplicate replay", () => {
    const service = new CustomerLoyaltyService();
    const tierStarter = service.createTier({
      id: "tier-starter",
      organizationId: "org-1",
      code: "starter",
      name: "Starter",
      pointsThreshold: 0,
      isDefault: true,
      active: true,
    });
    const tierGold = service.createTier({
      id: "tier-gold",
      organizationId: "org-1",
      code: "gold",
      name: "Gold",
      pointsThreshold: 2000,
      isDefault: false,
      active: true,
    });

    const customer = service.createCustomer({
      organizationId: "org-1",
      fullName: "Ayu Wibowo",
      email: "ayu@example.com",
      phone: "+628123456789",
      status: "ACTIVE",
    });

    service.verifyCustomerIdentity(customer.id, { email: true, phone: true });
    const membership = service.createMembership({
      customerId: customer.id,
      organizationId: "org-1",
      outletId: "outlet-1",
      tierId: tierStarter.id,
    });

    const earned = service.applyPointsEvent({
      customerId: customer.id,
      organizationId: "org-1",
      outletId: "outlet-1",
      eventType: "ORDER",
      reason: "Order spend reward",
      points: 150,
      referenceId: "order-1",
      status: "AVAILABLE",
      channel: "IN_STORE",
    });

    const replay = service.applyPointsEvent({
      customerId: customer.id,
      organizationId: "org-1",
      outletId: "outlet-1",
      eventType: "ORDER",
      reason: "Order spend reward",
      points: 150,
      referenceId: "order-1",
      status: "AVAILABLE",
      channel: "IN_STORE",
    });

    assert.equal(earned.delta, 150);
    assert.equal(replay.duplicate, true);
    assert.equal(service.getMembership(customer.id)?.currentPoints, 150);
    assert.equal(service.getMembership(customer.id)?.tierId, tierStarter.id);
    assert.equal(service.getCustomer(customer.id)?.emailVerified, true);
    assert.equal(service.getCustomer(customer.id)?.phoneVerified, true);
  });

  it("upgrades tier and produces a leaderboard snapshot", () => {
    const service = new CustomerLoyaltyService();
    const starter = service.createTier({ id: "starter", organizationId: "org-1", code: "starter", name: "Starter", pointsThreshold: 0, isDefault: true, active: true });
    const gold = service.createTier({ id: "gold", organizationId: "org-1", code: "gold", name: "Gold", pointsThreshold: 2500, isDefault: false, active: true });

    const customer = service.createCustomer({ organizationId: "org-1", fullName: "Budi", email: "budi@example.com", phone: "+628987654321", status: "ACTIVE" });
    service.createMembership({ customerId: customer.id, organizationId: "org-1", outletId: "outlet-1", tierId: starter.id });
    service.applyPointsEvent({ customerId: customer.id, organizationId: "org-1", outletId: "outlet-1", eventType: "BONUS", reason: "Welcome bonus", points: 2600, referenceId: "bonus-1", status: "AVAILABLE", channel: "IN_STORE" });

    const membership = service.getMembership(customer.id);
    assert.ok(membership);
    assert.equal(membership?.tierId, gold.id);

    const leaderboard = service.getLeaderboard({ period: "lifetime", metric: "points" });
    assert.ok(leaderboard.length >= 1);
    assert.equal(leaderboard[0].customerId, customer.id);
  });
});
