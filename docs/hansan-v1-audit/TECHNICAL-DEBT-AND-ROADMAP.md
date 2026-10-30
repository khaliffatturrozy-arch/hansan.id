# HANSAN V1 — TECHNICAL DEBT & ROADMAP

**Audit date:** 2026-10-30

## 1. Technical Debt

- In-memory simulated modules (8) present false confidence via passing tests; no Prisma integration.
- Divergent status vocabularies: Prisma OrderStatus vs transaction-core REFUND_PENDING/REFUNDED.
- Free-form status strings (Staff, DeveloperAccess) instead of enums.
- Legacy /api/auth/bootstrap dead route.
- Finance page UI shell only.
- No rate limiting on provisioning.
- No structured logging/monitoring.
- No E2E/integration test execution.
- Offline POS (core requirement) entirely absent.

## 2. Architectural Weaknesses

- Two disjoint worlds (real vs simulated) with no integration boundary enforced.
- No payment gateway abstraction (manual verification only).
- Beverage station unspecified.
- Cross-module integration is in-memory, not event-driven.

## 3. Recommended Improvements (prioritized)

1. Grant `orders.complete` to an authorized role (OWNER/MANAGER) to unblock order lifecycle.
2. Implement offline POS capture + reconciliation (idempotency keys already exist).
3. Wire simulated modules (loyalty, promotions, reservations, shifts) to Prisma + API.
4. Execute authenticated E2E harness (_e2e.cjs) against live server.
5. Add integration tests against real DB.
6. Add rate limiting to provisioning endpoints.
7. Remove or repurpose /api/auth/bootstrap.
8. Add structured logging and error tracking.
9. Convert free-form status strings to enums or validated values.
10. Run npm audit; remediate CVEs.
11. Add CI/CD pipeline.
12. Implement payment gateway adapter (future).

## 4. Prioritized Roadmap

Phase A (immediate): unblock order completion; E2E verification; rate limiting.  
Phase B (short-term): offline POS; wire simulated modules; integration tests.  
Phase C (medium-term): finance/reporting; payment gateway; monitoring/CI/CD.  
Phase D (long-term): multi-outlet rollout; beverage station; advanced hospitality.

## 5. What to Preserve

- Tenant isolation two-layer design.
- Immutable inventory ledger with CHECK constraints.
- Idempotent order creation per tenant.
- Canonical permission catalog with fail-closed grants.
- Anti-self-escalation policy.
- Developer/platform access isolation.
- Composite FK tenant scoping.

## 6. What to Redesign

- Simulated module layer (replace in-memory with DB-backed services).
- Status vocabularies (unify).
- Offline POS (new capability).

## 7. What Not to Carry Forward

- In-memory simulation code as if functional.
- Dead bootstrap route (unless repurposed).
- Global unique constraints replaced by tenant-scoped (already done).
