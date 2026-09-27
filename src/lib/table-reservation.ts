import { assertServerAuthoritativeContext } from "./transaction-core";

export type TableStatus = "AVAILABLE" | "RESERVED" | "OCCUPIED" | "CLEANING" | "MAINTENANCE" | "OUT_OF_SERVICE";
export type ReservationStatus = "PENDING" | "CONFIRMED" | "ARRIVED" | "SEATED" | "COMPLETED" | "CANCELLED" | "NO_SHOW" | "EXPIRED";
export type TableShape = "ROUND" | "SQUARE" | "RECTANGLE" | "OVAL" | "LONG" | "BAR" | "COUNTER" | "BOOTH" | "PRIVATE_ROOM" | "CUSTOM";
export type TableHoldStatus = "ACTIVE" | "EXPIRED" | "RELEASED";
export type TableSessionStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";
export type MinimumOrderType = "FIXED_AMOUNT" | "PER_PERSON";

export type TableFeature = {
  id: string;
  code: string;
  label: string;
  description?: string;
  isRecommendationTag?: boolean;
};

export type FloorRecord = {
  id: string;
  organizationId: string;
  outletId: string;
  name: string;
  displayName: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ZoneRecord = {
  id: string;
  organizationId: string;
  outletId: string;
  floorId: string;
  name: string;
  displayName: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type TableSnapshot = {
  tableId: string;
  tableCode: string;
  displayName: string;
  floorId: string;
  floorName: string;
  zoneId: string;
  zoneName: string;
  capacity: number;
  features: string[];
  minimumOrderEnabled: boolean;
  minimumOrderAmount: number;
  minimumOrderType: MinimumOrderType;
};

export type TableRecord = {
  id: string;
  organizationId: string;
  outletId: string;
  floorId: string;
  zoneId: string;
  zone?: string;
  code: string;
  internalName: string;
  displayName: string;
  shape: TableShape;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  minCapacity: number;
  recommendedCapacity: number;
  maxCapacity: number;
  reservationEnabled: boolean;
  minimumOrderEnabled: boolean;
  minimumOrderAmount: number;
  minimumOrderType: MinimumOrderType;
  displayOnWebsite: boolean;
  customerVisible: boolean;
  status: TableStatus;
  allowCombination: boolean;
  features: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type ReservationRecord = {
  id: string;
  organizationId: string;
  outletId: string;
  customerId?: string;
  reservationCode: string;
  reservationDate: Date;
  startAt: Date;
  endAt: Date;
  guestCount: number;
  requestedTableId?: string;
  assignedTableId?: string;
  status: ReservationStatus;
  notes?: string;
  preferences?: string[];
  minimumOrderSnapshot?: {
    enabled: boolean;
    amount: number;
    type: MinimumOrderType;
  };
  tableSnapshot?: TableSnapshot;
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
  preferredZone?: string;
  preferredFloor?: string;
  requiredFeatures?: string[];
  allowDirty?: boolean;
  turnoverBufferMinutes?: number;
};

export type ReserveTableInput = {
  organizationId: string;
  outletId: string;
  customerId?: string;
  reservationCode?: string;
  reservationDate?: Date;
  requestedTableId?: string;
  tableId?: string;
  guestCount: number;
  startAt: Date;
  endAt: Date;
  notes?: string;
  preferences?: string[];
  minimumOrderSnapshot?: {
    enabled: boolean;
    amount: number;
    type: MinimumOrderType;
  };
  tableSnapshot?: TableSnapshot;
};

export type TableHold = {
  id: string;
  organizationId: string;
  outletId: string;
  tableIds: string[];
  customerId?: string;
  sessionId?: string;
  reservationAttemptId?: string;
  createdAt: Date;
  expiresAt: Date;
  status: TableHoldStatus;
};

export type TableSessionRecord = {
  id: string;
  organizationId: string;
  outletId: string;
  tableIds: string[];
  reservationId?: string;
  customerId?: string;
  startedAt: Date;
  endedAt?: Date;
  status: TableSessionStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type AuditEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: Date;
};

export type TableCombinationResult = {
  tables: TableRecord[];
  totalCapacity: number;
  selectedBy: string[];
};

export type ReservationContext = {
  organizationId?: string;
  outletId?: string;
};

export const TABLE_STATUS_TRANSITIONS: Record<TableStatus, TableStatus[]> = {
  AVAILABLE: ["RESERVED", "OCCUPIED", "CLEANING", "MAINTENANCE", "OUT_OF_SERVICE"],
  RESERVED: ["AVAILABLE", "OCCUPIED", "CLEANING", "MAINTENANCE", "OUT_OF_SERVICE"],
  OCCUPIED: ["AVAILABLE", "CLEANING", "MAINTENANCE", "OUT_OF_SERVICE"],
  CLEANING: ["AVAILABLE", "MAINTENANCE", "OUT_OF_SERVICE"],
  MAINTENANCE: ["AVAILABLE", "OUT_OF_SERVICE"],
  OUT_OF_SERVICE: ["AVAILABLE", "MAINTENANCE"],
};

export const RESERVATION_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED", "EXPIRED"],
  CONFIRMED: ["ARRIVED", "CANCELLED", "NO_SHOW"],
  ARRIVED: ["SEATED", "NO_SHOW"],
  SEATED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
  EXPIRED: [],
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

export class CrossTenantAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrossTenantAccessError";
  }
}

export function overlapsWindow(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();
}

export function overlapsWithTurnoverBuffer(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
  turnoverBufferMinutes = 0,
): boolean {
  const bufferMs = turnoverBufferMinutes * 60 * 1000;
  return startA.getTime() < endB.getTime() + bufferMs && endA.getTime() + bufferMs > startB.getTime();
}

export function resolutionSortKey(table: TableRecord): string {
  return `${table.zoneId || ""}|${table.code||table.displayName}`;
}

export class TableReservationDomainService {
  private readonly floors: FloorRecord[] = [];
  private readonly zones: ZoneRecord[] = [];
  private readonly tables: TableRecord[] = [];
  private readonly reservations: ReservationRecord[] = [];
  private readonly holds: TableHold[] = [];
  private readonly sessions: TableSessionRecord[] = [];
  private readonly features: Map<string, TableFeature> = new Map();
  private readonly auditEvents: AuditEvent[] = [];

  private recordAudit(type: string, payload: Record<string, unknown>): AuditEvent {
    const event: AuditEvent = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      payload,
      createdAt: new Date(),
    };
    this.auditEvents.push(event);
    return event;
  }

  public getAuditEvents(): AuditEvent[] {
    return [...this.auditEvents];
  }

  public validateTenantContext(
    authContext: { organizationId?: string; outletId?: string } | null,
    expected: { organizationId?: string; outletId?: string } | null,
  ): void {
    if (!authContext || !expected) {
      throw new CrossTenantAccessError("Authorization context is required.");
    }

    if (authContext.organizationId && expected.organizationId && authContext.organizationId !== expected.organizationId) {
      throw new CrossTenantAccessError("Cross-organization access is not allowed.");
    }

    if (authContext.outletId && expected.outletId && authContext.outletId !== expected.outletId) {
      throw new CrossTenantAccessError("Cross-outlet access is not allowed.");
    }
  }

  public registerFeature(feature: TableFeature): TableFeature {
    this.features.set(feature.code.toUpperCase(), feature);
    return feature;
  }

  public getFeatureSummary(featureId: string): TableFeature | undefined {
    return this.features.get(featureId.toUpperCase());
  }

  public registerFloor(floor: FloorRecord): FloorRecord {
    const existing = this.floors.find(
      (entry) => entry.organizationId === floor.organizationId && entry.outletId === floor.outletId && entry.name === floor.name,
    );
    if (existing) {
      throw new InvalidTableStatusError(`Floor already exists for outlet: ${floor.name}`);
    }

    this.floors.push(floor);
    this.recordAudit("FLOOR_CREATED", {
      floorId: floor.id,
      organizationId: floor.organizationId,
      outletId: floor.outletId,
      displayName: floor.displayName,
    });
    return floor;
  }

  public getFloorById(floorId: string): FloorRecord | undefined {
    return this.floors.find((floor) => floor.id === floorId);
  }

  public registerZone(zone: ZoneRecord): ZoneRecord {
    const floorExists = this.floors.some((floor) => floor.id === zone.floorId && floor.outletId === zone.outletId && floor.organizationId === zone.organizationId);
    if (!floorExists) {
      throw new InvalidTableStatusError(`Zone floor does not exist: ${zone.floorId}`);
    }

    const existing = this.zones.find(
      (entry) => entry.organizationId === zone.organizationId && entry.outletId === zone.outletId && entry.floorId === zone.floorId && entry.name === zone.name,
    );
    if (existing) {
      throw new InvalidTableStatusError(`Zone already exists: ${zone.name}`);
    }

    this.zones.push(zone);
    this.recordAudit("ZONE_CREATED", {
      zoneId: zone.id,
      floorId: zone.floorId,
      organizationId: zone.organizationId,
      outletId: zone.outletId,
      displayName: zone.displayName,
    });
    return zone;
  }

  public getZoneById(zoneId: string): ZoneRecord | undefined {
    return this.zones.find((zone) => zone.id === zoneId);
  }

  public getAllFloors(): FloorRecord[] {
    return [...this.floors];
  }

  public getAllTables(): TableRecord[] {
    return [...this.tables];
  }

  public getAllReservations(): ReservationRecord[] {
    return [...this.reservations];
  }

  public getTableById(tableId: string): TableRecord | undefined {
    return this.tables.find((table) => table.id === tableId);
  }

  public validateTableCapacity(input: {
    minCapacity: number;
    recommendedCapacity: number;
    maxCapacity: number;
  }): void {
    if (!Number.isFinite(input.minCapacity) || input.minCapacity <= 0) {
      throw new InvalidTableStatusError("Table min capacity must be greater than zero.");
    }
    if (!Number.isFinite(input.recommendedCapacity) || input.recommendedCapacity <= 0) {
      throw new InvalidTableStatusError("Table recommended capacity must be greater than zero.");
    }
    if (!Number.isFinite(input.maxCapacity) || input.maxCapacity <= 0) {
      throw new InvalidTableStatusError("Table max capacity must be greater than zero.");
    }
    if (input.minCapacity > input.recommendedCapacity) {
      throw new InvalidTableStatusError("Table min capacity cannot exceed recommended capacity.");
    }
    if (input.recommendedCapacity > input.maxCapacity) {
      throw new InvalidTableStatusError("Table recommended capacity cannot exceed max capacity.");
    }
  }

  public createTable(input: {
    organizationId: string;
    outletId: string;
    floorId: string;
    zoneId: string;
    code: string;
    internalName: string;
    displayName: string;
    shape: TableShape;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    zIndex: number;
    minCapacity: number;
    recommendedCapacity: number;
    maxCapacity: number;
    reservationEnabled: boolean;
    minimumOrderEnabled: boolean;
    minimumOrderAmount: number;
    minimumOrderType: MinimumOrderType;
    displayOnWebsite: boolean;
    customerVisible: boolean;
    status?: TableStatus;
    allowCombination?: boolean;
    features?: string[];
  }): TableRecord {
    if (!input.organizationId || !input.outletId || !input.floorId || !input.zoneId) {
      throw new InvalidTableStatusError("Table must belong to a valid organization, outlet, floor, and zone.");
    }

    const floorExists = this.floors.some((floor) => floor.id === input.floorId && floor.organizationId === input.organizationId && floor.outletId === input.outletId);
    if (!floorExists) {
      throw new InvalidTableStatusError(`Floor does not exist for table: ${input.floorId}`);
    }

    const zoneExists = this.zones.some((zone) => zone.id === input.zoneId && zone.organizationId === input.organizationId && zone.outletId === input.outletId && zone.floorId === input.floorId);
    if (!zoneExists) {
      throw new InvalidTableStatusError(`Zone does not belong to the same outlet/floor: ${input.zoneId}`);
    }

    this.validateTableCapacity({
      minCapacity: input.minCapacity,
      recommendedCapacity: input.recommendedCapacity,
      maxCapacity: input.maxCapacity,
    });

    if (input.width <= 0 || input.height <= 0) {
      throw new InvalidTableStatusError("Table dimensions must be greater than zero.");
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
      zoneId: input.zoneId,
      zone: this.getZoneById(input.zoneId)?.displayName ?? input.zoneId,
      code: input.code,
      internalName: input.internalName,
      displayName: input.displayName,
      shape: input.shape,
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
      rotation: input.rotation,
      zIndex: input.zIndex,
      minCapacity: input.minCapacity,
      recommendedCapacity: input.recommendedCapacity,
      maxCapacity: input.maxCapacity,
      reservationEnabled: input.reservationEnabled,
      minimumOrderEnabled: input.minimumOrderEnabled,
      minimumOrderAmount: input.minimumOrderAmount,
      minimumOrderType: input.minimumOrderType,
      displayOnWebsite: input.displayOnWebsite,
      customerVisible: input.customerVisible,
      status: input.status ?? "AVAILABLE",
      allowCombination: input.allowCombination ?? true,
      features: [...(input.features ?? [])],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.tables.push(table);
    this.recordAudit("TABLE_CREATED", {
      tableId: table.id,
      organizationId: table.organizationId,
      outletId: table.outletId,
      floorId: table.floorId,
      zoneId: table.zoneId,
      code: table.code,
    });
    return table;
  }

  public updateTableStatus(tableId: string, status: TableStatus): TableRecord {
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
    this.recordAudit("TABLE_STATUS_CHANGED", {
      tableId: table.id,
      from: table.status,
      to: status,
      organizationId: table.organizationId,
      outletId: table.outletId,
    });
    return { ...table };
  }

  public validateReservationWindow(startAt: Date, endAt: Date): void {
    if (!(startAt instanceof Date) || !(endAt instanceof Date) || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new InvalidReservationWindowError("Reservation start and end timestamps are required.");
    }

    if (endAt.getTime() <= startAt.getTime()) {
      throw new InvalidReservationWindowError("Reservation end time must be later than the start time.");
    }
  }

  public isTableAvailableForReservation(
    table: TableRecord,
    startAt: Date,
    endAt: Date,
    turnoverBufferMinutes = 0,
  ): boolean {
    if (!table.reservationEnabled) {
      return false;
    }
    if (table.status === "MAINTENANCE" || table.status === "OUT_OF_SERVICE") {
      return false;
    }
    if (table.status === "OCCUPIED") {
      return false;
    }

    const activeReservations = this.reservations.filter((reservation) => {
      if (reservation.tableSnapshot && reservation.tableSnapshot.tableId !== table.id) {
        return false;
      }
      if (reservation.assignedTableId && reservation.assignedTableId !== table.id && reservation.requestedTableId !== table.id) {
        return false;
      }
      if (reservation.status === "CANCELLED" || reservation.status === "COMPLETED" || reservation.status === "NO_SHOW" || reservation.status === "EXPIRED") {
        return false;
      }
      return true;
    });

    for (const reservation of activeReservations) {
      const requestTableId = reservation.requestedTableId ?? reservation.assignedTableId ?? reservation.tableSnapshot?.tableId;
      if (requestTableId !== table.id) {
        continue;
      }
      if (overlapsWithTurnoverBuffer(startAt, endAt, reservation.startAt, reservation.endAt, turnoverBufferMinutes)) {
        return false;
      }
    }

    return true;
  }

  public findAvailableTables(input: TableAvailabilityInput): TableRecord[] {
    const {
      organizationId,
      outletId,
      startAt,
      endAt,
      guestCount,
      floorId,
      zone,
      preferredZone,
      preferredFloor,
      requiredFeatures = [],
      turnoverBufferMinutes = 0,
    } = input;

    this.validateReservationWindow(startAt, endAt);

    const allTables = this.tables.filter((table) => {
      if (table.organizationId !== organizationId || table.outletId !== outletId) {
        return false;
      }
      if (table.maxCapacity < guestCount) {
        return false;
      }
      if (floorId && table.floorId !== floorId) {
        return false;
      }
      if (preferredFloor && table.floorId !== preferredFloor) {
        return false;
      }
      if (zone && table.zone?.toLowerCase() !== zone.toLowerCase()) {
        return false;
      }
      if (preferredZone && table.zone?.toLowerCase() !== preferredZone.toLowerCase()) {
        return false;
      }
      if (requiredFeatures.length > 0 && !requiredFeatures.every((feature) => table.features.includes(feature))) {
        return false;
      }
      return this.isTableAvailableForReservation(table, startAt, endAt, turnoverBufferMinutes);
    });

    return allTables.sort((left, right) => {
      const leftScore = left.recommendedCapacity - guestCount;
      const rightScore = right.recommendedCapacity - guestCount;
      if (leftScore !== rightScore) {
        return leftScore - rightScore;
      }
      return resolutionSortKey(left).localeCompare(resolutionSortKey(right));
    });
  }

  public findBestAvailableTable(input: TableAvailabilityInput): TableRecord | undefined {
    const available = this.findAvailableTables(input);
    if (available.length === 0) {
      return undefined;
    }

    const required = input.requiredFeatures ?? [];
    return available.sort((left, right) => {
      const leftMatches = required.every((feature) => left.features.includes(feature)) ? 1 : 0;
      const rightMatches = required.every((feature) => right.features.includes(feature)) ? 1 : 0;
      if (leftMatches !== rightMatches) {
        return rightMatches - leftMatches;
      }

      const leftGap = Math.abs(left.recommendedCapacity - input.guestCount);
      const rightGap = Math.abs(right.recommendedCapacity - input.guestCount);
      if (leftGap !== rightGap) {
        return leftGap - rightGap;
      }

      return resolutionSortKey(left).localeCompare(resolutionSortKey(right));
    })[0];
  }

  public findBestTableCombination(input: {
    organizationId: string;
    outletId: string;
    guestCount: number;
    startAt: Date;
    endAt: Date;
    turnoverBufferMinutes?: number;
    preferredFloor?: string;
    preferredZone?: string;
  }): TableCombinationResult | undefined {
    const workingTables = this.tables.filter((table) => {
      if (table.organizationId !== input.organizationId || table.outletId !== input.outletId) {
        return false;
      }
      if (!table.allowCombination) {
        return false;
      }
      if (!this.isTableAvailableForReservation(table, input.startAt, input.endAt, input.turnoverBufferMinutes ?? 0)) {
        return false;
      }
      if (input.preferredFloor && table.floorId !== input.preferredFloor) {
        return false;
      }
      if (input.preferredZone && table.zone?.toLowerCase() !== input.preferredZone.toLowerCase()) {
        return false;
      }
      return true;
    }).sort((left, right) => left.recommendedCapacity - right.recommendedCapacity || resolutionSortKey(left).localeCompare(resolutionSortKey(right)));

    let best: TableCombinationResult | undefined;

    const combine = (index: number, selected: TableRecord[], currentCapacity: number): void => {
      if (best && selected.length >= best.tables.length && currentCapacity >= input.guestCount) {
        return;
      }

      const remaining = workingTables.slice(index);
      const candidateCapacity = currentCapacity + remaining.reduce((sum, table) => sum + table.maxCapacity, 0);
      if (currentCapacity >= input.guestCount && selected.length > 0) {
        const next = {
          tables: [...selected],
          totalCapacity: currentCapacity,
          selectedBy: selected.map((item) => item.id),
        };
        if (!best || next.tables.length < best.tables.length || (next.tables.length === best.tables.length && next.totalCapacity < best.totalCapacity)) {
          best = next;
        }
        return;
      }
      if (candidateCapacity < input.guestCount) {
        return;
      }

      for (let i = index; i < workingTables.length; i += 1) {
        const table = workingTables[i];
        const nextSelected = [...selected, table];
        const nextCapacity = currentCapacity + table.maxCapacity;
        if (nextCapacity >= input.guestCount) {
          const candidate = {
            tables: [...nextSelected],
            totalCapacity: nextCapacity,
            selectedBy: nextSelected.map((item) => item.id),
          };
          if (!best || candidate.tables.length < best.tables.length || (candidate.tables.length === best.tables.length && candidate.totalCapacity < best.totalCapacity)) {
            best = candidate;
          }
          continue;
        }
        combine(i + 1, nextSelected, nextCapacity);
      }
    };

    combine(0, [], 0);
    return best;
  }

  public createHold(input: {
    organizationId: string;
    outletId: string;
    tableIds: string[];
    customerId?: string;
    sessionId?: string;
    reservationAttemptId?: string;
    expiresAt: Date;
  }): TableHold {
    if (!input.tableIds.length) {
      throw new InvalidTableStatusError("A table hold must include at least one table.");
    }

    const normalized = [...new Set(input.tableIds)];
    for (const tableId of normalized) {
      const table = this.getTableById(tableId);
      if (!table) {
        throw new InvalidTableStatusError(`Table not found for hold: ${tableId}`);
      }
      this.validateTenantContext(
        { organizationId: table.organizationId, outletId: table.outletId },
        { organizationId: input.organizationId, outletId: input.outletId },
      );
    }

    const hold: TableHold = {
      id: `hold_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organizationId: input.organizationId,
      outletId: input.outletId,
      tableIds: normalized,
      customerId: input.customerId,
      sessionId: input.sessionId,
      reservationAttemptId: input.reservationAttemptId,
      createdAt: new Date(),
      expiresAt: input.expiresAt,
      status: "ACTIVE",
    };

    this.holds.push(hold);
    this.recordAudit("TABLE_HOLD_CREATED", {
      holdId: hold.id,
      tableIds: hold.tableIds,
      organizationId: hold.organizationId,
      outletId: hold.outletId,
      expiresAt: hold.expiresAt,
    });
    return hold;
  }

  public expireHold(holdId: string): TableHold {
    const hold = this.holds.find((entry) => entry.id === holdId);
    if (!hold) {
      throw new InvalidTableStatusError(`Hold not found: ${holdId}`);
    }
    hold.status = "EXPIRED";
    this.recordAudit("TABLE_HOLD_EXPIRED", {
      holdId: hold.id,
      tableIds: hold.tableIds,
      expiredAt: new Date(),
    });
    return hold;
  }

  public releaseHold(holdId: string): TableHold {
    const hold = this.holds.find((entry) => entry.id === holdId);
    if (!hold) {
      throw new InvalidTableStatusError(`Hold not found: ${holdId}`);
    }
    hold.status = "RELEASED";
    this.recordAudit("TABLE_HOLD_RELEASED", {
      holdId: hold.id,
      tableIds: hold.tableIds,
      releasedAt: new Date(),
    });
    return hold;
  }

  public startTableSession(input: {
    organizationId: string;
    outletId: string;
    tableIds: string[];
    customerId?: string;
    reservationId?: string;
    startedAt: Date;
    status?: TableSessionStatus;
  }): TableSessionRecord {
    if (!input.tableIds.length) {
      throw new InvalidTableStatusError("A table session must include at least one table.");
    }

    const normalized = [...new Set(input.tableIds)];
    for (const tableId of normalized) {
      const table = this.getTableById(tableId);
      if (!table) {
        throw new InvalidTableStatusError(`Table not found for session: ${tableId}`);
      }
      this.validateTenantContext(
        { organizationId: table.organizationId, outletId: table.outletId },
        { organizationId: input.organizationId, outletId: input.outletId },
      );
      if (table.status === "MAINTENANCE" || table.status === "OUT_OF_SERVICE") {
        throw new InvalidTableStatusError(`Table is unavailable for session: ${table.code}`);
      }
      const activeSession = this.sessions.find((session) => session.status === "ACTIVE" && session.tableIds.includes(tableId));
      if (activeSession) {
        throw new InvalidTableStatusError(`An active session already exists for table ${table.code}.`);
      }
    }

    const session: TableSessionRecord = {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organizationId: input.organizationId,
      outletId: input.outletId,
      tableIds: normalized,
      reservationId: input.reservationId,
      customerId: input.customerId,
      startedAt: input.startedAt,
      status: input.status ?? "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.push(session);
    for (const tableId of normalized) {
      const table = this.getTableById(tableId);
      if (table) {
        table.status = "OCCUPIED";
        table.updatedAt = new Date();
      }
    }

    this.recordAudit("TABLE_SESSION_STARTED", {
      sessionId: session.id,
      tableIds: session.tableIds,
      organizationId: session.organizationId,
      outletId: session.outletId,
      reservationId: session.reservationId,
      customerId: session.customerId,
    });
    return session;
  }

  public endTableSession(sessionId: string, status: TableSessionStatus = "COMPLETED"): TableSessionRecord {
    const session = this.sessions.find((entry) => entry.id === sessionId);
    if (!session) {
      throw new InvalidTableStatusError(`Table session not found: ${sessionId}`);
    }
    session.status = status;
    session.endedAt = new Date();
    session.updatedAt = new Date();

    for (const tableId of session.tableIds) {
      const table = this.getTableById(tableId);
      if (table) {
        table.status = "AVAILABLE";
        table.updatedAt = new Date();
      }
    }

    this.recordAudit("TABLE_SESSION_ENDED", {
      sessionId: session.id,
      tableIds: session.tableIds,
      status,
      endedAt: session.endedAt,
    });
    return session;
  }

  public reserveTable(input: ReserveTableInput): ReservationRecord {
    const tableId = input.tableId ?? input.requestedTableId;
    if (!tableId) {
      throw new InvalidTableStatusError("A table reservation requires a target table id.");
    }

    const table = this.getTableById(tableId);
    if (!table) {
      throw new InvalidTableStatusError(`Table not found: ${tableId}`);
    }

    this.validateTenantContext(
      { organizationId: table.organizationId, outletId: table.outletId },
      { organizationId: input.organizationId, outletId: input.outletId },
    );

    this.validateReservationWindow(input.startAt, input.endAt);

    if (input.guestCount <= 0) {
      throw new InvalidReservationWindowError("Guest count must be greater than zero.");
    }
    if (input.guestCount > table.maxCapacity) {
      throw new InvalidTableStatusError(`Guest count exceeds table capacity: ${table.code}`);
    }
    if (!table.reservationEnabled) {
      throw new InvalidTableStatusError(`Table reservations are disabled for ${table.code}.`);
    }
    if (table.status === "MAINTENANCE" || table.status === "OUT_OF_SERVICE") {
      throw new InvalidTableStatusError(`Table is unavailable for reservation: ${table.code}`);
    }

    const activeHold = this.holds.some(
      (hold) => hold.status === "ACTIVE" && hold.tableIds.includes(table.id) && hold.expiresAt.getTime() > Date.now(),
    );
    if (activeHold) {
      throw new ReservationConflictError(`Table ${table.code} is currently on hold.`);
    }

    const conflict = this.reservations.some((reservation) => {
      const reservationTableId = reservation.requestedTableId ?? reservation.assignedTableId ?? reservation.tableSnapshot?.tableId;
      if (reservationTableId !== table.id) {
        return false;
      }
      if (["CANCELLED", "COMPLETED", "NO_SHOW", "EXPIRED"].includes(reservation.status)) {
        return false;
      }
      return overlapsWithTurnoverBuffer(input.startAt, input.endAt, reservation.startAt, reservation.endAt, 0);
    });

    if (conflict) {
      throw new ReservationConflictError(`Table ${table.code} is already reserved for the requested window.`);
    }

    const reservationCode = input.reservationCode ?? `RSV-${Date.now()}`;
    const reservationDate = input.reservationDate ?? new Date();
    const snapshot: TableSnapshot = input.tableSnapshot ?? {
      tableId: table.id,
      tableCode: table.code,
      displayName: table.displayName,
      floorId: table.floorId,
      floorName: this.getFloorById(table.floorId)?.displayName ?? "Unknown",
      zoneId: table.zoneId,
      zoneName: this.getZoneById(table.zoneId)?.displayName ?? table.zone ?? "Unknown",
      capacity: table.maxCapacity,
      features: [...table.features],
      minimumOrderEnabled: table.minimumOrderEnabled,
      minimumOrderAmount: table.minimumOrderAmount,
      minimumOrderType: table.minimumOrderType,
    };

    const reservation: ReservationRecord = {
      id: `reservation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organizationId: input.organizationId,
      outletId: input.outletId,
      customerId: input.customerId,
      reservationCode,
      reservationDate,
      startAt: input.startAt,
      endAt: input.endAt,
      guestCount: input.guestCount,
      requestedTableId: table.id,
      assignedTableId: table.id,
      status: "PENDING",
      notes: input.notes,
      preferences: input.preferences ?? [],
      minimumOrderSnapshot: input.minimumOrderSnapshot ?? {
        enabled: table.minimumOrderEnabled,
        amount: table.minimumOrderAmount,
        type: table.minimumOrderType,
      },
      tableSnapshot: snapshot,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.reservations.push(reservation);
    table.status = "RESERVED";
    table.updatedAt = new Date();
    this.recordAudit("RESERVATION_CREATED", {
      reservationId: reservation.id,
      reservationCode,
      tableId: table.id,
      organizationId: reservation.organizationId,
      outletId: reservation.outletId,
      startAt: reservation.startAt,
      endAt: reservation.endAt,
    });
    return reservation;
  }

  public transitionReservation(reservationId: string, nextStatus: ReservationStatus): ReservationRecord {
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

    const table = this.getTableById(reservation.assignedTableId ?? reservation.requestedTableId ?? reservation.tableSnapshot?.tableId ?? "");
    if (table) {
      if (nextStatus === "CONFIRMED") {
        table.status = "RESERVED";
      } else if (nextStatus === "ARRIVED" || nextStatus === "SEATED") {
        table.status = "OCCUPIED";
      } else if (nextStatus === "CANCELLED" || nextStatus === "NO_SHOW" || nextStatus === "EXPIRED" || nextStatus === "COMPLETED") {
        table.status = "AVAILABLE";
      }
      table.updatedAt = new Date();
    }

    this.recordAudit(`RESERVATION_${nextStatus}`, {
      reservationId: reservation.id,
      reservationCode: reservation.reservationCode,
      tableId: reservation.assignedTableId ?? reservation.requestedTableId,
      status: nextStatus,
      organizationId: reservation.organizationId,
      outletId: reservation.outletId,
    });

    return { ...reservation };
  }

  public getReservationById(reservationId: string): ReservationRecord | undefined {
    return this.reservations.find((reservation) => reservation.id === reservationId);
  }

  public listReservationsByTable(tableId: string): ReservationRecord[] {
    return this.reservations
      .filter((reservation) => (reservation.requestedTableId ?? reservation.assignedTableId ?? reservation.tableSnapshot?.tableId) === tableId)
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }
}

export function normalizeZoneName(zone: string): string {
  return zone.trim();
}

export function requireTableFeature(table: TableRecord, featureCode: string): void {
  if (!table.features.includes(featureCode.toUpperCase())) {
    throw new InvalidTableStatusError(`Table ${table.code} does not support feature: ${featureCode}`);
  }
}
