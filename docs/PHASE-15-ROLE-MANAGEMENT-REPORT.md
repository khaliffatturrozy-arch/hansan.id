# Phase 15 — Tenant Role Management

**Branch:** `phase14-manual` · **HEAD at time of writing:** `c63ac7d`
**Status:** backend + API + test suite implemented and verified by typecheck, unit/integration tests, lint, Prisma validation and production build. The deletion blockers and both unique constraints were additionally verified **against the live PostgreSQL database** (46/46 live checks, section 5.1). **No role-management UI exists yet** (see "Not in this phase").

---

## 1. Objective

Give a tenant a real, server-authoritative way to define its own roles without any
path that can touch another tenant's roles, mutate a platform role, or strip
authorization away from staff by accident.

Role management here is definition management (`name`, `description`) — not
permission-grant management. Permission assignment is `roles.assign_permission`
and is a separate phase.

## 2. Delivered surface

| File | Role |
|---|---|
| `src/lib/role-management.ts` | Pure rules + transaction-scoped services (`createTenantRole`, `updateTenantRole`, `deleteTenantRole`). No Prisma, Supabase or Next.js import; loadable by the `node:test` runner. |
| `src/lib/role-service.ts` | Data layer. The only module of this phase that touches Prisma. Read scope + `prisma.$transaction` boundaries. |
| `src/app/api/roles/route.ts` | `GET` (list), `POST` (create). `PUT` → 405. |
| `src/app/api/roles/[id]/route.ts` | `PATCH` (rename / re-describe), `DELETE`. `GET`/`POST` → 405. |
| `src/lib/role-management.test.ts` | 53 tests across 13 groups. |
| `scripts/phase15-live-integration.ts` | Phase 15.1 live-database verification harness (rollback-only, marker-scoped). Manual: `npx ts-node scripts/phase15-live-integration.ts`. Deliberately **not** part of `npm test`, which must stay database-free. |

## 3. Invariants enforced

| Invariant | Where | Failure answer |
|---|---|---|
| Client never supplies authority: `organizationId`, `isPlatform`, `code`, `permissions`, `staffIds` are rejected by the allowlist parsers; a body `organizationId` is read **only** to be compared with the session | `NON_WRITABLE_ROLE_FIELDS`, `rejectNonWritableFields`, `extractRoleOrganizationClaim` + `requireProtectedRequest` | 400 / 403 |
| Tenant scoping is proven, not assumed: reads and writes pin `{ organizationId, isPlatform: false }`; the loaded target is re-checked against the caller's organization | `role-service.ts`, `requireTenantRoleTarget` | 404 (unknown id and foreign id are indistinguishable — no existence oracle) |
| Platform roles are untouchable from a tenant (`isPlatform = true`, `organizationId IS NULL`) | `requireTenantRoleTarget`, `RESERVED_PLATFORM_*` | 403 |
| The organization's `OWNER` role can never be renamed, re-described, deleted or replaced | `isProtectedTenantRole`, `rejectProtectedRoleMutation` | 409 |
| A role still assigned to staff or still carrying permission grants cannot be deleted | `decideRoleDeletion` (counts taken inside the transaction) | 409 |
| `code` is generated server-side from the role name and is never writable | `roleCodeFromRoleName` | — |
| Reserved platform vocabulary cannot be adopted by a tenant (`PLATFORM*`, `DEVELOPER*`, `SUPER_*`, `ADMIN`, `SUPERADMIN`, …) | `decideReservedRoleName` | 403 (OWNER name → 409) |
| Concurrent mutation cannot be silently overwritten: `updateMany`/`deleteMany` re-pin `id + organizationId + isPlatform` (+ the observed `name` on update) and require `count === 1` | `updateTenantRole`, `deleteTenantRole` | 409 |
| State change and `AuditLog` row live in ONE transaction | `role-service.ts` + `tx.auditLog.create` | rollback is mutual |
| Database unique constraints remain the final authority (`Role.code @unique`, `@@unique([organizationId, name])`) | `mapRoleWriteConflict` | 409, no stack leak |
| Internal fields never reach a response | `toRoleView` (no `organizationId`, no `isPlatform`) | — |

Permission vocabulary is the canonical catalog only — `roles.read`,
`roles.create`, `roles.update`, `roles.delete` from `src/lib/permissions.ts`,
seeded as reference data in migration
`202610010001_permission_catalog_reference_data`. `ROLE_OPERATION_PERMISSIONS`
is frozen and deliberately excludes `roles.assign_permission`.

## 4. Test coverage (`src/lib/role-management.test.ts`, 53 tests, 13 groups)

1. `role operation permissions` — catalog names, per-operation mapping.
2. `role request parsing` — allowlist, non-writable-field rejection, malformed payloads, length limits.
3. `reserved role names` — reserved exact names and prefixes, incl. `SUPER_ADMIN`-style names; the `SUPER_` prefix does not over-block ordinary tenant names.
4. `server-generated role code` — deterministic code derivation, OWNER code convention.
5. `role target access` — tenant / platform / foreign / unknown target decisions.
6. `OWNER protection` — protected-role refusal on both verbs.
7. `role update plan` — no-op → 400, changed/before/after diff, immutable fields never planned.
8. `role deletion safety` — staff-reference and permission-grant blockers.
9. `createTenantRole` — happy path + audit row, duplicate name/code → 409, unique-violation mapping with **no** audit row, `isPlatform: false` pinned.
10. `updateTenantRole` — happy path, cross-tenant 404, platform 403, OWNER 409, lost race 409, audit diff.
11. `deleteTenantRole` — happy path, reference blockers 409, OWNER 409, cross-tenant/unknown 404, platform 403, re-pinned `deleteMany` count ≠ 1 → 409 and no audit row.
12. `client-claimed identity never becomes authority` — body `organizationId` / `isPlatform` / `permissions` never trusted; a platform/developer identity with no tenant `Staff` record cannot use these routes (403); `toRoleView` leaks no internal field.
13. `permission vocabulary stays canonical` — every operation maps to an existing `roles.*` permission, `ROLE_OPERATION_PERMISSIONS` and `NON_WRITABLE_ROLE_FIELDS` are frozen and duplicate-free.

## 5. Verification actually executed

| Check | Command | Result |
|---|---|---|
| Unit + integration tests | `npm test` | **294 tests, 294 pass, 0 fail** (exit 0) |
| Role suite alone | `node --test --require ts-node/register src/lib/role-management.test.ts` | **53 pass, 0 fail** (exit 0) |
| Typecheck | `npx tsc --noEmit` | **0 errors** (exit 0) |
| Lint | `npx next lint` | clean (no warnings/errors) |
| Schema validation | `npx prisma validate` | valid |
| Production build | `npx next build` | success; `/api/roles` and `/api/roles/[id]` registered as dynamic routes; middleware bundled |
| Live DB integration verification | `npx ts-node scripts/phase15-live-integration.ts` | **46 checks, 46 pass, 0 fail** (exit 0) — see 5.1 |
| Schema / migration inspection | read of `prisma/schema.prisma` (Role / RolePermission / StaffRole / AuditLog) + migration grep | `Role.code @unique`, `@@unique([organizationId, name])`, `@@index([organizationId])`, `@@index([isPlatform])`, `RolePermission.roleId` and `StaffRole.roleId` `onDelete: Cascade`, `Role_platform_org_check` present in `202609300001_tenant_safe_data_foundation` |

The unit/integration suite above runs against a transaction-scoped fake client, so it
asserts constraint behaviour at the query level (pre-checks + `P2002` mapping). The real
constraint behaviour is proven separately against live PostgreSQL in 5.1.

### 5.1 Live PostgreSQL integration verification (Phase 15.1)

Executed against the configured HANSAN database (`npx prisma migrate status`: 7
migrations, "Database schema is up to date") by
[`scripts/phase15-live-integration.ts`](../scripts/phase15-live-integration.ts)
→ `RESULT checks=46 passed=46 failed=0`, exit 0.

**Write-safety model.** Every probe lives inside `prisma.$transaction(...)` whose callback
ends by throwing a private `RollbackSignal`, so nothing can commit; the runner raises an
alarm if a transaction ever resolves without that signal (it never did — "no probe
transaction ever committed" PASS). Temporary rows carried a per-run marker
(`org-<tag>-p151probe…`, `…@probe.invalid`, code prefix `PHASE15_PROBE_…`) and vanished with
the rollback; the post-run marker scan found 0 leftovers. `Permission` rows were only ever
read, and `DeveloperAccess` was never written.

| Live claim under test | Real PostgreSQL / application result |
|---|---|
| A real `StaffRole` row blocks deletion | `deleteTenantRole` threw `RoleManagementError` **409** (`STAFF_REFERENCES`); the Role row survived, the `StaffRole` row survived, and **no** `ROLE_DELETED` audit row was written; `toSafeApiError` → HTTP **409 / CONFLICT** |
| The blocker is reference-driven, not a blanket refusal | After the `StaffRole` row was released, the same call deleted the role and wrote exactly **1** `ROLE_DELETED` audit row |
| A real `RolePermission` grant blocks deletion | **409** (`PERMISSION_GRANTS`) against catalog row `audit.read`; role + grant intact; the referenced `Permission` row identical before/after; deletion allowed once the grant was released |
| `@@unique([organizationId, name])` really fires | Raw duplicate-name insert inside one tenant → PostgreSQL **P2002**, `meta.target = ["organizationId","name"]` → `mapRoleWriteConflict` → **409** → HTTP **409 / CONFLICT**, "Role dengan nama tersebut sudah ada di organisasi ini." |
| Uniqueness is tenant-scoped | The same role name in a second temporary tenant was accepted, with a distinct globally unique `Role.code` |
| `Role.code @unique` really fires | Reusing an existing code → **P2002**, target `code` → **409** "Kode role sudah digunakan." |
| Why the guard has to exist | A raw `role.delete` that bypasses the service **does** cascade-remove the `StaffRole` row (`onDelete: Cascade`) — observed inside a rolled-back transaction; the application guard, not the database, is what protects authorization |

**Data-integrity evidence.** Before/after `count(*)` + `md5(full-row)` fingerprints were
identical for `Organization`, `Outlet`, `Staff`, `Role`, `Permission`, `RolePermission`,
`StaffRole`, `AuditLog` and `DeveloperAccess`. The live database carried no business rows
yet (`Organization`/`Outlet`/`Staff`/`Role`/`AuditLog`/`DeveloperAccess` = 0,
`Permission` = 75 catalog rows, fingerprint `9f1a85132d005a36a6d4028e90f0efbd` unchanged) —
and that 75-row fingerprint matching is the positive control proving the fingerprint
mechanism detects any inserted or edited row.

**Environment facts recorded by the same run.** The configured pooler connection supports
interactive, rollback-capable transactions (preflight PASS). No secret value is printed by
the harness — only whether `DATABASE_URL` / `DIRECT_URL` are set — and every printed string
passes through a redactor that strips both URL values and any `user:pass@` segment.


## 6. Security review notes

- Server-side enforcement only. `src/middleware.ts` matches all non-asset paths
  (including `/api/roles`), but the routes themselves re-resolve the session and
  re-check permissions — hiding is not the boundary.
- `AuthenticatedStaffContext` is the sole source of `organizationId`, `outletId`,
  `staffId`, `userId`. `role-service.ts` never accepts an organization-id argument.
- `DeveloperAccess` is never consulted by role management: a platform identity
  without a tenant `Staff` record is refused before the body is parsed.
- `AuditLog.metadata` carries facts only (name, code, description, boolean platform
  flag, before/after diff, reference counts) and is typed `RoleAuditMetadata`
  (`string | number | boolean | null | nested`) so nothing non-serializable or
  `undefined` can be written, while the pure module still avoids importing Prisma.
- Errors go through `toSafeApiError`; no Prisma message or stack reaches the client.

## 7. Not in this phase / known limitations

1. **No UI.** There is no role-management page or client for these endpoints yet; this phase is domain + API only.
2. **Permission grant management** (`roles.assign_permission`, `RolePermission` writes, staff↔role assignment) is out of scope — deletion therefore refuses while grants still exist instead of cleaning them up.
3. **Platform-role name uniqueness:** PostgreSQL treats `NULL` as distinct, so `@@unique([organizationId, name])` does not constrain platform-role names; platform uniqueness rests on the globally unique `Role.code` (documented in `docs/ARCHITECTURE-DECISIONS.md`).
4. **Tenant isolation is application-level** (explicit `organizationId` filters), not PostgreSQL RLS — unchanged from Phase 14.
5. **Deletion safety and both unique constraints are now proven against live PostgreSQL** (5.1): a real `StaffRole` row and a real `RolePermission` grant each answer 409, and both constraints raise `P2002` which maps to 409. The live harness is a **manual script, not a CI job** — `npm test` stays database-free — so it must be re-run by hand after any change to the role write path.

## 8. Next logical action

The live-database proof requested for this phase is complete (5.1, 46/46). Next: build the
role-management UI on top of the verified `/api/roles` surface, and separately decide
whether `scripts/phase15-live-integration.ts` should become a guarded CI job — it needs
database credentials, so it cannot join `npm test` as it stands.
