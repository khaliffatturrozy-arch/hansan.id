# HANSAN V1 — FEATURE INVENTORY

**Audit date:** 2026-10-30

## 1. Core Platform / Auth

| Feature | Location | Status |
|---|---|---|
| Supabase auth (JWT) | src/lib/auth.ts, middleware.ts | IMPLEMENTED |
| Tenant staff context resolution | src/lib/auth.ts | IMPLEMENTED |
| Developer/platform access | src/lib/developer-access.ts, DeveloperAccess model | IMPLEMENTED |
| Provisioning (owner) | src/app/api/auth/provision/route.ts | IMPLEMENTED |
| Developer provisioning | src/app/api/auth/developer-provision/route.ts | IMPLEMENTED |
| Bootstrap (legacy) | src/app/api/auth/bootstrap/route.ts | PARTIALLY IMPLEMENTED (effectively dead) |
| Auth destination routing | src/app/api/auth/destination/route.ts | IMPLEMENTED |
| RBAC permission catalog | src/lib/permissions.ts | IMPLEMENTED |
| Role management | src/lib/role-management.ts | IMPLEMENTED |
| Staff management | src/lib/staff-*, src/app/owner/staff | IMPLEMENTED |
| Role-permission grants | src/lib/role-permission-grants.ts | IMPLEMENTED |

## 2. POS / Orders

| Feature | Location | Status |
|---|---|---|
| POS cashier UI | src/modules/pos/views/PosCashierView.tsx | IMPLEMENTED |
| Order creation (idempotent, tenant-scoped) | src/lib/order-service.ts | IMPLEMENTED |
| Order lifecycle | src/lib/order-lifecycle.ts, order-status-service.ts | PARTIALLY IMPLEMENTED (dead-ends at READY) |
| KDS queue | src/app/kds, src/app/api/kds/queue | IMPLEMENTED |
| Order detail / refund request | src/app/api/orders/[id] | IMPLEMENTED |
| Refunds (approval workflow) | src/lib/refund-service.ts | IMPLEMENTED |
| Payment settlement (cash/QRIS/card) | Order.paymentStatus | PARTIALLY IMPLEMENTED (manual; no gateway) |
| Discount (percent/fixed) | Order.discount* | IMPLEMENTED |
| Tax PB1 10% | order-service | IMPLEMENTED |

## 3. Catalog

| Feature | Location | Status |
|---|---|---|
| Categories (tenant-scoped) | src/lib/category-service.ts | IMPLEMENTED |
| Menu items | src/lib/menu-service.ts | IMPLEMENTED |
| Catalog management UI | src/app/owner/catalog | IMPLEMENTED |

## 4. Inventory / Recipes

| Feature | Location | Status |
|---|---|---|
| Ingredients (tenant-scoped) | src/lib/inventory-service.ts | IMPLEMENTED |
| Recipes (per menu item) | src/app/api/recipes, src/app/owner/recipes | IMPLEMENTED |
| Inventory stock (per outlet) | InventoryStock model | IMPLEMENTED |
| Immutable stock ledger | InventoryMovement model | IMPLEMENTED |
| Recipe-based deduction on complete | src/lib/order-inventory.ts | IMPLEMENTED |
| Refund stock reversal | src/lib/refund-service.ts | IMPLEMENTED |
| Inventory management UI | src/app/owner/inventory | IMPLEMENTED |

## 5. Offline POS

| Feature | Location | Status |
|---|---|---|
| Service worker registration | public/sw.js, ServiceWorkerRegister.tsx | UI ONLY / partial |
| Offline queue lib | src/lib/offline-queue.ts | PLANNED (not wired) |
| Offline POS (core requirement) | — | NOT IMPLEMENTED |

## 6. Hospitality / Second Tier (in-memory simulations)

| Feature | Location | Status |
|---|---|---|
| Customer loyalty | src/lib/customer-loyalty.ts | UI ONLY (in-memory, no Prisma) |
| Customer experience | src/lib/customer-experience.ts | UI ONLY (in-memory) |
| Promotion engine | src/lib/promotion-engine.ts | UI ONLY (in-memory) |
| Staff operations/shifts | src/lib/staff-operations.ts | UI ONLY (in-memory) |
| Table reservation | src/lib/table-reservation.ts | UI ONLY (in-memory) |
| Beverage station | (none dedicated) | PLANNED/UNKNOWN |
| KDS-inventory bridge | src/lib/kds-inventory.ts | UI ONLY (in-memory) |
| Cross-module integration | src/lib/cross-module-integration.ts | UI ONLY (in-memory) |
| Legacy transaction core | src/lib/transaction-core.ts | PARTIALLY IMPLEMENTED (divergent status vocab) |

## 7. Finance / Reporting

| Feature | Location | Status |
|---|---|---|
| Owner dashboard | src/app/owner/OwnerDashboard.tsx | IMPLEMENTED (partial data) |
| Finance page | src/app/owner/finance/page.tsx (173 B) | UI ONLY (shell) |

## 8. Developer / Platform

| Feature | Location | Status |
|---|---|---|
| Developer page | src/app/developer/page.tsx | IMPLEMENTED (partial) |
| Developer access API | src/app/api/developer/access/route.ts | IMPLEMENTED |

## 9. Summary Counts

- IMPLEMENTED: ~25 (core auth, RBAC, POS, orders, KDS, catalog, inventory, recipes, refunds, staff/roles).
- PARTIALLY IMPLEMENTED: ~4 (order lifecycle completion, payment settlement, bootstrap, legacy transaction core).
- UI ONLY: ~9 (loyalty, experience, promotions, shifts, reservations, beverage, KDS-inventory bridge, cross-module, finance).
- NOT IMPLEMENTED: offline POS (core requirement).
- PLANNED/UNKNOWN: beverage station.
- DEPRECATED: none identified.
