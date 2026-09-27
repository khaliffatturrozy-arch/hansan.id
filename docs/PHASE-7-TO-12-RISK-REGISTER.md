# HANSAN Phases 7-12 — Risk Register

Status: risks controlled within the in-memory service layer; database remains on hold.

## Risk 1 — Loyalty accounting drift
- Risk: duplicate or stale reward events can distort points.
- Mitigation: reference-based idempotency guards and ledger tracking have been enforced.
- Residual risk: low in the current deterministic model.

## Risk 2 — Promotion misuse and stacking abuse
- Risk: repeated redemption or invalid stacking can over-discount orders.
- Mitigation: promotion application uses unique order keys, usage checks, and min-spend gates.
- Residual risk: low until persistence is introduced.

## Risk 3 — Staff process inconsistency
- Risk: attendance or closing procedures may drift from operational policy.
- Mitigation: explicit attendance status logic and opening/closing lifecycle states are enforced in memory.
- Residual risk: low in the current service layer.

## Risk 4 — Unsafe content in customer-facing experiences
- Risk: malicious CSS or script-like strings can leak into published experience configuration.
- Mitigation: any URL-like or script-like content is rejected before moving to the site config.
- Residual risk: low in the current validation layer.

## Risk 5 — HQ reporting drift from source-of-truth data
- Risk: summary reports may not match operational records.
- Mitigation: the report layer derives totals directly from the source order, payment, and refund records.
- Residual risk: low in the current deterministic dataset.

## Risk 6 — Cross-module workflow inconsistency
- Risk: a workflow may behave differently across modules or channels.
- Mitigation: the integrated workflow contracts bind sale, reservation, and website order behavior to the same deterministic rules.
- Residual risk: low while the repo remains in-memory and database-locked.

## Acceptance statement
The repository remains safely in the service-layer and test-layer phase. No live persistence or schema activation has been introduced, and the risk posture is consistent with the project’s hold policy.
