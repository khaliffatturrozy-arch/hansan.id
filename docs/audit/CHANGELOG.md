## 2026-09-25

### Added

- Order API idempotency support and safer persistence handling.
- Prisma migration scaffold for order idempotency and model integrity checks.
- Audit tracking for transaction-hardening status.

### Changed

- POS checkout now submits an idempotency key and prevents duplicate in-flight submissions.
- Order creation now resolves menu prices server-side and snapshots them into `OrderItem.unitPrice`.
- Prisma order write path now runs as a single transaction with stock reduction and item creation.

### Fixed

- False-success order responses by returning proper HTTP statuses for validation and persistence failures.
- Client-total trust issue by computing authoritative totals from the database.

### Validation

- `npx prisma validate`: PASS
- `npm run lint`: PASS
- `npm run build`: PASS
- `npx prisma migrate status`: BLOCKED due missing reachable PostgreSQL credentials
