# HANSAN V1 — PROJECT HISTORY

**Audit date:** 2026-10-30

## 1. Development Timeline (from git log)

Commits (newest first), branch `phase14-manual`:

- 6e0a620 feat(staff): complete staff lifecycle foundation
- ed4d0d4 chore(repo): normalize trailing newlines at EOF
- bba15c0 docs: restore production readiness truth
- b358ec3 feat(owner): connect owner dashboard to tenant data
- 8613cbd feat(staff): establish tenant staff management
- 4865bd7 feat(auth): establish role-aware login gateway
- b84a955 feat(auth): establish developer access lifecycle
- 589ca72 feat(orders): establish authenticated transactional order flow
- 4bacdca feat(pos): connect cashier to authenticated tenant menu
- dcb7192 refactor(pos): remove dummy catalog and centralize pricing contracts
- 646f483 feat(api): establish shared error handling
- 368ea4d feat(db): establish tenant and developer access foundations
- 92dde29 test(auth): lock bearer token transport contract
- b0a11a8 chore(repo): establish production test workflow
- 9a4e412 feat(auth): add tenant role management foundation
- c63ac7d feat(permissions): canonical permission catalog, parity tests, fail-closed grants
- 501fc23 phase14: add HANSAN_PROVISION_SECRET gate to provision endpoint
- 735f61b docs: update phase 14 report with corrective verification
- cd1b370 phase14: corrective - provision flow, isPlatform flag, deterministic role resolution
- d959d7f docs: add phase 14 production auth platform report
- 9a0cd6b phase14: production auth and platform foundation
- 2b32b50 feat: add phase 13 auth identity foundation
- 71fd769 docs(db): checkpoint database gate
- 6786ebd audit: finalize feature-complete gate and domain coverage
- debff27 fix: align TS test runtime and module isolation

(Additional history exists before these; truncated to last 25 for brevity. Full history available via `git log`.)

## 2. Important Milestones

- Phase 13: auth identity foundation.
- Phase 14: production auth and platform foundation; provision secret gate; corrective role resolution.
- Phase 15+: role management, tenant staff management, owner dashboard tenant data.
- Phase 17/18: tenant-scoped catalog (composite FKs), ingredients/recipes/inventory foundation.
- POS: connected cashier to authenticated tenant menu; removed dummy catalog; centralized pricing contracts.
- Orders: authenticated transactional order flow; shared error handling.
- DB: tenant and developer access foundations; canonical permission catalog; fail-closed grants.

## 3. Architectural Changes

- Shift from dummy catalog to tenant-scoped, DB-backed catalog.
- Introduction of Organization/Outlet/Staff tenant model.
- Composite foreign keys for tenant isolation.
- DeveloperAccess as separate platform boundary.
- Immutable inventory ledger with CHECK constraints.
- Refund approval workflow.

## 4. Major Commits (referenced)

- c63ac7d: canonical permission catalog.
- 368ea4d: tenant and developer access foundations.
- 589ca72: authenticated transactional order flow.
- 6e0a620: staff lifecycle foundation (current HEAD).

## 5. Deprecated / Superseded

- /api/auth/bootstrap (superseded by /api/auth/provision).
- Dummy catalog (removed in dcb7192).

## 6. Known Technical Debt (accumulated)

See TECHNICAL-DEBT-AND-ROADMAP.md. Dominant: simulated second-tier features, missing offline POS, order completion dead-end.

## 7. Sources

- git log (branch phase14-manual).
- Existing docs under docs/, docs/audit/, docs/audits/, docs/research/.
- Code inspection.
Historical facts above are verified from git; recommendations are technical, not historical.
