# HANSAN — Phase 1B Database Connection Diagnostic Report

## A. Sanitized connection configuration
DATABASE_URL
- host=aws-0-ap-southeast-1.pooler.supabase.com
- port=5432
- username_format=postgres.[PROJECT-REF]
- database=postgres
- sslmode=not set
- other_parameters=pgbouncer=true&connection_limit=1

DIRECT_URL
- host=aws-0-ap-southeast-1.pooler.supabase.com
- port=5432
- username_format=postgres.[PROJECT-REF]
- database=postgres
- sslmode=not set
- other_parameters=none

Notes:
- The configured connection pattern matches a Supabase Session Pooler-style PostgreSQL endpoint.
- No credentials, keys, or full connection strings are exposed.

## B. Connection string comparison
`CONNECTION_STRING_MATCH`

Reason:
- The host, port, database pattern, and Session Pooler-style username format are consistent with the Supabase connection string expected for this project.
- No evidence was found of a stale or guessed configuration in the checked runtime environment.

## C. Supabase project state
`PROJECT_STATE_UNKNOWN`

Reason:
- The environment did not provide direct dashboard or project-state API validation, so the live Supabase project state could not be safely confirmed programmatically from here.
- Official Supabase status is not enough to override the local connection failure without a native database validation pass.

## D. HTTPS API health
`HTTPS_API_OK`

Evidence:
- `Test-NetConnection gnrpxqvdlxkqqlnoigmk.supabase.co -Port 443` succeeded.
- This confirms the public Supabase project endpoint is reachable over HTTPS.

## E. PostgreSQL client availability
- `npm ls pg --depth=0` -> `PG_NOT_INSTALLED`
- No PostgreSQL-capable Node driver is currently installed in the project.
- Native Postgres protocol testing was therefore not possible from Node without adding a dependency, which was intentionally not done.

## F. Native PostgreSQL / direct connection status
- `psql --version` -> `PSQL_NOT_INSTALLED`
- `DATABASE_URL` direct native protocol test: not executed because no PostgreSQL client is installed.
- `DIRECT_URL` direct protocol test: not executed because no PostgreSQL client is installed; network-level reachability for the same host remains PASS.

## G. Diagnostic matrix
DATABASE_URL / Session Pooler:
- TCP = PASS
- PostgreSQL = UNKNOWN
- TLS = UNKNOWN
- Auth = UNKNOWN

DIRECT_URL:
- TCP = PASS
- PostgreSQL = UNKNOWN
- TLS = UNKNOWN
- Auth = UNKNOWN

Prisma:
- FAILED

## H. Prisma result
- `npx prisma db execute --stdin` with `SELECT 1;`
- Result: `Error: P1001`
- Exact sanitized error:
  - `P1001: Can't reach database server at aws-0-ap-southeast-1.pooler.supabase.com:5432`

## I. Root cause classification
`PRISMA_ONLY_FAILURE`

Reason:
- The network path is healthy: DNS, TCP 5432, TCP 6543, and HTTPS 443 all succeed.
- No local PostgreSQL client is installed, so there is no native protocol test confirming a service-side database failure.
- The remaining evidence is therefore most consistent with a Prisma-specific connection behavior or a database endpoint/access state that Prisma is exposing as P1001, rather than a generic network or app-code issue.

## J. Single next action
Install a native PostgreSQL client or a PostgreSQL driver in a non-production diagnostic environment, then validate the exact copied Supabase Session Pooler connection string outside Prisma before retrying the application stack.

Final status: `PRISMA_ONLY_FAILURE`
