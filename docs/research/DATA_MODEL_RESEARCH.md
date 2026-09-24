# DATA MODEL RESEARCH — HANSAN POS

## 1. Prisma Schema Analysis (`prisma/schema.prisma`)

The database schema is fully defined in Prisma for the core POS workflow:
- **Enums:** `OrderStatus`, `PaymentMethod`, `OrderType`.
- **Models:** `Category`, `MenuItem`, `Order`, `OrderItem`.
- **Relations:**
  - `Category` (1) ──< `MenuItem` (Many) [onDelete: Restrict]
  - `Order` (1) ──< `OrderItem` (Many) [onDelete: Cascade]
  - `MenuItem` (1) ──< `OrderItem` (Many) [onDelete: Restrict]

## 2. Indexes & Constraints
- `MenuItem` has index on `categoryId`.
- `Order` has index on `status` and `createdAt`, with unique constraint on `orderNumber`.
- `OrderItem` has index on `orderId`.

## 3. Data Integrity Considerations
- Prices stored as IDR integers (no floating-point rounding errors).
- Price snapshot (`OrderItem.unitPrice`) ensures historical order immutability.
- Strict referential integrity (`Restrict` on delete for categories and menu items referenced by orders).
