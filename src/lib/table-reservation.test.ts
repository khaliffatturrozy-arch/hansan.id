const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  TableReservationDomainService,
  ReservationConflictError,
  InvalidReservationTransitionError,
  InvalidReservationWindowError,
  requireTableFeature,
} = require("./table-reservation");

describe("table reservation domain", () => {
  it("creates tables and finds availability in a specific window", () => {
    const service = new TableReservationDomainService();

    service.registerFloor({
      id: "floor-1",
      organizationId: "org-1",
      outletId: "outlet-1",
      name: "Ground Floor",
      code: "GF",
      createdAt: new Date(),
    });

    const tableA = service.createTable({
      organizationId: "org-1",
      outletId: "outlet-1",
      floorId: "floor-1",
      zone: "Garden",
      name: "Table 1",
      code: "A1",
      capacity: 4,
      features: ["wifi", "window"],
    });

    const tableB = service.createTable({
      organizationId: "org-1",
      outletId: "outlet-1",
      floorId: "floor-1",
      zone: "Garden",
      name: "Table 2",
      code: "A2",
      capacity: 6,
      features: ["wifi"],
    });

    const startAt = new Date("2026-09-27T18:00:00");
    const endAt = new Date("2026-09-27T19:00:00");

    const available = service.findAvailableTables({
      organizationId: "org-1",
      outletId: "outlet-1",
      startAt,
      endAt,
      guestCount: 4,
      zone: "Garden",
      requiredFeatures: ["wifi"],
    });

    assert.deepEqual(
      available.map((table: { id: string }) => table.id).sort(),
      [tableA.id, tableB.id].sort(),
    );
    assert.equal(tableA.status, "OPEN");
    assert.equal(tableB.status, "OPEN");
  });

  it("reserves a table and prevents overlapping bookings", () => {
    const service = new TableReservationDomainService();

    service.registerFloor({
      id: "floor-2",
      organizationId: "org-1",
      outletId: "outlet-1",
      name: "First Floor",
      code: "FF",
      createdAt: new Date(),
    });

    const table = service.createTable({
      organizationId: "org-1",
      outletId: "outlet-1",
      floorId: "floor-2",
      zone: "VIP",
      name: "VIP Table",
      code: "V1",
      capacity: 6,
    });

    const startAt = new Date("2026-09-28T19:00:00");
    const endAt = new Date("2026-09-28T20:00:00");

    const first = service.reserveTable({
      organizationId: "org-1",
      outletId: "outlet-1",
      tableId: table.id,
      customerName: "Ayu",
      guestCount: 4,
      startAt,
      endAt,
      contactPhone: "08123456789",
      notes: "Birthday dinner",
    });

    assert.equal(first.status, "PENDING");
    assert.equal(table.status, "RESERVED");

    assert.throws(() => {
      service.reserveTable({
        organizationId: "org-1",
        outletId: "outlet-1",
        tableId: table.id,
        customerName: "Budi",
        guestCount: 2,
        startAt: new Date("2026-09-28T19:30:00"),
        endAt: new Date("2026-09-28T20:30:00"),
      });
    }, ReservationConflictError);
  });

  it("confirms seats and completes a reservation through valid lifecycle transitions", () => {
    const service = new TableReservationDomainService();

    service.registerFloor({
      id: "floor-3",
      organizationId: "org-1",
      outletId: "outlet-1",
      name: "Rooftop",
      code: "RT",
      createdAt: new Date(),
    });

    const table = service.createTable({
      organizationId: "org-1",
      outletId: "outlet-1",
      floorId: "floor-3",
      zone: "Rooftop",
      name: "Private Table",
      code: "R1",
      capacity: 8,
      features: ["smoking"],
    });

    const reservation = service.reserveTable({
      organizationId: "org-1",
      outletId: "outlet-1",
      tableId: table.id,
      customerName: "Charlie",
      guestCount: 5,
      startAt: new Date("2026-09-29T18:00:00"),
      endAt: new Date("2026-09-29T19:00:00"),
    });

    const confirmed = service.transitionReservation(reservation.id, "CONFIRMED");
    const seated = service.transitionReservation(confirmed.id, "SEATED");
    const completed = service.transitionReservation(seated.id, "COMPLETED");

    assert.equal(confirmed.status, "CONFIRMED");
    assert.equal(seated.status, "SEATED");
    assert.equal(completed.status, "COMPLETED");
    assert.equal(service.getReservationById(completed.id)?.status, "COMPLETED");
  });

  it("rejects invalid reservation transitions and windows", () => {
    const service = new TableReservationDomainService();
    const table = service.createTable({
      organizationId: "org-1",
      outletId: "outlet-1",
      floorId: "floor-1",
      zone: "Main",
      name: "Main Table",
      code: "M1",
      capacity: 2,
    });

    const reservation = service.reserveTable({
      organizationId: "org-1",
      outletId: "outlet-1",
      tableId: table.id,
      customerName: "Dina",
      guestCount: 2,
      startAt: new Date("2026-09-30T12:00:00"),
      endAt: new Date("2026-09-30T13:00:00"),
    });

    assert.throws(() => {
      service.transitionReservation(reservation.id, "NO_SHOW");
    }, InvalidReservationTransitionError);

    assert.throws(() => {
      service.validateReservationWindow(new Date("2026-09-30T13:00:00"), new Date("2026-09-30T12:00:00"));
    }, InvalidReservationWindowError);
  });

  it("supports feature validation for premium tables", () => {
    const service = new TableReservationDomainService();
    const table = service.createTable({
      organizationId: "org-1",
      outletId: "outlet-1",
      floorId: "floor-1",
      zone: "Main",
      name: "Window Table",
      code: "W1",
      capacity: 4,
      features: ["window", "wifi"],
    });

    assert.doesNotThrow(() => {
      requireTableFeature(table, "window");
    });

    assert.throws(() => {
      requireTableFeature(table, "private-room");
    }, Error);
  });
});
