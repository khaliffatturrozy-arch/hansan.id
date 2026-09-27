import { assertServerAuthoritativeContext } from "./transaction-core";

export type TableStatus = "OPEN" | "RESERVED" | "OCCUPIED" | "DIRTY" | "MAINTENANCE" | "OFFLINE";
export type ReservationStatus = "PENDING" | "CONFIRMED" | "SEATED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

export type TableFeature = {
  id: string;
  code: string;
  label: string;
  description?: string;
};

export type FloorPlan = {
  id: string;
  organizationId: string;
  outletId: string;
  name: string;
  code: string;
  createdAt: Date;
};

export type TableRecord = {
  id: string;
  organizationId: string;
  outletId: string;
  floorId: string;
  zone: string;
  name: string;
  code: string;
  capacity: number;
  status: TableStatus;
  features: string[];
  minimumOrderValue?: number;
  seatLabels?: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type ReservationRecord = {
  id: string;
  organizationId: string;
  outletId: string;
  tableId: string;
  customerName: string;
  guestCount: number;
  startAt: Date;
  endAt: Date;
  status: ReservationStatus;
  notes?: string;
  contactPhone?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type TableAvailabilityInput = {
  organizationId: string;
  outletId: string;
  startAt: Date;
  endAt: Date;
  guestCount: number;
  floorId?: string;
  zone?: string;
  requiredFeatures?: string[];
  allowDirty?: boolean;
};

export type ReserveTableInput = {
  organizationId: string;
  outletId: string;
  tableId: string;
  customerName: string;
  guestCount: number;
  startAt: Date;
  endAt: Date;
  contactPhone?: string;
  notes?: string;
};

export type ReservationContext = {
  organizationId?: string;
  outletId?: string;
};

export const TABLE_STATUS_TRANSITIONS: Record<TableStatus, TableStatus[]> = {
  OPEN: ["RESERVED", "OCCUPIED", "DIRTY", "MAINTENANCE", "OFFLINE"],
  RESERVED: ["OPEN", "OCCUPIED", "DIRTY"],
  OCCUPIED: ["OPEN", "DIRTY"],
  DIRTY: ["OPEN", "MAINTENANCE"],
  MAINTENANCE: ["OPEN", "OFFLINE"],
  OFFLINE: ["OPEN"],
};

export const RESERVATION_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SEATED", "CANCELLED"],
  SEATED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export class InvalidTableStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTableStatusError";
  }
}

export class InvalidReservationTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidReservationTransitionError";
  }
}

export class ReservationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReservationConflictError";
  }
}

export class InvalidReservationWindowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidReservationWindowError";
  }
}

export function overlapsWindow(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();
}

export class TableReservationDomainService {
  private readonly floors: FloorPlan[] = [];
  private readonly tables: TableRecord[] = [];
  private readonly reservations: ReservationRecord[] = [];
  private readonly features: Map<string, TableFeature> = new Map();

  registerFloor(floor: FloorPlan): FloorPlan {
    this.floors.push(floor);
    return floor;
  }

  registerFeature(feature: TableFeature): TableFeature {
    this.features.set(feature.id, feature);
    return feature;
  }

  getAllFloors(): FloorPlan[] {
    return [...this.floors];
  }

  getAllTables(): TableRecord[] {
    return [...this.tables];
  }

  getAllReservations(): ReservationRecord[] {
    return [...this.reservations];
  }

  createTable(input: {
    organizationId: string;
    outletId: string;
    floorId: string;
    zone: string;
    name: string;
    code: string;
    capacity: number;
    status?: TableStatus;
    features?: string[];
    minimumOrderValue?: number;
    seatLabels?: string[];
  }): TableRecord {
    if (!input.organizationId || !input.outletId || !input.floorId) {
      throw new InvalidTableStatusError("Table must belong to an organization, outlet, and floor.");
    }
    if (!Number.isFinite(input.capacity) || input.capacity <= 0) {
      throw new InvalidTableStatusError("Table capacity must be a positive integer.");
    }

    const exists = this.tables.some((table) => table.organizationId === input.organizationId && table.outletId === input.outletId && table.code === input.code);
    if (exists) {
      throw new InvalidTableStatusError(`Duplicate table code: ${input.code}`);
    }

    const table: TableRecord = {
      id: `table_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organizationId: input.organizationId,
      outletId: input.outletId,
      floorId: input.floorId,
      zone: input.zone,
      name: input.name,
      code: input.code,
      capacity: input.capacity,
      status: input.status ?? "OPEN",
      features: input.features ?? [],
      minimumOrderValue: input.minimumOrderValue,
      seatLabels: input.seatLabels ?? Array.from({ length: input.capacity }, (_, index) => `Seat ${index + 1}`),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.tables.push(table);
    return table;
  }

  updateTableStatus(tableId: string, status: TableStatus): TableRecord {
    const table = this.tables.find((entry) => entry.id === tableId);
    if (!table) {
      throw new InvalidTableStatusError(`Table not found: ${tableId}`);
    }

    const allowed = TABLE_STATUS_TRANSITIONS[table.status] ?? [];
    if (allowed.length > 0 && !allowed.includes(status)) {
      throw new InvalidTableStatusError(`Invalid table status transition: ${table.status} -> ${status}`);
    }

    table.status = status;
    table.updatedAt = new Date();
    return { ...table };
  }

  validateReservationWindow(startAt: Date, endAt: Date): void {
    if (!(startAt instanceof Date) || !(endAt instanceof Date) || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new InvalidReservationWindowError("Reservation start and end timestamps are required.");
    }

    if (endAt.getTime() <= startAt.getTime()) {
      throw new InvalidReservationWindowError("Reservation end time must be later than the start time.");
    }
  }

  findAvailableTables(input: TableAvailabilityInput): TableRecord[] {
    const { organizationId, outletId, startAt, endAt, guestCount, floorId, zone, requiredFeatures = [], allowDirty = false } = input;

    this.validateReservationWindow(startAt, endAt);

    return this.tables.filter((table) => {
      if (table.organizationId !== organizationId || table.outletId !== outletId) {
        return false;
      }
      if (floorId && table.floorId !== floorId) {
        return false;
      }
      if (zone && table.zone.toLowerCase() !== zone.toLowerCase()) {
        return false;
      }
      if (table.capacity < guestCount) {
        return false;
      }
      if (!allowDirty && table.status === "DIRTY") {
        return false;
      }
      if (table.status === "OFFLINE" || table.status === "MAINTENANCE") {
        return false;
      }
      if (requiredFeatures.length > 0 && !requiredFeatures.every((feature) => table.features.includes(feature))) {
        return false;
      }

      const hasConflict = this.reservations.some((reservation) => {
        if (reservation.tableId !== table.id) {
          return false;
        }
        if (["CANCELLED", "COMPLETED", "NO_SHOW"].includes(reservation.status)) {
          return false;
        }
        return overlapsWindow(reservation.startAt, reservation.endAt, startAt, endAt);
      });

      return !hasConflict;
    });
  }

  reserveTable({
    organizationId,
    outletId,
    tableId,
    customerName,
    guestCount,
    startAt,
    endAt,
    contactPhone,
    notes,
  }: ReserveTableInput & ReservationContext): ReservationRecord {
    assertServerAuthoritativeContext({
      authContext: { organizationId, outletId },
      suppliedOrganizationId: organizationId,
      suppliedOutletId: outletId,
    });

    this.validateReservationWindow(startAt, endAt);

    const table = this.tables.find((entry) => entry.id === tableId && entry.organizationId === organizationId && entry.outletId === outletId);
    if (!table) {
      throw new InvalidTableStatusError(`Table not found in outlet: ${tableId}`);
    }

    if (table.status === "OFFLINE" || table.status === "MAINTENANCE") {
      throw new InvalidTableStatusError(`Table is unavailable for booking: ${table.code}`);
    }

    if (table.capacity < guestCount) {
      throw new InvalidTableStatusError(`Guest count exceeds table capacity for ${table.code}.`);
    }

    const conflict = this.reservations.some((reservation) => {
      if (reservation.tableId !== tableId) {
        return false;
      }
      if (["CANCELLED", "COMPLETED", "NO_SHOW"].includes(reservation.status)) {
        return false;
      }
      return overlapsWindow(reservation.startAt, reservation.endAt, startAt, endAt);
    });

    if (conflict) {
      throw new ReservationConflictError(`Table ${table.code} is already reserved for the requested window.`);
    }

    const reservation: ReservationRecord = {
      id: `reservation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organizationId,
      outletId,
      tableId,
      customerName,
      guestCount,
      startAt,
      endAt,
      status: "PENDING",
      notes,
      contactPhone,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.reservations.push(reservation);
    this.updateTableStatus(tableId, "RESERVED");
    return reservation;
  }

  transitionReservation(reservationId: string, nextStatus: ReservationStatus): ReservationRecord {
    const reservation = this.reservations.find((entry) => entry.id === reservationId);
    if (!reservation) {
      throw new InvalidReservationTransitionError(`Reservation not found: ${reservationId}`);
    }

    const allowed = RESERVATION_TRANSITIONS[reservation.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new InvalidReservationTransitionError(`Invalid reservation transition: ${reservation.status} -> ${nextStatus}`);
    }

    reservation.status = nextStatus;
    reservation.updatedAt = new Date();

    const table = this.tables.find((entry) => entry.id === reservation.tableId);
    if (table) {
      if (nextStatus === "CANCELLED" || nextStatus === "COMPLETED" || nextStatus === "NO_SHOW") {
        table.status = "OPEN";
      } else if (nextStatus === "SEATED") {
        table.status = "OCCUPIED";
      } else if (nextStatus === "CONFIRMED") {
        table.status = "RESERVED";
      }
      table.updatedAt = new Date();
    }

    return { ...reservation };
  }

  getReservationById(reservationId: string): ReservationRecord | undefined {
    return this.reservations.find((reservation) => reservation.id === reservationId);
  }

  listReservationsByTable(tableId: string): ReservationRecord[] {
    return this.reservations.filter((reservation) => reservation.tableId === tableId).sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }

  getFeatureSummary(featureId: string): TableFeature | undefined {
    return this.features.get(featureId);
  }
}

export function normalizeZoneName(zone: string): string {
  return zone.trim();
}

export function requireTableFeature(table: TableRecord, featureCode: string): void {
  if (!table.features.includes(featureCode)) {
    throw new InvalidTableStatusError(`Table ${table.code} does not support feature: ${featureCode}`);
  }
}
