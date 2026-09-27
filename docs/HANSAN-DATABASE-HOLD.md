# HANSAN DATABASE HOLD

## Status

The repository is currently placed in DATABASE_HOLD.

This hold is required because the previous Supabase database configuration failed the database gate and is no longer considered the active HANSAN database foundation.

## Purpose

This hold keeps the repository safe while separating:

- the intended application schema and business logic
- the Prisma schema and models
- the security and auth architecture
- the tenant and outlet design
- the order and POS implementation
- the project documentation and tests

from the obsolete database configuration belonging to the old Supabase project.

## Obsolete configuration removed from active state

The following categories were deactivated and replaced with empty placeholders:

- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWKS_URL`

No secret values are stored in the active repository hold state.

## What remains intact

The project remains ready for a later database setup session without deleting or redesigning the application layer:

- Prisma schema remains in place
- Prisma models remain in place
- migrations remain in the repository history
- application database abstractions remain available
- authentication and tenant architecture remain intact
- POS and order logic remain intact
- security guard logic remains intact
- documentation and tests remain intact

## Database hold conditions

The repository will remain in DATABASE_HOLD until a new, verified Supabase project is selected and configured in a separate setup session.

No new database is configured in this phase.
No application code is modified.
No Prisma schema or migration is changed.
No data reset or destructive database operation is performed.

## Next database setup session requirements

The next session must:

1. choose the correct new Supabase project
2. verify project identity against the HANSAN environment
3. populate only the required database variables with verified values
4. validate database connectivity and Prisma access
5. run only the necessary migration and schema verification checks
6. continue only after the new database is confirmed to be the active HANSAN database foundation

## Current state summary

- Old database configuration: deactivated
- New database: not configured yet
- Database gate status: HOLD
- Application code status: preserved
- Migration state: retained for later validation
