PHASE 0 — Architecture Assessment

Current architecture (verified)
- Monorepo-style single Next.js application using the `app` router (server and client components).
- Frontend modules organized under `src/modules/*` for vertical features (pos, kds, inventory, dashboard).
- Client-side shared utilities in `src/lib`, a client Supabase initializer, and a Prisma client intended for server use.

Module boundaries
- UI / POS: `src/modules/pos` (views + components + types)
- Data / infra: `src/lib/prisma.ts`, `src/lib/supabase.ts`
- App shell: `src/app/layout.tsx` + global CSS and fonts

Domain & data flow observations
- The canonical data model exists in Prisma (`Category`, `MenuItem`, `Order`, `OrderItem`).
- Current runtime: frontend uses mock data (`MOCK_MENU_ITEMS`) and client state (in-memory or context) to simulate orders.
- Missing: server API layer to persist orders (no `app/api` or `pages/api` endpoints discovered).

Multi-tenant readiness
- Not currently implemented: Prisma models do not contain `tenantId` or `outletId` fields. Seed and models assume single-tenant outlet.
- Supabase client is present but no RLS policies or tenant-scoped queries are included in repo.

Offline POS readiness
- Not implemented: cart state is in-memory or React context; no local persistence, background sync, or conflict-resolution logic exists.

Cashier POS readiness (gap analysis)
- What exists:
  - UI components for a cashier terminal, cart operations, checkout modal, and receipt modal.
  - DB models and seed script to support orders and line-items.
- Missing to reach Phase 1 vertical slice:
  - Server API endpoints for creating orders and querying menu items
  - Authentication/authorization and user roles
  - Tenant/outlet scoping in runtime and persistence
  - Payment integration (EDC / QRIS) or payment processing stubs
  - Offline sync and durable local storage (optional but recommended)

Architectural risks
- Lack of server API layer and absent auth leaves unsafe client-to-db patterns if not gated.
- No tenant/outlet scoping in models — migrating to multi-tenant later will require schema changes and data-migration planning.

Recommended (non-invasive) changes
- Add a thin API layer (Next.js route handlers under `app/api`) that uses `prisma` for order CRUD and validates inputs server-side.
- Introduce `outletId` metadata fields in a backward-compatible way if multi-tenant is a target (plan migration)
- Implement RLS and Supabase project config outside the repo; keep secrets out of source and use environment management in CI.
