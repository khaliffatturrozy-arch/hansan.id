# HANSAN Feature Complete Gate

> **STATUS: SUPERSEDED — THE PREVIOUS `FEATURE_COMPLETE = TRUE` CLAIM WAS INCORRECT.**
>
> This document previously asserted `FEATURE_COMPLETE = TRUE` and marked every
> domain `VERIFIED` on the basis of an **in-memory service layer** that is not
> connected to the database, the API layer, or the UI. That claim has been
> withdrawn during **Phase A — Truth Restoration**.
>
> A passing in-memory unit test is **not** evidence that a domain is
> implemented. Domains that were previously marked "verified" (inventory, KDS,
> recipes, tables/reservations, customers/loyalty, promotions, payments, staff
> operations) have no Prisma model, no API route, and no UI. The corrected status
> is recorded in `## Current verified status` below.

## Current verified status

Verified by direct repository inspection and fresh command execution.
Legend: **IMPLEMENTED** = reachable from a page/route and backed by real
persistence or real external auth · **PARTIAL** = real code exists but the
end-to-end path is incomplete or unreachable · **SIMULATED / IN-MEMORY** =
logic exists only as an unconnected in-memory class with unit tests ·
**NOT IMPLEMENTED** = no model, no route, no UI · **PLANNED** = documented
intent only.

| Domain | Current status | Evidence / limitation |
| --- | --- | --- |
| Identity & access foundation | IMPLEMENTED | `src/lib/auth.ts` (server-side Supabase JWT validation with service-role key, fails closed), `src/middleware.ts`, `/api/auth/provision`, `/api/auth/bootstrap`; role-aware login gateway: `src/lib/login-destination.ts` + `/api/auth/destination` + `/api/session` |
| Platform / tenant schema | PARTIAL | 13 Prisma models exist, including `DeveloperAccess`. `Category` and `MenuItem` are tenant-scoped (composite `(organizationId, id)` FK), `Order.organizationId/outletId/staffId` are NOT NULL, and the CHECK constraints Prisma cannot express are applied by migration `202609300001`. **No RLS policies exist** — tenant isolation is application-layer only |
| Order persistence service | IMPLEMENTED | `src/lib/order-service.ts` — atomic `prisma.$transaction`, server-side pricing, idempotency (a duplicate request is detected before any inventory consumption or order row is written) |
| Order API | IMPLEMENTED | `src/app/api/orders/route.ts` — permission-gated, tenant-scoped, identity taken only from the verified session; body parsed and validated by `src/lib/order-request.ts`; every failure exits through `toSafeApiError()` |
| POS cashier UI | PARTIAL | Catalog and session are loaded from `/api/menu` and `/api/session`; the hardcoded in-repo array (`src/data/products.ts`) is deleted. With an empty production database the screen renders an honest empty state until the operator enters a real catalog |
| POS → DB order path | IMPLEMENTED (runtime unverified) | The cashier submits only item ids and an idempotency key; organization/outlet/staff/cashier and every price are resolved server-side. Proven by unit tests and a clean production build — **no authenticated runtime smoke test has been executed yet** |
| Owner HQ | PARTIAL | `src/app/owner/page.tsx` reads real Prisma aggregates scoped by `organizationId`; domains with no model render as `unavailable` ("No X model exists yet") instead of a misleading 0 |
| Order lifecycle | PARTIAL | Initial state is `PENDING` (`src/lib/order-service.ts`, Phase C decision); KDS/fulfilment transitions, cancellation and refund flows do not exist yet |
| POS catalog + session API | IMPLEMENTED | `src/lib/menu-service.ts`, `/api/menu` (tenant-scoped catalog from the database), `/api/session` (cashier/outlet identity resolved server-side from the Supabase SSR session) |
| Staff management (tenant) | IMPLEMENTED (runtime unverified) | `/owner/staff`, `/api/staff`, `src/lib/staff-service.ts` — creates a real Supabase Auth identity through the Admin API without any HANSAN-generated password, proves role and outlet belong to the caller's organization, and toggles active/inactive. Not an HR system |
| KDS / beverage station | NOT IMPLEMENTED | `src/modules/kds/**` are placeholder `export {};` stubs |
| Inventory / stock ledger | NOT IMPLEMENTED | No models; `MenuItem.stockCount` is read but never decremented |
| Recipes / BOM | NOT IMPLEMENTED | No models |
| Purchasing / suppliers | NOT IMPLEMENTED | No models, no routes, no UI |
| Payment processing (QRIS / EDC) | NOT IMPLEMENTED | No payment ledger; provider integration absent; approval codes are client-supplied |
| Refunds | NOT IMPLEMENTED | No model, no route, no approval workflow |
| Tables / reservations | NOT IMPLEMENTED | No models; `src/modules/...` has no UI |
| Customers / loyalty / promotions | NOT IMPLEMENTED | No models |
| Finance / shift / cash drawer | NOT IMPLEMENTED | No models |
| Dashboard module | NOT IMPLEMENTED | `src/modules/dashboard/**` are placeholder stubs |
| Offline POS / sync | NOT IMPLEMENTED | No `public/`, no service worker, no manifest, no local queue |
| Platform / developer admin | PARTIAL | `DeveloperAccess` (keyed only on `authUserId`, no FK to any tenant table), `/api/auth/developer-provision` (gated by `HANSAN_DEVELOPER_PROVISION_SECRET`, constant-time compare), `/api/developer/access` PATCH suspend/reactivate (transactional state + audit, last-active-developer protection), read-only `/developer` page. The lifecycle API has **no UI caller yet** and there is no deprovisioning flow |
| Test suite | PARTIAL | 294 unit tests across 65 suites pass, and they now cover pricing, POS session contract, order request contract, safe API errors, developer access/lifecycle, login destination/gateway, staff provisioning and owner HQ. There is still **no** database integration test and **no** automated test that boots an API route or a page |
| Typecheck / lint / build | PASS | `npx tsc --noEmit`, `npx next lint`, `npx next build` |

### Simulated / in-memory only (NOT production capability)

The following modules contain substantial in-memory logic and passing unit
tests, but are imported by **no** application code. They are simulations, not
implemented features:

- `src/lib/transaction-core.ts` (order domain service, tax engine, payment service, mock payment adapters)
- `src/lib/kds-inventory.ts` (KDS routing, inventory service, recipe catalog, order inventory processor)
- `src/lib/table-reservation.ts`
- `src/lib/customer-loyalty.ts`
- `src/lib/promotion-engine.ts`
- `src/lib/staff-operations.ts`
- `src/lib/customer-experience.ts`
- `src/lib/cross-module-integration.ts`

`prisma/seed.ts` (which inserted demo categories, menu items, and a sample
order) was **removed** in Phase A.

## Gate outputs

```
FEATURE_COMPLETE = FALSE
PRODUCTION_READY = FALSE
DATABASE_SCHEMA = PRESENT (tenant scoping applied by 202609300001; no RLS policies)
DESTRUCTIVE_SEED = REMOVED
AUTHENTICATED_RUNTIME_VERIFICATION = NOT_PERFORMED (requires a real Supabase Auth identity)
```

## Historical note

The superseded claim was valid only under an earlier, explicitly
database-free posture in which the in-memory service layer was treated as the
source of truth. That posture is no longer the project's posture. HANSAN is now
a production-oriented system, and an in-memory simulation must not be presented
as a production capability.
