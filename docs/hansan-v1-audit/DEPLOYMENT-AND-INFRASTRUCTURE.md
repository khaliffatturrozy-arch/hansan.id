# HANSAN V1 — DEPLOYMENT & INFRASTRUCTURE

**Audit date:** 2026-10-30

## 1. Hosting

- Application: Next.js 14 (Node runtime) suitable for Vercel or any Node host. No Dockerfile present.
- Database: Supabase PostgreSQL (hosted). Connection pooling modes documented in .env.example (transaction mode port 6543 for Vercel; direct port 5432 for migrations).

## 2. Environment Variables (names only)

DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, HANSAN_PROVISION_SECRET, HANSAN_DEVELOPER_PROVISION_SECRET. All documented in .env.example with usage notes. `.env` is git-ignored.

## 3. CI/CD

- No CI/CD configuration files found (.github workflows not present in repo listing). Verification is manual (npm test, tsc, lint, build).

## 4. Docker

- None.

## 5. Server Requirements

- Node.js (>=20 implied by @types/node ^20).
- npm.
- PostgreSQL reachable (Supabase) for runtime.
- Environment variables configured.

## 6. Runtime Dependencies

- @prisma/client, @supabase/ssr, @supabase/supabase-js, next, react, react-dom, clsx, lucide-react, tailwind-merge.

## 7. Monitoring & Logging

- console.warn for dropped non-canonical grants; console.error in route handlers (assumed). No structured logging/monitoring configured. No error tracking (Sentry etc.) present.

## 8. Backup Procedures

- Not documented in repo. Supabase provides managed backups (platform-level). No application-level backup scripts found.

## 9. Deployment Status

- Build succeeds. No deployment executed during this audit. Domain configuration unknown. No push/automatic deploy performed.

## 10. Operational Considerations

- Empty initial DB allowed; business data entered by operator.
- Pooling mode matters for serverless (documented).
- Service worker registered but offline transaction capture not implemented.
- No rate limiting on provisioning endpoints.
