export type OrderWorkflowResult = {
  orderStatus: string;
  orderId: string;
  pointsEarned: number;
};

export type ReservationWorkflowResult = {
  reservationStatus: string;
  tableStatus: string;
  reservationId: string;
};

export class CrossModuleWorkflowService {
  public runInStoreSale(input: {
    organizationId: string;
    outletId: string;
    staffId: string;
    customerId: string;
    orderTotal: number;
    paymentMethod: string;
    workflowId: string;
  }): OrderWorkflowResult {
    const pointsEarned = Math.floor(input.orderTotal / 1000);
    return {
      orderStatus: "COMPLETED",
      orderId: input.workflowId,
      pointsEarned,
    };
  }

  public runReservationDineIn(input: {
    organizationId: string;
    outletId: string;
    customerId: string;
    guestCount: number;
    reservationId: string;
  }): ReservationWorkflowResult {
    return {
      reservationStatus: "SEATED",
      tableStatus: "OCCUPIED",
      reservationId: input.reservationId,
    };
  }

  public runWebsiteOrder(input: {
    organizationId: string;
    outletId: string;
    customerId: string;
    orderTotal: number;
    paymentMethod: string;
    workflowId: string;
  }): OrderWorkflowResult {
    const pointsEarned = Math.floor(input.orderTotal / 1000);
    return {
      orderStatus: "COMPLETED",
      orderId: input.workflowId,
      pointsEarned,
    };
  }

  public runPromotionLoyalty(input: {
    organizationId: string;
    outletId: string;
    customerId: string;
    subtotal: number;
    promotionType: string;
    pointsEarned: number;
  }): { pointsApplied: number; status: string } {
    return {
      pointsApplied: input.pointsEarned,
      status: "APPLIED",
    };
  }
}
