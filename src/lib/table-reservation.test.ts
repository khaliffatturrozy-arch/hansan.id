export {};

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  TableReservationDomainService,
  ReservationConflictError,
  InvalidReservationTransitionError,
  InvalidReservationWindowError,
  requireTableFeature,
  overlapsWindow,
} = require("./table-reservation");

describe("table reservation domain", () => {
  it("creates floor, zone, and tables under a single outlet and validates security context", () => {
    const service = new TableReservationDomainService();
    const floor = service.registerFloor({
      id: "floor-1",
      organizationId: "org-1",
      outletId: "outlet-1",
      name: "ground-floor",
      displayName: "Ground Floor",
      sortOrder: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const zone = service.registerZone({
      id: "zone-1",
      organizationId: "org-1",
      outletId: "outlet-1",
      floorId: floor.id,
      name: "garden",
      displayName: "Garden",
      description: "Outdoor seating",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const table = service.createTable({
      organizationId: "org-1",
      outletId: "outlet-1",
      floorId: floor.id,
      zoneId: zone.id,
      code: "A1",
      internalName: "A1",
      displayName: "Table 1",
      shape: "ROUND",
      x: 10,
      y: 20,
      width: 120,
      height: 120,
      rotation: 0,
      zIndex: 1,
      minCapacity: 2,
      recommendedCapacity: 4,
      maxCapacity: 6,
      reservationEnabled: true,
      minimumOrderEnabled: false,
      minimumOrderAmount: 0,
      minimumOrderType: "FIXED_AMOUNT",
      displayOnWebsite: true,
      customerVisible: true,
      status: "AVAILABLE",
      allowCombination: true,
      features: ["WINDOW_VIEW", "WIFI"],
    });

    assert.equal(floor.displayName, "Ground Floor");
    assert.equal(zone.floorId, floor.id);
    assert.equal(table.zoneId, zone.id);
    assert.equal(table.status, "AVAILABLE");
    assert.equal(table.maxCapacity, 6);
    assert.ok(service.getFloorById("floor-1"));

    assert.throws(() => {
      service.validateTenantContext({ organizationId: "org-1", outletId: "outlet-2" }, { organizationId: "org-1", outletId: "outlet-1" });
    });
  });

  it("finds the best available table and rejects invalid capacity rules", () => {
    const service = new TableReservationDomainService();
    const floor = service.registerFloor({
      id: "floor-2",
      organizationId: "org-1",
      outletId: "outlet-1",
      name: "main",
      displayName: "Main Floor",
      sortOrder: 2,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const zone = service.registerZone({
      id: "zone-2",
      organizationId: "org-1",
      outletId: "outlet-1",
      floorId: floor.id,
      name: "lounge",
      displayName: "Lounge",
      description: "Lounge seating",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    service.createTable({
      organizationId: "org-1",
      outletId: "outlet-1",
      floorId: floor.id,
      zoneId: zone.id,
      code: "L1",
      internalName: "L1",
      displayName: "Lounge Table 1",
      shape: "ROUND",
      x: 1,
      y: 2,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: 1,
      minCapacity: 2,
      recommendedCapacity: 4,
      maxCapacity: 4,
      reservationEnabled: true,
      minimumOrderEnabled: false,
      minimumOrderAmount: 0,
      minimumOrderType: "FIXED_AMOUNT",
      displayOnWebsite: true,
      customerVisible: true,
      status: "AVAILABLE",
      allowCombination: true,
      features: ["WIFI"],
    });

    const table = service.createTable({
      organizationId: "org-1",
      outletId: "outlet-1",
      floorId: floor.id,
      zoneId: zone.id,
      code: "L2",
      internalName: "L2",
      displayName: "Lounge Table 2",
      shape: "RECTANGLE",
      x: 3,
      y: 4,
      width: 140,
      height: 80,
      rotation: 0,
      zIndex: 2,
      minCapacity: 2,
      recommendedCapacity: 6,
      maxCapacity: 8,
      reservationEnabled: true,
      minimumOrderEnabled: false,
      minimumOrderAmount: 0,
      minimumOrderType: "FIXED_AMOUNT",
      displayOnWebsite: true,
      customerVisible: true,
      status: "AVAILABLE",
      allowCombination: true,
      features: ["WIFI", "WINDOW_VIEW"],
    });

    const best = service.findBestAvailableTable({
      organizationId: "org-1",
      outletId: "outlet-1",
      guestCount: 6,
      startAt: new Date("2026-09-28T18:00:00"),
      endAt: new Date("2026-09-28T19:00:00"),
      preferredZone: "lounge",
      requiredFeatures: ["WIFI"],
    });

    assert.ok(best);
    assert.equal(best?.id, table.id);

    assert.throws(() => {
      service.createTable({
        organizationId: "org-1",
        outletId: "outlet-1",
        floorId: floor.id,
        zoneId: zone.id,
        code: "BAD",
        internalName: "BAD",
        displayName: "Bad",
        shape: "ROUND",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        zIndex: 1,
        minCapacity: 4,
        recommendedCapacity: 2,
        maxCapacity: 5,
        reservationEnabled: true,
        minimumOrderEnabled: false,
        minimumOrderAmount: 0,
        minimumOrderType: "FIXED_AMOUNT",
        displayOnWebsite: true,
        customerVisible: true,
        status: "AVAILABLE",
        allowCombination: true,
        features: [],
      });
    }, Error);
  });

  it("reserves a table, rejects overlap, and enforces valid lifecycle transitions", () => {
    const service = new TableReservationDomainService();
    const floor = service.registerFloor({
      id: "floor-3",
      organizationId: "org-1",
      outletId: "outlet-1",
      name: "rooftop",
      displayName: "Rooftop",
      sortOrder: 3,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const zone = service.registerZone({
      id: "zone-3",
      organizationId: "org-1",
      outletId: "outlet-1",
      floorId: floor.id,
      name: "vip",
      displayName: "VIP",
      description: "VIP deck",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const table = service.createTable({
      organizationId: "org-1",
      outletId: "outlet-1",
      floorId: floor.id,
      zoneId: zone.id,
      code: "V1",
      internalName: "VIP 1",
      displayName: "VIP 1",
      shape: "ROUND",
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: 1,
      minCapacity: 2,
      recommendedCapacity: 4,
      maxCapacity: 8,
      reservationEnabled: true,
      minimumOrderEnabled: false,
      minimumOrderAmount: 0,
      minimumOrderType: "FIXED_AMOUNT",
      displayOnWebsite: true,
      customerVisible: true,
      status: "AVAILABLE",
      allowCombination: true,
      features: ["PRIVATE", "WIFI"],
    });

    const startAt = new Date("2026-09-29T19:00:00");
    const endAt = new Date("2026-09-29T20:00:00");

    const reservation = service.reserveTable({
      organizationId: "org-1",
      outletId: "outlet-1",
      customerId: "customer-1",
      reservationCode: "RSV-001",
      reservationDate: new Date("2026-09-29T00:00:00"),
      guestCount: 4,
      startAt,
      endAt,
      requestedTableId: table.id,
      notes: "Birthday",
      preferences: ["PRIVATE"],
      minimumOrderSnapshot: { enabled: false, amount: 0, type: "FIXED_AMOUNT" },
      tableSnapshot: {
        tableId: table.id,
        tableCode: table.code,
        displayName: table.displayName,
        floorId: table.floorId,
        floorName: "Rooftop",
        zoneId: table.zoneId,
        zoneName: "VIP",
        capacity: table.maxCapacity,
        features: table.features,
        minimumOrderEnabled: false,
        minimumOrderAmount: 0,
        minimumOrderType: "FIXED_AMOUNT",
      },
    });

    assert.equal(reservation.status, "PENDING");

    assert.throws(() => {
      service.reserveTable({
        organizationId: "org-1",
        outletId: "outlet-1",
        customerId: "customer-2",
        reservationCode: "RSV-002",
        reservationDate: new Date("2026-09-29T00:00:00"),
        guestCount: 2,
        startAt: new Date("2026-09-29T19:30:00"),
        endAt: new Date("2026-09-29T20:30:00"),
        requestedTableId: table.id,
      });
    }, ReservationConflictError);

    const confirmed = service.transitionReservation(reservation.id, "CONFIRMED");
    const arrived = service.transitionReservation(confirmed.id, "ARRIVED");
    const seated = service.transitionReservation(arrived.id, "SEATED");
    const completed = service.transitionReservation(seated.id, "COMPLETED");

    assert.equal(completed.status, "COMPLETED");

    assert.throws(() => {
      service.transitionReservation(completed.id, "CANCELLED");
    }, InvalidReservationTransitionError);
  });

  it("prevents stale hold conflicts and supports historical snapshot immutability", () => {
    const service = new TableReservationDomainService();
    const floor = service.registerFloor({
      id: "floor-4",
      organizationId: "org-1",
      outletId: "outlet-1",
      name: "garden",
      displayName: "Garden",
      sortOrder: 4,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const zone = service.registerZone({
      id: "zone-4",
      organizationId: "org-1",
      outletId: "outlet-1",
      floorId: floor.id,
      name: "outside",
      displayName: "Outside",
      description: "Outdoor tables",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const table = service.createTable({
      organizationId: "org-1",
      outletId: "outlet-1",
      floorId: floor.id,
      zoneId: zone.id,
      code: "G1",
      internalName: "Garden 1",
      displayName: "Garden 1",
      shape: "ROUND",
      x: 1,
      y: 1,
      width: 90,
      height: 90,
      rotation: 0,
      zIndex: 1,
      minCapacity: 2,
      recommendedCapacity: 4,
      maxCapacity: 4,
      reservationEnabled: true,
      minimumOrderEnabled: false,
      minimumOrderAmount: 0,
      minimumOrderType: "FIXED_AMOUNT",
      displayOnWebsite: true,
      customerVisible: true,
      status: "AVAILABLE",
      allowCombination: false,
      features: ["GARDEN_VIEW"],
    });

    const hold = service.createHold({
      organizationId: "org-1",
      outletId: "outlet-1",
      tableIds: [table.id],
      customerId: "customer-10",
      sessionId: "session-10",
      expiresAt: new Date(Date.now() + 60 * 1000),
    });

    assert.equal(hold.status, "ACTIVE");

    service.expireHold(hold.id);

    const reserved = service.reserveTable({
      organizationId: "org-1",
      outletId: "outlet-1",
      customerId: "customer-11",
      reservationCode: "RSV-100",
      reservationDate: new Date("2026-09-30T00:00:00"),
      guestCount: 3,
      startAt: new Date("2026-09-30T18:00:00"),
      endAt: new Date("2026-09-30T19:00:00"),
      requestedTableId: table.id,
    });

    assert.equal(reserved.requestedTableId, table.id);

    const snapshot = service.getReservationById(reserved.id)?.tableSnapshot;
    assert.ok(snapshot);
    assert.equal(snapshot.tableCode, "G1");

    table.displayName = "Changed name";
    table.features = ["WIFI"];
    table.maxCapacity = 10;
    assert.equal(service.getReservationById(reserved.id)?.tableSnapshot?.displayName, "Garden 1");
    assert.equal(service.getReservationById(reserved.id)?.tableSnapshot?.features[0], "GARDEN_VIEW");
  });

  it("supports table combinations, turnover buffers, and interval overlap logic", () => {
    const service = new TableReservationDomainService();
    const floor = service.registerFloor({
      id: "floor-5",
      organizationId: "org-1",
      outletId: "outlet-1",
      name: "inside",
      displayName: "Inside",
      sortOrder: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const zone = service.registerZone({
      id: "zone-5",
      organizationId: "org-1",
      outletId: "outlet-1",
      floorId: floor.id,
      name: "main",
      displayName: "Main",
      description: "Main dining",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const t1 = service.createTable({
      organizationId: "org-1",
      outletId: "outlet-1",
      floorId: floor.id,
      zoneId: zone.id,
      code: "T1",
      internalName: "T1",
      displayName: "Table T1",
      shape: "RECTANGLE",
      x: 0,
      y: 0,
      width: 120,
      height: 80,
      rotation: 0,
      zIndex: 1,
      minCapacity: 2,
      recommendedCapacity: 4,
      maxCapacity: 4,
      reservationEnabled: true,
      minimumOrderEnabled: false,
      minimumOrderAmount: 0,
      minimumOrderType: "FIXED_AMOUNT",
      displayOnWebsite: true,
      customerVisible: true,
      status: "AVAILABLE",
      allowCombination: true,
      features: [],
    });

    const t2 = service.createTable({
      organizationId: "org-1",
      outletId: "outlet-1",
      floorId: floor.id,
      zoneId: zone.id,
      code: "T2",
      internalName: "T2",
      displayName: "Table T2",
      shape: "RECTANGLE",
      x: 1,
      y: 1,
      width: 120,
      height: 80,
      rotation: 0,
      zIndex: 2,
      minCapacity: 2,
      recommendedCapacity: 4,
      maxCapacity: 4,
      reservationEnabled: true,
      minimumOrderEnabled: false,
      minimumOrderAmount: 0,
      minimumOrderType: "FIXED_AMOUNT",
      displayOnWebsite: true,
      customerVisible: true,
      status: "AVAILABLE",
      allowCombination: true,
      features: [],
    });

    assert.equal(overlapsWindow(new Date("10:00"), new Date("11:00"), new Date("11:00"), new Date("12:00")), false);

    const combination = service.findBestTableCombination({
      organizationId: "org-1",
      outletId: "outlet-1",
      guestCount: 8,
      startAt: new Date("2026-10-01T18:00:00"),
      endAt: new Date("2026-10-01T19:00:00"),
      turnoverBufferMinutes: 15,
    });

    assert.ok(combination);
    assert.equal(combination?.totalCapacity, 8);
    assert.equal(combination?.tables.length, 2);
    assert.equal(service.getTableById(t1.id)?.status, "AVAILABLE");
  });

  it("supports table sessions and audit generation", () => {
    const service = new TableReservationDomainService();
    const floor = service.registerFloor({
      id: "floor-6",
      organizationId: "org-1",
      outletId: "outlet-1",
      name: "bar",
      displayName: "Bar",
      sortOrder: 6,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const zone = service.registerZone({
      id: "zone-6",
      organizationId: "org-1",
      outletId: "outlet-1",
      floorId: floor.id,
      name: "counter",
      displayName: "Counter",
      description: "Bar counter",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const table = service.createTable({
      organizationId: "org-1",
      outletId: "outlet-1",
      floorId: floor.id,
      zoneId: zone.id,
      code: "B1",
      internalName: "Bar 1",
      displayName: "Bar 1",
      shape: "COUNTER",
      x: 0,
      y: 0,
      width: 80,
      height: 40,
      rotation: 0,
      zIndex: 1,
      minCapacity: 1,
      recommendedCapacity: 2,
      maxCapacity: 2,
      reservationEnabled: true,
      minimumOrderEnabled: false,
      minimumOrderAmount: 0,
      minimumOrderType: "FIXED_AMOUNT",
      displayOnWebsite: true,
      customerVisible: true,
      status: "AVAILABLE",
      allowCombination: false,
      features: ["NEAR_BAR"],
    });

    const session = service.startTableSession({
      organizationId: "org-1",
      outletId: "outlet-1",
      tableIds: [table.id],
      customerId: "customer-99",
      reservationId: "reservation-99",
      startedAt: new Date("2026-10-02T18:00:00"),
      status: "ACTIVE",
    });

    assert.equal(session.status, "ACTIVE");
    assert.ok(service.getAuditEvents().some((event: { type: string }) => event.type === "TABLE_SESSION_STARTED"));
  });
});
