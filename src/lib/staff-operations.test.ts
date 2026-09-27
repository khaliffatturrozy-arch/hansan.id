export {};

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { StaffOperationsService } = require("./staff-operations");

describe("staff operations", () => {
  it("tracks attendance windows and schedule changes without rewriting history", () => {
    const service = new StaffOperationsService();
    const schedule = service.createSchedule({
      id: "sched-1",
      organizationId: "org-1",
      outletId: "outlet-1",
      staffId: "staff-1",
      assignedStart: new Date("2026-09-27T08:00:00Z"),
      assignedEnd: new Date("2026-09-27T17:00:00Z"),
    });

    const shift = service.createShift({
      id: "shift-1",
      organizationId: "org-1",
      outletId: "outlet-1",
      staffId: "staff-1",
      scheduleId: schedule.id,
      startAt: new Date("2026-09-27T08:00:00Z"),
      endAt: new Date("2026-09-27T17:00:00Z"),
    });

    const attendance = service.recordAttendance({
      organizationId: "org-1",
      outletId: "outlet-1",
      staffId: "staff-1",
      scheduleId: schedule.id,
      shiftId: shift.id,
      clockInAt: new Date("2026-09-27T08:10:00Z"),
      clockOutAt: new Date("2026-09-27T17:00:00Z"),
      method: "PASSKEY",
    });

    assert.equal(attendance.status, "LATE");
    assert.equal(attendance.lateMinutes, 10);

    const changed = service.createScheduleChange({
      organizationId: "org-1",
      outletId: "outlet-1",
      staffId: "staff-1",
      scheduleId: schedule.id,
      originalStart: new Date("2026-09-27T08:00:00Z"),
      originalEnd: new Date("2026-09-27T17:00:00Z"),
      newStart: new Date("2026-09-27T09:00:00Z"),
      newEnd: new Date("2026-09-27T18:00:00Z"),
      reason: "Operational adjustment",
    });

    assert.equal(changed.version, 2);
    assert.equal(service.getAttendance(attendance.id)?.status, "LATE");
  });

  it("supports opening preparation, checklist completion, and closure validation", () => {
    const service = new StaffOperationsService();
    const opening = service.startOpening({
      organizationId: "org-1",
      outletId: "outlet-1",
      managerId: "manager-1",
      startAt: new Date("2026-09-27T08:00:00Z"),
      requiredChecklist: ["operations", "inventory", "kitchen"],
    });

    service.completeChecklist(opening.id, "operations");
    service.completeChecklist(opening.id, "inventory");
    service.completeChecklist(opening.id, "kitchen");

    assert.equal(opening.status, "OPENING_PREPARATION");
    assert.equal(service.completeOpening(opening.id, { managerId: "manager-1", reason: "Ready to trade" })?.status, "READY_TO_OPEN");

    const closing = service.startClosing({
      organizationId: "org-1",
      outletId: "outlet-1",
      managerId: "manager-1",
      pendingOrders: 0,
      pendingPayments: 0,
      stockMovements: 0,
    });

    assert.equal(closing.status, "CLOSING");
    assert.equal(service.finalizeClosing(closing.id, { managerId: "manager-1" })?.status, "CLOSED");
  });
});
