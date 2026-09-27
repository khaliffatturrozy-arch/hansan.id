# HANSAN Phase 6 — Risk Register

Status: Active risk controls documented; database remains on hold; in-memory enforcement only.

## Risk overview
The table and reservation domain introduces availability, scheduling, and occupancy concerns that can cause operational faults if the rules are not enforced consistently. To keep the repo safe and deterministic while the database is on hold, the design implements strict validation and audit protections in memory only.

## Risk 1 — Double booking and overlapping reservation windows
- Risk: two reservations can claim the same table for overlapping time slots.
- Mitigation: the domain uses explicit interval comparison and turnover buffer checks before confirming or holding a table.
- Control status: enforced in the availability engine and reservation creation path.
- Residual risk: remains low for the in-memory domain; future DB-backed persistence must preserve the same invariant in the repository layer.

## Risk 2 — Stale or expired holds blocking legitimate reservations
- Risk: a hold that has expired or been invalidated can still block a valid booking.
- Mitigation: hold status checks, expiry validation, and active-only conflict checking prevent stale hold reuse.
- Control status: enforced in the hold lifecycle contract.
- Residual risk: low if future persistence retains the same status semantics.

## Risk 3 — Tenant, organization, or outlet boundary leaks
- Risk: cross-tenant or cross-outlet access allows booking manipulation across business contexts.
- Mitigation: every service operation validates the supplied tenant and outlet context against the authenticated server-authoritative identity.
- Control status: enforced before mutation is allowed.
- Residual risk: low in the current service layer; DB-backed implementation must keep the same server-side checks.

## Risk 4 — Historical snapshot mutation and audit integrity drift
- Risk: a past reservation record could be altered after the fact, creating false operational history.
- Mitigation: snapshot data is captured as immutable records and transitions are applied to a new version rather than mutating the same object in place.
- Control status: enforced in the snapshot and transition model.
- Residual risk: low with the current in-memory service; repository persistence must preserve snapshot immutability.

## Risk 5 — Time-zone and local-business-time misalignment
- Risk: bookings can be created under the wrong local time assumptions, causing false overlap or invalid windows.
- Mitigation: the domain uses explicit Date values and compares interval boundaries deterministically without introducing implicit timezone conversion logic.
- Control status: enforced through the validation and overlap helpers.
- Residual risk: moderate if future persistence uses a different time handling strategy; must be reviewed before database implementation.

## Risk 6 — Group reservation combination logic creating unsafe table packs
- Risk: multi-table reservations may select tables that are individually valid but collectively mis-sized or not combinable.
- Mitigation: combination checks ensure table compatibility, guest count sufficiency, and selected capacity alignment.
- Control status: enforced in the best-table and combination search flow.
- Residual risk: low within the current deterministic domain model.

## Risk 7 — Future database migration precision
- Risk: the in-memory model may not map cleanly to a real persistence schema without control drift.
- Mitigation: the current implementation intentionally avoids DB connection while preserving the domain rules that a future repository layer must honor.
- Control status: governance-safe due to active database hold.
- Residual risk: accepted until a later persistence phase is explicitly implemented with migration and repository validation.

## Risk acceptance statement
The current phase is considered appropriately hardened for the repository’s freeze condition. No persistence-level risk is being accepted beyond the existing database hold, and the service layer remains intentionally conservative and deterministic.
