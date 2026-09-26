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
- This environment does not provide direct dashboard or project-state API validation, so the live project state cannot be safely verified programmatically from here.

## D. HTTPS API health
`HTTPS_API_OK`

Evidence:
- `Test-NetConnection gnrpxqvdlxkqqlnoigmk.supabase.co -Port 443` succeeded.
- This confirms the public Supabase project endpoint is reachable over HTTPS.

## E. Prisma result
- `npx prisma db execute --stdin` with `SELECT 1;`
- Result: `Error: P1001`
- Exact sanitized error:
  - `P1001: Can't reach database server at aws-0-ap-southeast-1.pooler.supabase.com:5432`

## F. Root cause classification
`SUPABASE_DATABASE_UNAVAILABLE`

Reason:
- Network reachability is healthy: DNS, TCP 5432, TCP 6543, and HTTPS 443 all succeed.
- The remaining issue is at the Supabase database service/project level rather than the application, Prisma schema, or network path.
- Prisma still fails with `P1001`, which indicates the database endpoint is not accepting or servicing the connection from this environment.

## G. Single next action
Verify the Supabase project database instance is active and accepting connections in the Dashboard, then retry the exact copied Session Pooler connection string without changing the application or Prisma configuration.

Final status: `SUPABASE_DATABASE_UNAVAILABLE`
