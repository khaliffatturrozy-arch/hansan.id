# TRANSACTION MODEL — HANSAN POS

## 1. Order Lifecycle State Machine

```text
PENDING (Draft / Submitted)
   ↓
PROCESSING (Sent to Kitchen / KDS)
   ↓
READY (Prepared & Awaiting Pickup / Service)
   ↓
COMPLETED (Paid & Delivered)
   OR
CANCELLED (Voided before completion)
```

## 2. Payment Separation
- Payment state is currently coupled with `Order.paymentMethod`, `Order.amountPaid`, and `Order.changeAmount`.
- **Recommendation for Future Phase:** Decouple payment transactions into a separate `Payment` table linked to `Order` (1-to-many or 1-to-1) to support split bills, multi-tender payments, and refunds.

## 3. Transaction Integrity Rules
- Subtotal = Sum(Quantity * UnitPrice)
- Tax (PB1) = Round(Subtotal * 0.10)
- Grand Total = Subtotal + Tax
- Change Amount = Amount Paid - Grand Total (for Cash payments)
