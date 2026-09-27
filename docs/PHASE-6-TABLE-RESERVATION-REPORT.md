# HANSAN Phase 6 — Table + Reservation Domain

Status: Implemented in-memory and database-hold safe.

## Scope
This module introduces the operational table and reservation logic without connecting to Prisma or Supabase. It preserves the repository’s current architecture and intentionally avoids database initialization or external API integration.

## Included domain behaviors
- floor and zone registry
- table creation, feature validation, and status transitions
- reservation-window validation and overlap detection
- availability lookup by outlet, floor, zone, guest count, and required features
- reservation lifecycle transitions: PENDING → CONFIRMED → SEATED → COMPLETED
- conflict prevention for overlapping bookings
- server-authoritative validation consistent with the existing HANSAN transactional conventions

## Files
- src/lib/table-reservation.ts
- src/lib/table-reservation.test.ts

## Constraints respected
- database remains on hold
- no live persistence layer was added
- no app redesign or external service abstraction was introduced
- no phase-6 integration was forced into the UI or Prisma schema

## Validation
The new domain was validated through a dedicated Node test suite covering availability, overlap, lifecycle, feature checks, and invalid window handling.
