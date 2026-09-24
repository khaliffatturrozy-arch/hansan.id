Phase 1 Scope Recommendation

Approved Phase 1 scope (minimal vertical slice for Cashier POS)
1. Implement authenticated server API endpoints:
   - `POST /api/orders` — create order with idempotency token and server-side orderNumber generation.
   - `GET /api/menu` — return menu items from Prisma.
2. Wire frontend POS `PosCashierView` to server APIs for menu and order persistence.
3. Secrets hygiene: remove `.env` from repo and move to CI secret manager. Ensure `.env.example` is accurate.
4. Add basic RBAC: `cashier` role enforced server-side; simple role check via Supabase claims.
5. Add tests for order creation (integration test hitting API with in-memory or test DB).

Out-of-scope for Phase 1
- Full multi-tenant migration and schema redesign.
- Offline-first persistence or full sync engine.
- Payment gateway integration (only stubbed/cash flow allowed for Phase 1 PoC).

Acceptance criteria (high level)
- Orders created via UI are persisted in DB and visible via `prisma studio` or `GET /api/orders`.
- Server API rejects unauthenticated requests.
- No secrets are stored in the repo; CI can run seed and tests using injected secrets.
