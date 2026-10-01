# HANSAN — Architecture Decisions (Data Foundation)

Authoritative record of the tenant, ownership, isolation, and migration decisions.
Established in **Phase B — Tenant-Safe Data Foundation**. Keep this document short
and current: if a decision changes, change it here in the same change.

---

## 1. Organization = tenant

`Organization` is the **business tenant**. It is the root of all data ownership
and the boundary of isolation. Every tenant-owned row carries `organizationId`
and is reachable from exactly one organization.

## 2. Outlet = physical location

`Outlet` is a **physical location owned by one organization**
(`Outlet.organizationId` → `Organization.id`, `onDelete: Cascade`).
`Outlet` is unique per organization by slug (`@@unique([organizationId, slug])`).

HANSAN launches with a **single outlet** but the schema is multi-outlet ready:
catalog is shared across an organization's outlets, and operational records
(orders) are outlet-scoped.

## 3. Catalog ownership — ORGANIZATION-level, not outlet-level

| Model | Owner | Rationale |
|---|---|---|
| `Category` | `organizationId` (**required**) | A menu taxonomy is shared by all outlets of a tenant. There is no outlet-specific category concept in the architecture or code. |
| `MenuItem` | `organizationId` (**required**) | A dish/priced item is defined once per tenant. |

**Deliberate decision:** catalog is **not** outlet-scoped. Outlet-specific
availability, if it is ever required, belongs on `MenuItem` as an explicit,
separate concept with clearly defined semantics ("available at all outlets" vs
"available only at outlet X"). Adding a nullable `outletId` now would introduce
ambiguous ownership with no requirement behind it.

**Tenant safety is structurally enforced.** `MenuItem` carries a
tenant-scoped **composite foreign key**:

```
MenuItem (categoryId, organizationId) → Category (id, organizationId)
```

Consequences that hold at the database level, not merely in application code:

- A menu item's `organizationId` can never drift from its category's.
- A menu item can never be attached to another organization's category.
- Any query filtering on `organizationId` cannot return another tenant's catalog.

`Category.slug` is unique **per organization** (`@@unique([organizationId, slug])`).
The previous global uniqueness made multi-tenancy impossible (two tenants could
not both own a "coffee" category).

## 4. Order ownership — ALL THREE KEYS ARE REQUIRED

`Order.organizationId`, `Order.outletId`, and `Order.staffId` are **NOT NULL**.
An order that cannot be attributed to a tenant, an outlet, and a staff member
cannot be audited, reconciled, or isolated, so such a row is not permitted.

- All three values are derived **server-side** from the authenticated staff
  context (`src/lib/auth.ts#resolveAuthenticatedStaffContext`), never from the
  request body. Client-supplied values are rejected by `validateClientIdentity`.
- `Order.staff` uses `onDelete: Restrict` (previously `SetNull`). Order history
  must never lose its cashier; staff are deactivated through `Staff.status`,
  never hard-deleted.

`OrderItem` inherits its tenant through `Order` and does **not** duplicate
`organizationId`. There is no tenant query that starts from `OrderItem` without
first having an order.

## 5. Platform-role ownership — model A (nullable tenant, enforced by CHECK)

`Role` supports two structurally distinct kinds of role:

| Kind | `isPlatform` | `organizationId` |
|---|---|---|
| Tenant role | `false` | **required** — must reference an organization |
| Platform role | `true` | **NULL** — owned by no tenant |

Platform roles (`PLATFORM_ADMIN`, `PLATFORM_DEVELOPER`, `PLATFORM_SUPPORT`) are
**global definitions**, not tenant data. They are therefore not owned by any
organization.

The invariant is enforced by a database CHECK constraint
(`Role_platform_org_check`, created in migration
`202609300001_tenant_safe_data_foundation`):

```sql
(isPlatform = true  AND organizationId IS NULL) OR
(isPlatform = false AND organizationId IS NOT NULL)
```

This means making `organizationId` nullable **does not weaken authorization**:
a tenant role can never lose its organization, and a platform role can never
masquerade as a tenant role. The constraint is *stronger* than the previous
schema, which tied nothing to `isPlatform`.

**Rejected alternative:** a synthetic "platform organization" row (the
`organizationId = 'PLATFORM'` value referenced in an earlier migration comment).
It was rejected because it requires inserting a fabricated organization row into
an initially empty production database, reserves a slug, makes a non-tenant
appear in tenant-scoped queries, and forces cross-organization `StaffRole`
assignments. The nullable model above achieves the same goal with no data.

**Known limitation:** because PostgreSQL treats `NULL` values as distinct in
unique indexes, `@@unique([organizationId, name])` does not prevent two platform
roles from sharing a name. Platform role uniqueness is currently governed by the
globally unique `Role.code` plus application logic. Prisma cannot express a
partial unique index, so this is documented rather than enforced.

**Developer / platform access boundary (DeveloperAccess is authoritative):**
`DeveloperAccess` (`prisma/schema.prisma`) is the SOLE authoritative
Developer/platform authorization boundary. It binds a Supabase `authUserId`
directly to platform access with no `organizationId`, `outletId`, `staffId`,
`roleId`, permissions array, or tenant foreign key. Developer/platform access
is therefore tenant-independent by construction.

`Staff → StaffRole → Role` MUST NOT be used to grant Developer access. The
previous statement that "a platform operator is a staff record that belongs
to an employing organization and additionally holds a global platform role"
is SUPERSEDED and must not be implemented: joining a tenant-bound Staff row
(`organizationId` NOT NULL) to a global platform Role (`organizationId`
NULL) creates a privilege-confusion hazard (tenant lifecycle implicitly
affecting platform authority, tenant permissions merging into platform
context, cross-organization `StaffRole` assignments).

`Staff.organizationId` remains **NOT NULL**; every tenant request stays
unconditionally tenant-scoped via `src/lib/auth.ts`, which rejects a missing
organization context. Platform requests are gated separately via
`src/lib/developer-access.ts` (`resolveDeveloperAccess` /
`requireDeveloperAccess`), which never consults any tenant table.

**Transitional note:** the `PLATFORM_ADMIN` / `PLATFORM_DEVELOPER` /
`PLATFORM_SUPPORT` Role vocabulary (`isPlatform = true`,
`organizationId IS NULL`) is RETAINED TEMPORARILY for compatibility only. It
is NOT an authorization path for Developer access. No platform Role rows are
seeded, no `StaffRole` may reference them for Developer purposes, and no new
tenant-facing writer may create them (provision endpoints hardcode
`isPlatform: false`; `requireRoleInOrganization` rejects `isPlatform: true`).

## 6. Tenant isolation mechanism — APPLICATION-LEVEL (current boundary)

Isolation is currently enforced **in the application layer**, by three
mechanisms working together:

1. **Authentication** — server-side Supabase JWT validation using the
   service-role key (`src/lib/auth.ts`). Fails closed; never falls back to the
   anon key.
2. **Context resolution** — `organizationId`, `outletId`, and `staffId` are
   resolved from the authenticated `Staff` row, never from client input.
   Client-supplied tenant identity is rejected (`validateClientIdentity`).
3. **Scoped queries** — every tenant-owned query filters on the resolved
   `organizationId` (for example `src/lib/order-service.ts` and
   `src/app/owner/page.tsx`).

The database **supports and reinforces** this: required tenant keys,
tenant-scoped composite foreign keys, and the platform/tenant CHECK constraint.
What the database does **not** yet do is *independently* enforce isolation.

## 7. RLS status — EXPLICITLY DEFERRED

**Row-Level Security is NOT implemented.** There is no `supabase/` directory and
no `CREATE POLICY` statement anywhere in `prisma/migrations/`. This document does
not claim otherwise.

RLS is deferred deliberately, for concrete technical reasons:

- Prisma connects with `DATABASE_URL` as the **table owner**. PostgreSQL applies
  RLS to a table owner only under `FORCE ROW LEVEL SECURITY`, and **superusers
  bypass RLS entirely**. Policies added today would therefore not bind the
  application's own queries.
- Implementing RLS correctly requires a **dedicated non-owner database role** for
  the application, plus per-request tenant session context (for example
  `set_config('app.organization_id', …)` inside every transaction), plus a
  Prisma client extension applying that context to all queries. That is an
  architectural change larger than this phase.
- The main threat RLS mitigates — direct database access from the client using a
  public key — does not currently exist: the browser only uses Supabase **Auth**;
  all data access flows through Next.js server code.

**Recorded hardening item:** once a non-owner application role and
per-transaction tenant context exist, add RLS policies on `Organization`,
`Outlet`, `Staff`, `Role`, `Category`, `MenuItem`, `Order`, and `OrderItem`.
Until then, application-level isolation is the enforcement boundary and must be
reviewed on every change.

## 8. Migration workflow

**Canonical workflow:**

```
prisma migrate dev      # author a migration in development
prisma migrate deploy   # apply migrations to a real environment
prisma migrate status   # inspect applied/pending state
```

`prisma db push` has been **removed** from `package.json`. It bypasses the
migration history, cannot be reviewed, and can alter a live schema
non-deterministically. Schema changes now happen only through a reviewed,
versioned migration file.

`CHECK` constraints are written as raw SQL inside migrations because Prisma does
not model them. They are invisible to Prisma's schema diff and are retained
across `migrate dev`.

## 9. Initial empty database policy

The initial production database is **allowed to start empty and must remain
empty** until real business data is entered by the HANSAN operator.

- No seed script exists. `prisma/seed.ts` was removed in Phase A; no `seed`
  script or `prisma.seed` entry remains.
- No demo menu items, categories, orders, organizations, outlets, or staff are
  created by any migration or script.
- First-time setup is performed by the operator through
  `POST /api/auth/provision`, which creates a real Organization, its first
  Outlet, and the OWNER role atomically.

**Backfill rule.** Migrations must never invent tenant identifiers. Where a
migration would require attributing existing rows to a tenant, it must **abort
with an actionable error** instead of guessing. The Phase B migration implements
exactly this: it fails closed with `HANSAN_PHASE_B_BACKFILL_REQUIRED` before
executing any DDL if catalog or unattributable order rows are present.

---

## Verified status of the data foundation

| Concern | Status |
|---|---|
| Organization / Outlet / Staff tenant scoping | Implemented |
| Category / MenuItem tenant ownership | Implemented (required + composite FK) |
| Order tenant ownership | Implemented (all three keys NOT NULL) |
| Platform vs tenant role separation | Implemented (nullable + CHECK constraint) |
| Composite indexes for verified query patterns | Implemented |
| Monetary invariants | Implemented (CHECK constraints) |
| Row-Level Security | **Not implemented — deferred (see §7)** |
| Database integration tests | **Not implemented** |
| Backup / restore, PITR verification | Not addressed |
