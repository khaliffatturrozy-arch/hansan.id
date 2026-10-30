# HANSAN V1 — SECURITY AUDIT

**Audit date:** 2026-10-30  
**Method:** Static inspection of source, schema, middleware, auth, routes. No exploitation, no config changes.

## 1. Authentication

- Supabase JWT, validated server-side via service role key. Middleware refreshes session cookies. No fallback to anon key for validation.
- Finding: INFO — provisioning endpoints rely on `X-Provision-Secret` / `X-Developer-Provision-Secret` headers with constant-time comparison; no rate limiting (MEDIUM operational risk).

## 2. Authorization / RBAC

- Server-enforced in every API route via requireProtectedRequest / requirePlatformAccess.
- Canonical permission catalog; fail-closed resolution (non-canonical grants dropped with warning).
- Anti-self-escalation on permission grants tested via real service.
- Developer access isolated in separate tenant-independent table; never via StaffRole.
- Finding: HIGH (business process) — no template role holds `orders.complete`, so no one can complete an order. Not an auth bypass, but a dead-end flow.

## 3. Tenant Isolation

- Application: every query carries organizationId from authenticated session.
- Database: composite FKs pin children to (id, organizationId); cross-tenant composition unrepresentable.
- Finding: INFO — strong two-layer enforcement.

## 4. API Protection

- All /api/* guarded; middleware protects pages. Client identity/price fields discarded, not validated-and-corrected.
- Finding: LOW — `/api/auth/bootstrap` effectively dead (requires perms only available post-provisioning).

## 5. Input Validation

- Prisma query builder used throughout; no raw SQL in app code. Single `$queryRawUnsafe` in standalone verification script with hardcoded table names (INFO).
- Finding: INFO — no SQL injection surface in application code.

## 6. XSS / CSRF

- No `dangerouslySetInnerHTML`, no `eval`, no user-controlled CSS injection (INFO).
- CSRF: cookie-based Supabase session; same-site defaults; no explicit CSRF token. Finding: MEDIUM — verify cookie SameSite/Secure settings in production; not explicitly configured in code.

## 7. Secrets Management

- `.env` git-ignored (verified `git check-ignore .env`). `.env.example` contains names only + documentation. No hardcoded secret in tracked files (tracked-file scan passed).
- Service role key server-only.

## 8. Session Security

- Cookies managed by Supabase SSR; middleware refreshes. Edge middleware cannot query DB; coarse presence only. Finding: LOW — ensure Secure/HttpOnly/SameSite in production (Supabase SSR defaults).

## 9. Rate Limiting

- None on provisioning endpoints. Finding: MEDIUM — documented in .env.example.

## 10. Multi-Tenant Isolation

- Strong (see §3). Finding: INFO.

## 11. Dependency Vulnerabilities

- Not verified (`npm audit` not executed). Finding: UNKNOWN — run `npm audit` before release.

## 12. Data Exposure Risks

- API returns domain data scoped to tenant. No internal stack traces exposed. Redaction helper `redactSensitiveConfig` exists. Finding: INFO.

## 13. Findings Summary Table

| ID | Severity | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| SEC-01 | HIGH (process) | No role holds orders.complete → orders dead-end at READY | tenant-role-templates.ts | Grant orders.complete to OWNER/MANAGER |
| SEC-02 | MEDIUM | No rate limiting on provisioning endpoints | .env.example, routes | Add rate limiting / IP throttling |
| SEC-03 | MEDIUM | CSRF cookie attributes not explicitly verified | middleware.ts | Verify SameSite/Secure in prod |
| SEC-04 | MEDIUM | Offline POS absent (core requirement) | .clinerules, src | Implement offline capture/reconciliation |
| SEC-05 | LOW | /api/auth/bootstrap effectively dead | route.ts | Remove or repurpose |
| SEC-06 | LOW | Free-form status strings (Staff, DeveloperAccess) | schema.prisma | Convert to enum or validate |
| SEC-07 | INFO | No SQL injection surface | src | None |
| SEC-08 | INFO | No XSS vectors found | src | None |
| SEC-09 | INFO | Strong two-layer tenant isolation | schema + services | Preserve |
| SEC-10 | UNKNOWN | Dependency CVEs not scanned | — | Run npm audit |

## 14. Overall Security Rating

Strong for current maturity. No CRITICAL/HIGH exploitable vulnerability. Dominant risks are operational/process (order completion, offline POS, rate limiting, dependency scan).
