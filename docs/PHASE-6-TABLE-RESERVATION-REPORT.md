# HANSAN Phase 6 — Table + Reservation Domain Report

Status: Complete, in-memory, and database-hold safe.

## Objective
Create a deterministic, secure, auditable, and extensible table and reservation domain without violating the repo’s active database hold. The implementation remains server-authoritative and repository-style, while preserving the earlier architecture and avoiding any Prisma or Supabase connection.

## Scope and architecture
This phase adds domain services for:
- floors and zones
- table registration, capacity validation, and status transitions
- reservation creation and hold management
- availability checks and combination searches for group bookings
- turnover buffer logic and overlap prevention
- audit event capture and immutable historical snapshots
- table sessions and occupancy lifecycle tracking

The implementation is contained in the in-memory domain service at [src/lib/table-reservation.ts](../src/lib/table-reservation.ts) and is exercised by [src/lib/table-reservation.test.ts](../src/lib/table-reservation.test.ts).

## Security and integrity guarantees
The domain honors the same authoritative model already used in earlier phases:
- tenant, outlet, and organization context are validated before table or reservation actions are processed
- reservation creation rejects invalid capacity, illegal dates, unavailable table assignments, and cross-outlet access
- active holds block stale re-use and double booking attempts
- overlap detection treats intervals explicitly and prevents invalid booking windows
- historical reservation snapshots remain immutable and cannot be mutated through later state transitions
- audit events are captured for table lifecycle and reservation actions

## Reservation state model
The service explicitly enforces a safe state progression for reservation lifecycle events:
- PENDING
- CONFIRMED
- ARRIVED
- SEATED
- COMPLETED
- CANCELLED
- NO_SHOW

Transitions are gated to enforce safe progression and prevent invalid jumps between states.

## Availability and capacity rules
The availability engine validates:
- outlet and tenant alignment
- fixture and feature requirements
- guest-count compatibility with table capacity
- turnover buffer windows between consecutive reservations
- hold protection windows and constraint checks against active reservations
- combined table searches for multi-table group reservations

## Operational constraints respected
This release preserves the project’s frozen operational posture:
- database remains on hold
- no Prisma schema changes were introduced
- no Supabase integration or live persistence layer was added
- no redesign of the pre-existing transaction, KDS, or payment architecture was performed
- all Phase 6 work remains service-layer and test-backed only

## Validation evidence
The Phase 6 domain was verified through the full project regression matrix, including the reservation-specific suite and the prior security/transaction/KDS/payment tests. The results were:
- all targeted reservation tests: pass
- all existing domain tests: pass
- production build: pass

## Acceptance status
Phase 6 Final Audit: PASS.
Phase 6 is accepted as a hardened in-memory domain foundation for future database-backed implementation, with the database-hold policy preserved and the architecture left intentionally stable.
