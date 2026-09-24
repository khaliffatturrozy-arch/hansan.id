PHASE 0 — Risks and Blockers

Critical risks (P0)
- Secrets in repo root `.env` file: contains `DATABASE_URL`, `DIRECT_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. If these are real credentials, rotate immediately and move secrets to a secure store.
- No server API endpoints or auth: frontend currently uses mock data; without server endpoints, persisting production orders is not possible.

Security risks (P0/P1)
- Absence of RLS policies and auth integration: potential data exposure if direct DB access or public keys are misconfigured.
- Direct DB connection strings in `.env` used by Prisma — ensure these are not committed and are managed via secrets in CI.

Data integrity risks (P1)
- No explicit audit fields for multi-tenant ownership (tenant/outlet IDs). Adding later requires migration and reconciliation.

Offline & sync risks (P1)
- No offline-first design: cart is volatile (context/in-memory). Risk of lost transactions on terminal failure.

Dependency or environment blockers (P2)
- Build and CI validation require installing dependencies (`npm ci`). I did not run install to avoid altering the environment.

Mitigations and recommendations
- Remove or rotate secrets committed to `.env`; use CI secrets and `.env.example` only.
- Implement a minimal authenticated API route for `POST /api/orders` that writes to Prisma and validates input server-side. Use service account server-side credentials, never the client.
- Add `outletId`/`tenantId` to `Order` (and optionally `MenuItem`) as a planned migration with a migration script and backfill strategy.
- For Phase 1 PoC: prefer `server-side order API + server-generated orderNumber + idempotency token` over direct client DB writes.
