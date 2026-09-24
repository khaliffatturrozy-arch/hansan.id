# DOMAIN MODEL RESEARCH — HANSAN POS

## 1. Core Domain Entities

### Category
- **Purpose:** Groups menu items into logical F&B classifications (Coffee, Non-Coffee, Main Course, Snack, Pastry).
- **Properties:** ID, Name, Slug, Display Order, Active Status.

### MenuItem (Product)
- **Purpose:** Represents sellable items in the F&B catalog.
- **Properties:** ID, Name, Description, Price (IDR integer), Image URL, Availability, Stock Count, Badge, Category ID.

### Order
- **Purpose:** Represents a customer transaction header.
- **Properties:** Order ID, Order Number, Order Type (`DINE_IN`, `TAKEAWAY`), Table Number, Customer Name, Cashier Name, Subtotal, Tax (PB1 10%), Total Amount, Status (`PENDING`, `PROCESSING`, `READY`, `COMPLETED`, `CANCELLED`), Payment Method (`CASH`, `QRIS`, `CARD`), Amount Paid, Change, Bank Name, Approval Code, Notes, Timestamps.

### OrderItem
- **Purpose:** Line items belonging to an Order.
- **Properties:** ID, Order ID, MenuItem ID, Quantity, Unit Price (price snapshot at transaction time), Subtotal, Notes.

## 2. Future Domain Entities (Deferred)
- Branch / Outlet
- User & Role (RBAC)
- Payment (Standalone entity)
- KitchenTicket (KDS routing)
- InventoryItem & Recipe (Stock deduction)
- Customer & Membership (Loyalty)
- AuditLog
