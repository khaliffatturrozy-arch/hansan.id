# HANSAN — Phase 1B Database Connection Diagnostic Report

## 1. PostgreSQL client availability
- `psql --version` -> `PSQL_NOT_INSTALLED`
- Native PostgreSQL client is not installed in this environment, so direct native authentication testing could not be performed locally.

## 2. Sanitized connection configuration
DATABASE_URL:
- host=aws-0-ap-southeast-1.pooler.supabase.com
- port=5432
- username=[MASKED]
- database=postgres
- sslmode=not set
- query_parameters=pgbouncer=true&connection_limit=1

DIRECT_URL:
- host=aws-0-ap-southeast-1.pooler.supabase.com
- port=5432
- username=[MASKED]
- database=postgres
- sslmode=not set
- query_parameters=none

Observed review:
- The configured host matches the expected Supabase pooler host pattern copied from the project.
- The runtime URL structure is consistent with a Supabase Session Pooler connection pattern.
- The pooler username is masked and not exposed.
- `sslmode` is not explicitly configured in the connection string, which is a potential Prisma/Postgres compatibility factor but does not explain the network-layer reachability observed earlier.

## 3. Native PostgreSQL result
- Native PostgreSQL test result: not executable locally because `psql` is not installed (`PSQL_NOT_INSTALLED`).
- This prevented direct DB auth/SSL classification at the native client layer.

## 4. Prisma result
- `npx prisma migrate status` -> fails with the exact non-secret error:
  - `Error: P1001: Can't reach database server at aws-0-ap-southeast-1.pooler.supabase.com:5432`
- `npx prisma db execute --stdin` with `SELECT 1;` -> same result:
  - `Error: P1001`
  - `Can't reach database server at aws-0-ap-southeast-1.pooler.supabase.com:5432`

## 5. Exact sanitized error
- `P1001: Can't reach database server at aws-0-ap-southeast-1.pooler.supabase.com:5432`

## 6. Supabase project state
- Local verification of project state was not possible from this environment.
- Status: `SUPABASE_STATE_UNKNOWN`

## 7. Root-cause classification
- Network path: PASS
  - DNS resolves
  - TCP 5432 reachable
  - TCP 6543 reachable
  - HTTPS 443 reachable
- Local app architecture / Prisma schema / migration logic: not the cause.
- Remaining classification: `DATABASE_SERVICE_BLOCKED`
- Reason: the database host is reachable over the network, but the PostgreSQL service is still rejecting or not accepting the configured Prisma connection from this environment. The lack of a native PostgreSQL client prevents a deeper auth/SSL distinction without changing the project state.

## 8. Recommended single next action
- Verify the Supabase project/database instance itself is active and accepting connections in the Dashboard, then confirm the copied connection string belongs to the same active project and is still valid for the database instance.
- After Supabase project state is confirmed, install `psql` locally or use the Supabase SQL client and re-test the database auth path before retrying Prisma.

Final status: `DATABASE_SERVICE_BLOCKED`
