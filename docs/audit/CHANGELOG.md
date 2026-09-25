## 2026-09-25

### Added

- Idempotent order creation path and server-side validation for the POS transaction flow.
- Prisma migration scaffold for order persistence hardening.
- Audit updates documenting database and authorization blockers.

### Changed

- Order creation now resolves authoritative menu prices from the database and stores them as `OrderItem.unitPrice` snapshots.
- Transaction writes are kept atomic without assigning direct inventory mutation to the order service.
- API responses now emit correct failure status codes for validation and persistence errors.

### Fixed

- Duplicate request risk through idempotency key handling.
- Client-calculated total trust issue by deriving totals from the database.

### Validation

- `npx prisma validate`: PASS
- `npm run lint`: PASS
- `npm run build`: PASS
- `npx prisma migrate status`: BLOCKED because the environment does not have a reachable PostgreSQL connection or valid DATABASE_URL

### Blockers

- No real auth/session infrastructure currently exists in the repo.
- No outlet/tenant domain model exists yet.
- Live database verification remains blocked until credentials are available and the target database is reachable.
