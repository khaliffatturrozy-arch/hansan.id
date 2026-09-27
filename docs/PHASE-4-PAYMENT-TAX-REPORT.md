# HANSAN — Phase 4 Payment + Tax Domain Report

## 1. PHASE_STATUS

PHASE_STATUS = COMPLETE
DATABASE_STATUS = HOLD

## 2. Phase 3 finalization status

Phase 3 was finalized as complete in mock mode and retained under database hold.

Validated items:
- KDS routing and lifecycle
- recipe consumption and stock movement
- stock validation and insufficient-stock rejection
- production capacity and cross-outlet guardrails
- KDS/inventory regression suite: 8/8 passing
- transaction-core regression suite: 8/8 passing
- security regression suite: 7/7 passing
- repository lint and build validation: PASS

No live PostgreSQL/Supabase connection was introduced. No migration history was changed.

## 3. Payment architecture

The payment domain follows the contracted application layer:

ORDER → TAX ENGINE → FINAL TOTAL → PAYMENT SERVICE → PAYMENT ADAPTER → MOCK PROVIDER → PAYMENT RESULT → AUDIT

The implementation keeps the abstraction layer explicit:
- `PaymentService` owns the business rules and lifecycle enforcement.
- `PaymentAdapter` isolates provider interaction behind a replacable adapter boundary.
- `MockPaymentProvider` is local-only and is never treated as production infrastructure.

Supported methods:
- CASH
- QRIS
- EDC

Validated lifecycle:
- INITIATED
- PENDING
- PROCESSING
- SUCCESS
- FAILED
- EXPIRED
- CANCELLED
- UNKNOWN

## 4. Tax architecture

The tax engine follows the existing HANSAN contract and remains configurable rather than hardcoded:

- `PERCENTAGE` and `FIXED_AMOUNT`
- `SUBTOTAL`, `AFTER_DISCOUNT`, `AFTER_SERVICE_CHARGE`, and `AFTER_DISCOUNT_AND_SERVICE`
- deterministic rule ordering via priority
- inclusive and exclusive tax support where the contract already permits it
- no hardcoded PPN or Indonesian tax percentage

The implementation intentionally does not invent a new tax architecture or silently overwrite multiple rules.

## 5. Payment lifecycle

Payment state transitions are restricted to valid paths only.

Allowed examples:
- INITIATED → PENDING
- PENDING → PROCESSING
- PROCESSING → SUCCESS
- PROCESSING → FAILED
- PROCESSING → UNKNOWN
- PENDING → EXPIRED
- INITIATED → CANCELLED

Invalid transitions are rejected, including:
- SUCCESS → PROCESSING
- SUCCESS → FAILED
- SUCCESS → INITIATED

`UNKNOWN` is preserved as a real terminal state rather than being auto-converted to `FAILED`.

## 6. Tax calculation flow

The canonical calculation order is preserved:

ITEM PRICE → MODIFIER → DISCOUNT → SERVICE CHARGE → TAX ENGINE → FINAL TOTAL → PAYMENT

The tax engine uses the correct taxable base for each rule and snapshots the applied tax data at calculation time.

## 7. Order → Tax → Payment integration

The integration path is documented as:

Order draft → order subtotal and service logic → final total → payment creation → payment success → order/payment audit metadata

The server-side amount is authoritative. Client-supplied payment amounts are not trusted when the application can compute the final order total.

## 8. Mock provider behavior

The mock payment provider intentionally represents local, non-production flow only.

- QRIS flow: INITIATED → QR_GENERATED → WAITING_PAYMENT → PAID / EXPIRED
- EDC flow: INITIATED → SENT_TO_TERMINAL → PROCESSING → APPROVED / DECLINED

The provider metadata is mapped safely into the core lifecycle without storing card credentials or sensitive payment data.

## 9. Idempotency

Payment creation uses deterministic idempotency keys and a registry to prevent duplicate payment transactions.

Repeated requests with the same key return the original payment rather than creating a second one. This preserves a future-compatible path for database uniqueness constraints.

## 10. Security validation

Server-authoritative identity and outlet boundaries are preserved.

The payment and tax domain respects:
- organization isolation
- outlet isolation
- server-side staff context
- permission-aware access assumptions
- existing auth guard semantics

Client-provided organizationId, outletId, staffId, role, or permission payloads are not trusted.

## 11. Tests

Validated tests:
- payment creation and idempotency
- CASH success and insufficient-cash rejection
- Qris mock success and expiration
- EDC mock success and decline
- UNKNOWN-state handling
- status inquiry and outlet isolation
- percentage, fixed, inclusive, and exclusive tax modes
- base selection for subtotal / discount / service charge / combined base
- multiple tax rule priority ordering and snapshot capture
- order → tax → payment → payment success integration

Executed verification:
- `npx ts-node --compiler-options '{"module":"CommonJS"}' src/lib/payment-tax.test.ts`
- `npx ts-node --compiler-options '{"module":"CommonJS"}' src/lib/kds-inventory.test.ts`
- `npx ts-node --compiler-options '{"module":"CommonJS"}' src/lib/transaction-core.test.ts`
- `npx ts-node --compiler-options '{"module":"CommonJS"}' src/lib/auth-security.test.ts`
- `npm run lint`
- `npm run build`
- `git diff --check`

## 12. Files changed

Core implementation:
- `src/lib/transaction-core.ts`

Regression coverage:
- `src/lib/payment-tax.test.ts`

Phase reports:
- `docs/PHASE-3-KDS-INVENTORY-REPORT.md`
- `docs/PHASE-4-PAYMENT-TAX-REPORT.md`

## 13. Database-deferred items

Database-dependent work remains intentionally deferred under the active hold and is not treated as acceptance criteria for this phase:
- Prisma validation against live PostgreSQL/Supabase
- migration deployment
- persisted payment ledger
- persisted tax history
- persisted audit sink implementation

## 14. External dependencies

No production external provider dependency was introduced.

The payment architecture remains intentionally mock-safe and replaceable. QRIS and EDC remain local-domain abstractions for future provider integration, not real payments or hardware.

## 15. Limitations

- Database persistence remains intentionally deferred.
- No real payment gateway integration is active.
- No real QRIS or EDC credentials are used.
- Audit events remain repository-friendly and mock-safe.
- Future compound-tax rules can be layered in once a fuller accounting policy is defined.

## 16. NEXT_RECOMMENDED_PHASE

NEXT_RECOMMENDED_PHASE = PHASE_5_ORDER_LIFECYCLE_COMPLETION_AND_AUDIT_FINALIZATION
