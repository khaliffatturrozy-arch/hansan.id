Claude Sonnet 5 — Handoff Summary for Phase 1

Approved Phase 1 scope
- Persisted Cashier POS vertical slice: `POST /api/orders`, `GET /api/menu`.

Explicit out-of-scope items
- Multi-tenant schema migration
- Offline sync engine
- Payment gateway integration beyond cash (QRIS/CARD deferred)

Files/modules likely to be modified
- `src/modules/pos/*` — connect UI to APIs
- `src/lib/prisma.ts` — used server-side (no client exposure)
- Add `app/api/orders/route.ts` and `app/api/menu/route.ts`

Files/modules requiring caution (do not refactor without approval)
- `prisma/schema.prisma` — preserve field shapes for `unitPrice` and `subtotal` to keep historical fidelity
- `src/context/CartContext.tsx` — used by UI; keep public API stable

Existing contracts to preserve
- Currency is integer IDR; front-end `formatRupiah` expects integer amounts.
- `OrderItem.unitPrice` is a snapshot and must not be recomputed from current `MenuItem.price` when generating historic orders.

Database constraints
- `MenuItem.slug` unique, `Order.orderNumber` unique, indexed fields on `Order.status` and `createdAt`.

Acceptance criteria (detailed)
- UI checkout triggers `POST /api/orders` and returns 201 with created `order.id` and `order.orderNumber`.
- Order totals stored match client-calculated totals (server must validate and correct rounding—use integer arithmetic only).
- Server rejects unauthenticated requests (401) and unauthorized roles (403).

Testing requirements
- Unit tests for API validation logic (order shape, totals, idempotency).
- Integration test: end-to-end order creation against a test database or an in-memory sqlite instance if supported.

Unresolved questions for product owner
- Which auth provider is canonical (Supabase Auth expected)?
- Is `outletId` required in Phase 1 (per-deployment single outlet vs multi-outlet)?
- Payment acceptance: is QRIS/CARD required in Phase 1 or can it be postponed?

Rollback & regression considerations
- Add feature branch and PR checks; do not merge without CI green and DB migration plan for any schema change.
- Keep `prisma/seed.ts` unchanged except for test-only fixtures.
