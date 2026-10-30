# HANSAN V1 — DATABASE & API

**Audit date:** 2026-10-30

## 1. Database Engine

PostgreSQL via Supabase, accessed through Prisma (`prisma/schema.prisma`). Provider `postgresql`, `url = env("DATABASE_URL")`, `directUrl = env("DIRECT_URL")`. Schema validates (`prisma validate`, exit 0). Migration status in this environment failed (P1001 network); earlier audit recorded 9 migrations, schema up to date.

## 2. Models (17)

Organization, Outlet, Staff, Permission, Role, RolePermission, StaffRole, Category, MenuItem, Order, OrderItem, Refund, Ingredient, Recipe, RecipeItem, InventoryStock, InventoryMovement, DeveloperAccess.

## 3. Enums

OrderStatus (PENDING, PROCESSING, READY, COMPLETED, CANCELLED); PaymentMethod (CASH, QRIS, CARD); OrderType (DINE_IN, TAKEAWAY); InventoryUnit (G, KG, ML, L, PCS, PACK, BOTTLE); InventoryMovementType (STOCK_IN, ADJUSTMENT_IN, ADJUSTMENT_OUT, WASTE, SALE_OUT, REFUND_IN); DiscountType (PERCENT, FIXED); PaymentStatus (PENDING, AUTHORIZED, PAID, FAILED, REFUNDED); RefundStatus (PENDING, APPROVED, REJECTED).

## 4. Key Relations / Constraints

- Tenant isolation: Organization → Outlet → Staff/Order/Inventory*. Composite FKs pin children to (id, organizationId).
- Order requires organizationId, outletId, staffId (all mandatory, Restrict on delete).
- Order idempotency: @@unique([organizationId, idempotencyKey]).
- Category/MenuItem/Ingredient tenant-scoped uniqueness: @@unique([organizationId, slug/code]).
- Recipe: one per (organizationId, menuItemId); RecipeItem composite PK (recipeId, ingredientId).
- InventoryStock: one per (organizationId, outletId, ingredientId).
- InventoryMovement: immutable ledger, CHECK quantity > 0, balanceAfter >= 0.
- Refund: one PENDING per order enforced in service (not DB partial unique).
- DeveloperAccess: tenant-independent, no FKs to tenant tables.

## 5. Index Plan (highlights)

Order: @@index([organizationId, outletId, createdAt]), @@index([organizationId, status]), @@index([outletId]), @@index([createdAt]), @@index([status]), @@index([staffId]). InventoryMovement: @@index([organizationId, outletId, ingredientId, createdAt]), @@index([organizationId, ingredientId, createdAt]), @@index([organizationId, createdAt]), @@index([staffId]). InventoryStock: @@unique([organizationId, outletId, ingredientId]), @@index([organizationId, ingredientId]).

## 6. Seed Data

Permission catalog: 76 Permission rows (verified DB had 76 Permission rows only; business data empty). Role templates seeded per organization. No dummy production data.

## 7. Data Integrity Notes

- Quantities stored as integer thousandths of base unit (no floating point).
- Prices in IDR integers.
- CHECK constraints back positivity/non-negativity.
- Staff/DeveloperAccess status are free-form String (not enum).

## 8. API Endpoints (23 routes)

Auth: /api/auth/bootstrap, /api/auth/destination, /api/auth/developer-provision, /api/auth/provision. Categories: /api/categories, /api/categories/[id]. Ingredients: /api/ingredients, /api/ingredients/[id]. Inventory: /api/inventory, /api/inventory/movements. KDS: /api/kds/queue. Menu: /api/menu, /api/menu/[id]. Orders: /api/orders, /api/orders/[id], /api/orders/[id]/refund. Recipes: /api/recipes, /api/recipes/[menuItemId]. Roles: /api/roles, /api/roles/[id], /api/roles/[id]/permissions. Session: /api/session. Staff: /api/staff. Developer: /api/developer/access.

## 9. API Authorization

Every route enforces auth server-side via requireProtectedRequest() (tenant) or requirePlatformAccess() (platform). Client-supplied organizationId/outletId/role/permissions are discarded; resolved from authenticated session. Input validated at boundaries. Errors returned as meaningful HTTP statuses; no internal stack traces.

## 10. Integration Status

- Real DB-backed: auth, RBAC, orders, KDS, catalog, ingredients, inventory, recipes, refunds, staff, roles, developer access.
- Simulated (no Prisma): loyalty, experience, promotions, shifts, reservations, KDS-inventory bridge, cross-module, legacy transaction core.
- No payment gateway integration.

## 11. Data Flow

See TECHNICAL-ARCHITECTURE.md §11 (POS checkout). Inventory deduction occurs on order completion (SALE_OUT movements); refund reversal posts REFUND_IN movements in the same transaction as the approval decision.
