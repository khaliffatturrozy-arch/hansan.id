# FINAL SUPABASE DATABASE GATE

## 1. Environment verification

- DATABASE_URL: PRESENT
- DIRECT_URL: PRESENT
- NEXT_PUBLIC_SUPABASE_URL: PRESENT
- NEXT_PUBLIC_SUPABASE_ANON_KEY: PRESENT
- SUPABASE_SERVICE_ROLE_KEY: MISSING
- `.env` is ignored by Git: yes

## 2. Project identity

Expected project reference: `gnrpxqvdlxkqqlnoigmk`

Observed configuration:

- Configured public Supabase URL host: `nhvsyrhkhhnlibdskxew.supabase.co`
- Configured PostgreSQL host in current `DATABASE_URL`: `db.gnrpxqvdlxkqqlnoigmk.supabase.co`

Result:

- PROJECT_REFERENCE: FAIL

Reason:
- The current public Supabase URL does not match the expected project reference.
- The PostgreSQL host does match the expected project reference, but the overall environment is inconsistent.

## 3. HTTPS connectivity

Config checked: `NEXT_PUBLIC_SUPABASE_URL`

Result:

- SUPABASE_HTTPS: FAIL

Observed sanitized network result:

- `No such host is known. (nhvsyrhkhhnlibdskxew.supabase.co:443)`

## 4. Native PostgreSQL result

Test executed with current configured database endpoint using the installed PostgreSQL client:

- Query: `SELECT current_database(), current_user, version();`
- Result: `POSTGRES_CONNECTION: FAIL`
- Sanitized error: `could not translate host name "db.gnrpxqvdlxkqqlnoigmk.supabase.co" to address: Name or service not known`

This verifies that the current environment cannot resolve and connect to the configured Postgres host from this machine.

## 5. Prisma result

Executed:

- `npx prisma validate`
- `npx prisma migrate status`

Result:

- PRISMA_VALIDATE: PASS
- PRISMA_CONNECTION: FAIL
- MIGRATION_STATE: UNKNOWN

Observed sanitized Prisma failure:

- `P1001: Can't reach database server at db.gnrpxqvdlxkqqlnoigmk.supabase.co:5432`

Prisma schema itself is valid, but runtime connection is not currently working.

## 6. Database identity consistency

Compared evidence:

- Supabase project reference across public URL: mismatch
- Native PostgreSQL host: expected project host present
- Prisma runtime target: expected project host present but unreachable
- migration status: unavailable because the DB host is not reachable

Overall result:

- Database identity consistency: FAIL

This environment does not currently provide a consistent and reachable Supabase project identity.

## 7. Secret safety

Tracked repository secret scan executed without printing credentials.

Result:

- SECRET_SCAN: FAIL

Files with secret-like patterns in tracked files (no secret values exposed):

- `.env.example`
- `docs/PHASE-1-REPORT.md`
- `docs/PHASE-1B-DB-CONNECTION-REPORT.md`
- `docs/PHASE-1B-REPORT.md`
- `docs/audit/CHANGELOG.md`
- `docs/audit/HANSAN-AUDIT.md`
- `docs/audit/PHASE_0_RISKS_AND_BLOCKERS.md`
- `prisma/schema.prisma`
- `src/lib/auth.ts`
- `src/lib/order-service.ts`

This is a scan for obvious secret-bearing patterns and does not print secret contents.

## 8. Final verdict

### DATABASE_GATE = FAIL

The current environment is not conclusively connected to the intended Supabase PostgreSQL project.

## 9. Blocking issue

The live project is currently blocked by a mixed state:

- the public Supabase URL points to a different project reference than the expected one
- the public Supabase host fails DNS/HTTPS resolution
- the direct PostgreSQL host is configured with the expected project reference but is not resolvable from this machine
- Prisma cannot reach the PostgreSQL server and migration status cannot be trusted in the current environment

This is a genuine infrastructure/configuration issue, not an application-code issue.

## 10. Next action

1. Restore and confirm the intended Supabase project URL and project reference across all environment variables.
2. Verify that the actual project host is reachable from this environment.
3. Confirm the correct database username, password, and DNS routing for the live Supabase Postgres endpoint.
4. Re-run native PostgreSQL and Prisma verification after the environment is corrected.

No application code was modified as part of this gate check.
No database state was modified.
No migration was executed.
No commit or push was performed.
