export type PromotionType = "percentage" | "fixed" | "voucher fixed" | "voucher percentage" | "loyalty points" | "bonus points" | "membership benefit";
export type PromotionAudience = "everyone" | "new" | "existing" | "members" | "tier" | "specific customer" | "behavioral segment" | "birthday" | "first reservation";
export type PromotionBenefit = {
  type: "percentage" | "fixed" | "points";
  value: number;
};

export type PromotionRecord = {
  id: string;
  organizationId: string;
  outletId: string;
  name: string;
  description: string;
  type: PromotionType;
  audience: PromotionAudience;
  benefit: PromotionBenefit;
  minSpend: number;
  maxDiscount?: number;
  usageLimit?: number;
  perCustomerLimit?: number;
  startAt: Date;
  endAt: Date;
  active: boolean;
  stackingEnabled: boolean;
  priority: number;
  createdAt: Date;
};

export type VoucherRecord = {
  id: string;
  organizationId: string;
  outletId: string;
  code: string;
  type: "fixed" | "percentage";
  value: number;
  minSpend: number;
  customerId?: string;
  maxUses: number;
  usedCount: number;
  active: boolean;
  createdAt: Date;
};

export type PromotionApplicationResult = {
  promotionId: string;
  applied: boolean;
  duplicate: boolean;
  discountAmount: number;
  finalTotal: number;
};

export class PromotionEngineService {
  private readonly promotions = new Map<string, PromotionRecord>();
  private readonly vouchers = new Map<string, VoucherRecord>();
  private readonly appliedKeys = new Set<string>();
  private readonly voucherUsage = new Map<string, number>();
  private readonly analytics = new Map<string, number>();

  public createPromotion(input: {
    id: string;
    organizationId: string;
    outletId: string;
    name: string;
    description: string;
    type: PromotionType;
    audience: PromotionAudience;
    benefit: PromotionBenefit;
    minSpend: number;
    maxDiscount?: number;
    usageLimit?: number;
    perCustomerLimit?: number;
    startAt: Date;
    endAt: Date;
    active?: boolean;
    stackingEnabled?: boolean;
    priority?: number;
  }): PromotionRecord {
    const promotion: PromotionRecord = {
      id: input.id,
      organizationId: input.organizationId,
      outletId: input.outletId,
      name: input.name,
      description: input.description,
      type: input.type,
      audience: input.audience,
      benefit: input.benefit,
      minSpend: input.minSpend,
      maxDiscount: input.maxDiscount,
      usageLimit: input.usageLimit,
      perCustomerLimit: input.perCustomerLimit,
      startAt: input.startAt,
      endAt: input.endAt,
      active: input.active ?? true,
      stackingEnabled: input.stackingEnabled ?? false,
      priority: input.priority ?? 0,
      createdAt: new Date(),
    };
    this.promotions.set(promotion.id, promotion);
    return promotion;
  }

  public issueVoucher(input: {
    id: string;
    organizationId: string;
    outletId: string;
    code: string;
    value: number;
    type: "fixed" | "percentage";
    minSpend: number;
    customerId?: string;
    maxUses?: number;
    active?: boolean;
  }): VoucherRecord {
    const voucher: VoucherRecord = {
      id: input.id,
      organizationId: input.organizationId,
      outletId: input.outletId,
      code: input.code,
      type: input.type,
      value: input.value,
      minSpend: input.minSpend,
      customerId: input.customerId,
      maxUses: input.maxUses ?? 1,
      usedCount: 0,
      active: input.active ?? true,
      createdAt: new Date(),
    };
    this.vouchers.set(voucher.id, voucher);
    return voucher;
  }

  public applyPromotionToOrder(input: {
    promotionId: string;
    order: { id: string; organizationId: string; outletId: string; subtotal: number; customerId?: string };
    customerId?: string;
    channel?: string;
  }): PromotionApplicationResult {
    const promotion = this.promotions.get(input.promotionId);
    if (!promotion) {
      return { promotionId: input.promotionId, applied: false, duplicate: false, discountAmount: 0, finalTotal: input.order.subtotal };
    }

    const currentKey = `${promotion.id}:${input.order.id}:${input.customerId ?? input.order.customerId ?? "guest"}`;
    if (this.appliedKeys.has(currentKey)) {
      return { promotionId: promotion.id, applied: true, duplicate: true, discountAmount: promotion.benefit.type === "percentage" ? input.order.subtotal * (promotion.benefit.value / 100) : promotion.benefit.value, finalTotal: input.order.subtotal };
    }

    const now = new Date();
    if (!promotion.active || now < promotion.startAt || now > promotion.endAt) {
      return { promotionId: promotion.id, applied: false, duplicate: false, discountAmount: 0, finalTotal: input.order.subtotal };
    }
    if (input.order.subtotal < promotion.minSpend) {
      return { promotionId: promotion.id, applied: false, duplicate: false, discountAmount: 0, finalTotal: input.order.subtotal };
    }

    const discount = promotion.benefit.type === "percentage"
      ? Math.min(input.order.subtotal * (promotion.benefit.value / 100), promotion.maxDiscount ?? Number.POSITIVE_INFINITY)
      : Math.min(promotion.benefit.value, promotion.maxDiscount ?? Number.POSITIVE_INFINITY);

    this.appliedKeys.add(currentKey);
    this.analytics.set(`promo:${promotion.id}`, (this.analytics.get(`promo:${promotion.id}`) ?? 0) + 1);
    return {
      promotionId: promotion.id,
      applied: true,
      duplicate: false,
      discountAmount: discount,
      finalTotal: input.order.subtotal - discount,
    };
  }

  public applyVoucher(input: { voucherId: string; order: { id: string; organizationId: string; outletId: string; subtotal: number; customerId?: string }; customerId?: string }): { voucherId: string; applied: boolean; appliedAmount: number; duplicate: boolean } {
    const voucher = this.vouchers.get(input.voucherId);
    if (!voucher || !voucher.active) {
      return { voucherId: input.voucherId, applied: false, appliedAmount: 0, duplicate: false };
    }

    if (voucher.customerId && voucher.customerId !== (input.customerId ?? input.order.customerId)) {
      return { voucherId: input.voucherId, applied: false, appliedAmount: 0, duplicate: false };
    }
    if (input.order.subtotal < voucher.minSpend) {
      return { voucherId: input.voucherId, applied: false, appliedAmount: 0, duplicate: false };
    }

    const usage = this.voucherUsage.get(voucher.id) ?? 0;
    if (usage >= voucher.maxUses) {
      return { voucherId: input.voucherId, applied: false, appliedAmount: 0, duplicate: true };
    }

    const amount = voucher.type === "fixed" ? voucher.value : input.order.subtotal * (voucher.value / 100);
    this.voucherUsage.set(voucher.id, usage + 1);
    return { voucherId: input.voucherId, applied: true, appliedAmount: amount, duplicate: false };
  }

  public getAnalytics(organizationId: string, outletId: string): { topReward: string[]; issued: number; redeemed: number } {
    const rewardIds = Array.from(this.promotions.keys()).filter((id) => this.promotions.get(id)?.organizationId === organizationId && this.promotions.get(id)?.outletId === outletId);
    const issued = rewardIds.length;
    const redeemed = Array.from(this.analytics.entries()).filter(([key]) => key.startsWith("promo:")).length;
    return {
      topReward: rewardIds.slice(0, 1),
      issued,
      redeemed,
    };
  }
}
