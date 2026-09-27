export type AttendanceStatus = "ON_TIME" | "LATE" | "LATE_EXCEPTION";
export type AttendanceMethod = "PASSKEY" | "OTP" | "QR" | "MANUAL";
export type OpeningStatus = "STORE_CLOSED" | "OPENING_PREPARATION" | "READY_TO_OPEN" | "OPERATIONAL" | "CLOSING" | "CLOSED";
export type ClosingStatus = "CLOSING" | "CLOSED";

export type ScheduleRecord = {
  id: string;
  organizationId: string;
  outletId: string;
  staffId: string;
  assignedStart: Date;
  assignedEnd: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ShiftRecord = {
  id: string;
  organizationId: string;
  outletId: string;
  staffId: string;
  scheduleId: string;
  startAt: Date;
  endAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type AttendanceRecord = {
  id: string;
  organizationId: string;
  outletId: string;
  staffId: string;
  scheduleId: string;
  shiftId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  clockInAt: Date;
  clockOutAt?: Date;
  method: AttendanceMethod;
  status: AttendanceStatus;
  lateMinutes: number;
  exceededDeadline: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type OpeningRecord = {
  id: string;
  organizationId: string;
  outletId: string;
  managerId: string;
  startAt: Date;
  status: OpeningStatus;
  checklist: Record<string, boolean>;
  requiredChecklist: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type ClosingRecord = {
  id: string;
  organizationId: string;
  outletId: string;
  managerId: string;
  pendingOrders: number;
  pendingPayments: number;
  stockMovements: number;
  status: ClosingStatus;
  createdAt: Date;
  updatedAt: Date;
};

export class StaffOperationsService {
  private readonly schedules = new Map<string, ScheduleRecord>();
  private readonly shifts = new Map<string, ShiftRecord>();
  private readonly attendance = new Map<string, AttendanceRecord>();
  private readonly openings = new Map<string, OpeningRecord>();
  private readonly closings = new Map<string, ClosingRecord>();

  public createSchedule(input: {
    id: string;
    organizationId: string;
    outletId: string;
    staffId: string;
    assignedStart: Date;
    assignedEnd: Date;
  }): ScheduleRecord {
    const schedule: ScheduleRecord = {
      id: input.id,
      organizationId: input.organizationId,
      outletId: input.outletId,
      staffId: input.staffId,
      assignedStart: input.assignedStart,
      assignedEnd: input.assignedEnd,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.schedules.set(schedule.id, schedule);
    return schedule;
  }

  public createScheduleChange(input: {
    organizationId: string;
    outletId: string;
    staffId: string;
    scheduleId: string;
    originalStart: Date;
    originalEnd: Date;
    newStart: Date;
    newEnd: Date;
    reason: string;
  }): ScheduleRecord {
    const schedule = this.schedules.get(input.scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${input.scheduleId}`);
    }
    schedule.version += 1;
    schedule.assignedStart = input.newStart;
    schedule.assignedEnd = input.newEnd;
    schedule.updatedAt = new Date();
    return schedule;
  }

  public createShift(input: {
    id: string;
    organizationId: string;
    outletId: string;
    staffId: string;
    scheduleId: string;
    startAt: Date;
    endAt: Date;
  }): ShiftRecord {
    const shift: ShiftRecord = {
      id: input.id,
      organizationId: input.organizationId,
      outletId: input.outletId,
      staffId: input.staffId,
      scheduleId: input.scheduleId,
      startAt: input.startAt,
      endAt: input.endAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.shifts.set(shift.id, shift);
    return shift;
  }

  public recordAttendance(input: {
    organizationId: string;
    outletId: string;
    staffId: string;
    scheduleId: string;
    shiftId: string;
    clockInAt: Date;
    clockOutAt?: Date;
    method: AttendanceMethod;
  }): AttendanceRecord {
    const schedule = this.schedules.get(input.scheduleId);
    const shift = this.shifts.get(input.shiftId);
    const scheduledStart = shift?.startAt ?? schedule?.assignedStart ?? input.clockInAt;
    const scheduledEnd = shift?.endAt ?? schedule?.assignedEnd ?? input.clockInAt;
    const diffMinutes = Math.max(0, Math.round((input.clockInAt.getTime() - scheduledStart.getTime()) / 60000));

    let status: AttendanceStatus = "ON_TIME";
    if (diffMinutes > 0 && diffMinutes <= 30) {
      status = "LATE";
    } else if (diffMinutes > 30) {
      status = "LATE_EXCEPTION";
    }

    const attendanceRecord: AttendanceRecord = {
      id: `attendance_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organizationId: input.organizationId,
      outletId: input.outletId,
      staffId: input.staffId,
      scheduleId: input.scheduleId,
      shiftId: input.shiftId,
      scheduledStart,
      scheduledEnd,
      clockInAt: input.clockInAt,
      clockOutAt: input.clockOutAt,
      method: input.method,
      status,
      lateMinutes: diffMinutes,
      exceededDeadline: diffMinutes > 30,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.attendance.set(attendanceRecord.id, attendanceRecord);
    return attendanceRecord;
  }

  public getAttendance(attendanceId: string): AttendanceRecord | undefined {
    return this.attendance.get(attendanceId);
  }

  public startOpening(input: {
    organizationId: string;
    outletId: string;
    managerId: string;
    startAt: Date;
    requiredChecklist?: string[];
  }): OpeningRecord {
    const opening: OpeningRecord = {
      id: `opening_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organizationId: input.organizationId,
      outletId: input.outletId,
      managerId: input.managerId,
      startAt: input.startAt,
      status: "OPENING_PREPARATION",
      checklist: {},
      requiredChecklist: input.requiredChecklist ?? ["operations", "inventory", "kitchen"],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.openings.set(opening.id, opening);
    return opening;
  }

  public completeChecklist(openingId: string, checklistId: string): OpeningRecord {
    const opening = this.openings.get(openingId);
    if (!opening) {
      throw new Error(`Opening not found: ${openingId}`);
    }
    opening.checklist[checklistId] = true;
    opening.updatedAt = new Date();
    return opening;
  }

  public completeOpening(openingId: string, input: { managerId: string; reason?: string }): OpeningRecord | undefined {
    const opening = this.openings.get(openingId);
    if (!opening) {
      return undefined;
    }
    opening.status = "READY_TO_OPEN";
    opening.updatedAt = new Date();
    return opening;
  }

  public startClosing(input: {
    organizationId: string;
    outletId: string;
    managerId: string;
    pendingOrders?: number;
    pendingPayments?: number;
    stockMovements?: number;
  }): ClosingRecord {
    const closing: ClosingRecord = {
      id: `closing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organizationId: input.organizationId,
      outletId: input.outletId,
      managerId: input.managerId,
      pendingOrders: input.pendingOrders ?? 0,
      pendingPayments: input.pendingPayments ?? 0,
      stockMovements: input.stockMovements ?? 0,
      status: "CLOSING",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.closings.set(closing.id, closing);
    return closing;
  }

  public finalizeClosing(closingId: string, input: { managerId: string }): ClosingRecord | undefined {
    const closing = this.closings.get(closingId);
    if (!closing) {
      return undefined;
    }
    closing.status = "CLOSED";
    closing.updatedAt = new Date();
    return closing;
  }
}
