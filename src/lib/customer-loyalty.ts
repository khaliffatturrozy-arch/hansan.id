export type CustomerStatus = "ACTIVE" | "INACTIVE" | "BLOCKED";
export type CustomerVerification = "EMAIL" | "PHONE";
export type LoyaltyEventType = "ORDER" | "RESERVATION" | "VISIT" | "SPEND" | "CAMPAIGN" | "BIRTHDAY" | "REFERRAL" | "REVIEW" | "BONUS";
export type PointLedgerStatus = "PENDING" | "AVAILABLE" | "REVERSED" | "EXPIRED";
export type LeaderboardMetric = "spend" | "points" | "visits" | "tier";
export type LeaderboardPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "lifetime";

export type CustomerRecord = {
  id: string;
  organizationId: string;
  fullName: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  status: CustomerStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type TierRecord = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  pointsThreshold: number;
  isDefault: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type MembershipRecord = {
  id: string;
  customerId: string;
  organizationId: string;
  outletId: string;
  tierId: string;
  currentPoints: number;
  lifetimePoints: number;
  tierPoints: number;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  createdAt: Date;
  updatedAt: Date;
};

export type PointLedgerEntry = {
  id: string;
  customerId: string;
  organizationId: string;
  outletId: string;
  eventType: LoyaltyEventType;
  description: string;
  points: number;
  status: PointLedgerStatus;
  referenceId: string;
  channel: string;
  createdAt: Date;
};

export type LeaderboardEntry = {
  customerId: string;
  displayName: string;
  points: number;
  tierId: string;
  score: number;
};

export type PointsEventInput = {
  customerId: string;
  organizationId: string;
  outletId: string;
  eventType: LoyaltyEventType;
  reason: string;
  points: number;
  referenceId: string;
  status?: PointLedgerStatus;
  channel?: string;
};

export type CreateMembershipInput = {
  customerId: string;
  organizationId: string;
  outletId: string;
  tierId: string;
};

export class CustomerLoyaltyService {
  private readonly customers = new Map<string, CustomerRecord>();
  private readonly tiers = new Map<string, TierRecord>();
  private readonly memberships = new Map<string, MembershipRecord>();
  private readonly ledger: PointLedgerEntry[] = [];
  private readonly seenEvents = new Set<string>();

  private static normalizePhone(rawPhone: string): string {
    const digits = rawPhone.replace(/[^\d+]/g, "").replace(/^\+/, "+");
    return digits || "";
  }

  private static makeKey(input: string): string {
    return input.trim().toLowerCase();
  }

  public createTier(input: {
    id: string;
    organizationId: string;
    code: string;
    name: string;
    pointsThreshold: number;
    isDefault?: boolean;
    active?: boolean;
  }): TierRecord {
    const existing = Array.from(this.tiers.values()).find(
      (tier) => tier.organizationId === input.organizationId && CustomerLoyaltyService.makeKey(tier.code) === CustomerLoyaltyService.makeKey(input.code),
    );
    if (existing) {
      return existing;
    }

    const tier: TierRecord = {
      id: input.id,
      organizationId: input.organizationId,
      code: input.code,
      name: input.name,
      pointsThreshold: input.pointsThreshold,
      isDefault: input.isDefault ?? false,
      active: input.active ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.tiers.set(tier.id, tier);
    return tier;
  }

  public getTierById(tierId: string): TierRecord | undefined {
    return this.tiers.get(tierId);
  }

  public createCustomer(input: {
    organizationId: string;
    fullName: string;
    email: string;
    phone: string;
    status?: CustomerStatus;
    id?: string;
  }): CustomerRecord {
    const id = input.id ?? `customer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const normalizedPhone = CustomerLoyaltyService.normalizePhone(input.phone);
    const customer: CustomerRecord = {
      id,
      organizationId: input.organizationId,
      fullName: input.fullName,
      email: input.email,
      phone: normalizedPhone,
      emailVerified: false,
      phoneVerified: false,
      status: input.status ?? "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.customers.set(customer.id, customer);
    return customer;
  }

  public getCustomer(customerId: string): CustomerRecord | undefined {
    return this.customers.get(customerId);
  }

  public verifyCustomerIdentity(customerId: string, input: { email?: boolean; phone?: boolean }): CustomerRecord {
    const customer = this.customers.get(customerId);
    if (!customer) {
      throw new Error(`Customer not found: ${customerId}`);
    }
    customer.emailVerified = input.email ?? customer.emailVerified;
    customer.phoneVerified = input.phone ?? customer.phoneVerified;
    customer.updatedAt = new Date();
    return customer;
  }

  public createMembership(input: CreateMembershipInput): MembershipRecord {
    const existing = Array.from(this.memberships.values()).find(
      (membership) => membership.customerId === input.customerId && membership.organizationId === input.organizationId,
    );
    if (existing) {
      return existing;
    }

    const membership: MembershipRecord = {
      id: `membership_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      customerId: input.customerId,
      organizationId: input.organizationId,
      outletId: input.outletId,
      tierId: input.tierId,
      currentPoints: 0,
      lifetimePoints: 0,
      tierPoints: 0,
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.memberships.set(input.customerId, membership);
    return membership;
  }

  public getMembership(customerId: string): MembershipRecord | undefined {
    return this.memberships.get(customerId);
  }

  public applyPointsEvent(input: PointsEventInput): { duplicate: boolean; delta: number; total: number; status: string; membership?: MembershipRecord } {
    const dedupeKey = `${input.customerId}:${input.eventType}:${input.referenceId}`;
    if (this.seenEvents.has(dedupeKey)) {
      const membership = this.memberships.get(input.customerId);
      return {
        duplicate: true,
        delta: 0,
        total: membership?.currentPoints ?? 0,
        status: "REPLAYED",
        membership,
      };
    }

    const membership = this.memberships.get(input.customerId) ?? this.createMembership({
      customerId: input.customerId,
      organizationId: input.organizationId,
      outletId: input.outletId,
      tierId: this.getDefaultTier(input.organizationId)?.id ?? "tier-starter",
    });

    const eventPoints = Number(input.points) || 0;
    membership.currentPoints += eventPoints;
    membership.lifetimePoints += eventPoints;
    membership.tierPoints += eventPoints;
    membership.updatedAt = new Date();

    const ledgerEntry: PointLedgerEntry = {
      id: `ledger_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      customerId: input.customerId,
      organizationId: input.organizationId,
      outletId: input.outletId,
      eventType: input.eventType,
      description: input.reason,
      points: eventPoints,
      status: input.status ?? "AVAILABLE",
      referenceId: input.referenceId,
      channel: input.channel ?? "IN_STORE",
      createdAt: new Date(),
    };
    this.ledger.push(ledgerEntry);
    this.seenEvents.add(dedupeKey);

    const tier = this.resolveTierForPoints(input.organizationId, membership.currentPoints);
    if (tier) {
      membership.tierId = tier.id;
    }
    return {
      duplicate: false,
      delta: eventPoints,
      total: membership.currentPoints,
      status: "AVAILABLE",
      membership,
    };
  }

  public getDefaultTier(organizationId: string): TierRecord | undefined {
    return Array.from(this.tiers.values()).find(
      (tier) => tier.organizationId === organizationId && tier.isDefault && tier.active,
    );
  }

  public resolveTierForPoints(organizationId: string, totalPoints: number): TierRecord | undefined {
    const tiers = Array.from(this.tiers.values())
      .filter((tier) => tier.organizationId === organizationId && tier.active)
      .sort((left, right) => right.pointsThreshold - left.pointsThreshold);
    return tiers.find((tier) => totalPoints >= tier.pointsThreshold) ?? tiers[0];
  }

  public getLeaderboard(input: { period: LeaderboardPeriod; metric: LeaderboardMetric }): LeaderboardEntry[] {
    const rows = Array.from(this.memberships.values()).map((membership) => {
      const customer = this.customers.get(membership.customerId);
      return {
        customerId: membership.customerId,
        displayName: customer?.fullName ?? "Anonymous",
        points: membership.currentPoints,
        tierId: membership.tierId,
        score: membership.currentPoints,
      };
    });

    return rows.sort((left, right) => right.score - left.score);
  }
}
