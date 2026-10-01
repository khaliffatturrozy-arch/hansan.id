/**
 * HANSAN — PHASE 15.1 · LIVE PostgreSQL VERIFICATION (tenant role management)
 *
 * Purpose: prove two claims against the REAL configured database, with zero
 * permanent mutation:
 *   1. a real StaffRole reference blocks role deletion (409, guard-level)
 *   2. the real PostgreSQL constraint @@unique([organizationId, name]) raises
 *      P2002 and the application maps it to 409
 *
 * SAFETY CONTRACT — read this before changing the file:
 *  - EVERY write runs inside `prisma.$transaction(...)` and the callback ends by
 *    throwing `RollbackSignal`. Nothing in this file can commit. `probe()`
 *    records an ALARM if a transaction ever resolves without that signal, and
 *    `emergencyCleanup()` then removes only rows carrying this run's private
 *    marker. No real Organization/Staff/Role/Permission/DeveloperAccess row is
 *    ever targeted, because every write targets rows created seconds earlier in
 *    the same transaction.
 *  - Temporary rows use markers that cannot collide with real data
 *    (`${RUN}` slug / `@probe.invalid` email — RFC 2606 reserved TLD).
 *  - `Permission` rows are only ever READ. `DeveloperAccess` is never written.
 *  - Secrets are never printed: only key names and non-empty booleans. Every
 *    string that reaches the console passes through `redact()`, which strips the
 *    DATABASE_URL/DIRECT_URL values and any user:pass@ segment.
 *
 * Run: npx ts-node scripts/phase15-live-integration.ts
 * Exit code 0 = every check passed. 1 = a check failed. 2 = blocked/skipped.
 */
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import { toSafeApiError } from "../src/lib/api-errors";
import type { AuthenticatedStaffContext } from "../src/lib/auth";
import { PERMISSION } from "../src/lib/permissions";
import {
  createTenantRole,
  decideRoleDeletion,
  deleteTenantRole,
  mapRoleWriteConflict,
  RoleManagementError,
  type RoleView,
} from "../src/lib/role-management";

// ─────────────────────────────────────────────────────────────────────────────
// ENVIRONMENT (allowlisted keys only; values are never printed)
// ─────────────────────────────────────────────────────────────────────────────

const ENV_KEYS = ["DATABASE_URL", "DIRECT_URL"] as const;

function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match || !ENV_KEYS.includes(match[1] as (typeof ENV_KEYS)[number])) continue;
    if (process.env[match[1]] !== undefined && process.env[match[1]] !== "") continue;
    process.env[match[1]] = match[2]
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .replace(/^'(.*)'$/, "$1");
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const SECRETS: string[] = [];
for (const key of ENV_KEYS) {
  const value = process.env[key];
  if (value && value.length > 12) SECRETS.push(value);
}

function redact(value: string): string {
  let out = value;
  for (const secret of SECRETS) out = out.split(secret).join("[redacted-url]");
  return out.replace(/\/\/[^\s/@:]+:[^\s@]+@/g, "//[redacted-credentials]@");
}

function log(line = ""): void {
  console.log(redact(line));
}

// ─────────────────────────────────────────────────────────────────────────────
// RUN MARKER
// ─────────────────────────────────────────────────────────────────────────────

const RUN = `p151probe${Date.now().toString(36)}`;
const RUN_CODE = RUN.toUpperCase();

type Tx = Prisma.TransactionClient;

class RollbackSignal extends Error {
  constructor() {
    super("PHASE15_ROLLBACK");
    this.name = "RollbackSignal";
  }
}

const prisma = new PrismaClient({ log: ["error"] });

// ─────────────────────────────────────────────────────────────────────────────
// CHECKS + ROLLBACK-ONLY PROBE RUNNER
// ─────────────────────────────────────────────────────────────────────────────

type Check = { group: string; name: string; ok: boolean; detail?: string };
const CHECKS: Check[] = [];
let unexpectedCommit = false;

function check(group: string, name: string, ok: boolean, detail?: string): void {
  CHECKS.push({ group, name, ok, detail: detail ? redact(detail) : undefined });
  log(`${ok ? "PASS" : "FAIL"}  ${group} :: ${name}${detail ? `  [${detail}]` : ""}`);
}

function note(message: string): void {
  log(`NOTE  ${message}`);
}

type ProbeOutcome<T> = { value?: T; error?: unknown };

/** Runs fn inside a transaction that is ALWAYS rolled back. */
async function probe<T>(group: string, fn: (tx: Tx) => Promise<T>): Promise<ProbeOutcome<T>> {
  let captured: T | undefined;
  try {
    await prisma.$transaction(
      async (tx) => {
        captured = await fn(tx);
        throw new RollbackSignal();
      },
      { maxWait: 15000, timeout: 90000 }
    );
    // Unreachable while the rollback signal is thrown unconditionally above.
    unexpectedCommit = true;
    check(group, "transaction never commits", false, "transaction resolved without rollback");
  } catch (error) {
    if (error instanceof RollbackSignal) return { value: captured };
    return { error };
  }
  return { value: captured, error: new Error("COMMIT_DETECTED") };
}

function statusOf(error: unknown): number {
  return (error as { statusCode?: number } | null)?.statusCode ?? -1;
}

function codeOf(error: unknown): string {
  return (error as { code?: string } | null)?.code ?? "";
}

function targetOf(error: unknown): string {
  const target = (error as { meta?: { target?: unknown } } | null)?.meta?.target;
  return Array.isArray(target) ? target.join(",") : String(target ?? "");
}

// ─────────────────────────────────────────────────────────────────────────────
// ISOLATED TEMPORARY FIXTURE (created + discarded inside the probe transaction)
// ─────────────────────────────────────────────────────────────────────────────

type Fixture = {
  organizationId: string;
  staffId: string;
  context: AuthenticatedStaffContext;
};

async function makeTenant(tx: Tx, tag: string): Promise<Fixture> {
  const organization = await tx.organization.create({
    data: { name: `Phase15 Probe Org ${tag} ${RUN}`, slug: `org-${tag}-${RUN}` },
    select: { id: true },
  });
  const staff = await tx.staff.create({
    data: {
      authUserId: `auth-${tag}-${RUN}`,
      email: `staff-${tag}-${RUN}@probe.invalid`,
      firstName: `Phase15 Probe ${tag}`,
      organizationId: organization.id,
      status: "ACTIVE",
    },
    select: { id: true, authUserId: true, email: true },
  });

  return {
    organizationId: organization.id,
    staffId: staff.id,
    context: {
      userId: staff.authUserId,
      email: staff.email,
      staffId: staff.id,
      staffName: `Phase15 Probe ${tag}`,
      organizationId: organization.id,
      outletId: null,
      roleName: "BACK_OFFICE",
      permissions: [
        PERMISSION.ROLES_READ,
        PERMISSION.ROLES_CREATE,
        PERMISSION.ROLES_UPDATE,
        PERMISSION.ROLES_DELETE,
      ],
      status: "ACTIVE",
    },
  };
}

function probeRoleName(tag: string): string {
  return `Phase15 Probe ${tag} ${RUN}`;
}

function createProbeRole(tx: Tx, fixture: Fixture, name: string): Promise<RoleView> {
  return createTenantRole({
    tx,
    context: fixture.context,
    request: { name, description: "Phase 15.1 live verification — temporary row" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA-INTEGRITY SNAPSHOT (row count + full-row fingerprint per table)
// ─────────────────────────────────────────────────────────────────────────────

// Identifiers are double-quoted: PostgreSQL folds unquoted camelCase to lowercase,
// so `x.roleId` would resolve to a nonexistent `x.roleid`.
const SNAPSHOT_TABLES: Array<{ table: string; order: string }> = [
  { table: "Organization", order: 'x."id"' },
  { table: "Outlet", order: 'x."id"' },
  { table: "Staff", order: 'x."id"' },
  { table: "Role", order: 'x."id"' },
  { table: "Permission", order: 'x."id"' },
  { table: "RolePermission", order: 'x."roleId", x."permissionId"' },
  { table: "StaffRole", order: 'x."staffId", x."roleId"' },
  { table: "AuditLog", order: 'x."id"' },
  { table: "DeveloperAccess", order: 'x."id"' },
];

type Snapshot = Record<string, string>;

async function snapshot(): Promise<Snapshot> {
  const result: Snapshot = {};
  for (const entry of SNAPSHOT_TABLES) {
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ rows_total: number; fingerprint: string }>>(
        `SELECT count(*)::int AS rows_total, ` +
          `coalesce(md5(string_agg(x::text, ',' ORDER BY ${entry.order})), '-') AS fingerprint ` +
          `FROM "${entry.table}" x`
      );
      const row = rows[0];
      result[entry.table] = `${row ? row.rows_total : "?"}|${row ? row.fingerprint : "?"}`;
    } catch (error) {
      result[entry.table] = `ERROR:${error instanceof Error ? error.name : "unknown"}`;
    }
  }
  return result;
}

function printSnapshot(label: string, snap: Snapshot): void {
  log(`--- snapshot ${label} ---`);
  for (const entry of SNAPSHOT_TABLES) {
    log(`    ${entry.table.padEnd(16)} count|md5(all-rows) = ${snap[entry.table]}`);
  }
}

function compareSnapshots(before: Snapshot, after: Snapshot): void {
  for (const entry of SNAPSHOT_TABLES) {
    check(
      "5. Data integrity",
      `${entry.table} unchanged (count + full-row md5)`,
      before[entry.table] === after[entry.table],
      `before=${before[entry.table]} after=${after[entry.table]}`
    );
  }
}

/** Nothing carrying this run's marker may survive. */
async function scanLeftovers(): Promise<void> {
  const organizations = await prisma.organization.count({ where: { slug: { contains: RUN } } });
  const staff = await prisma.staff.count({
    where: { OR: [{ email: { contains: RUN } }, { authUserId: { contains: RUN } }] },
  });
  const roles = await prisma.role.count({ where: { code: { contains: RUN_CODE } } });

  check("4. Cleanup", "no leftover probe Organization", organizations === 0, `count=${organizations}`);
  check("4. Cleanup", "no leftover probe Staff", staff === 0, `count=${staff}`);
  check("4. Cleanup", "no leftover probe Role", roles === 0, `count=${roles}`);
}

/** Defense in depth: runs ONLY if a probe transaction ever committed. Marker-scoped. */
async function emergencyCleanup(): Promise<void> {
  if (!unexpectedCommit) return;
  log("!!! A COMMIT WAS DETECTED — running marker-scoped cleanup !!!");
  await prisma.staffRole.deleteMany({ where: { staff: { email: { contains: RUN } } } });
  await prisma.rolePermission.deleteMany({ where: { role: { code: { contains: RUN_CODE } } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { contains: RUN } } });
  await prisma.staff.deleteMany({ where: { email: { contains: RUN } } });
  await prisma.role.deleteMany({ where: { code: { contains: RUN_CODE } } });
  await prisma.organization.deleteMany({ where: { slug: { contains: RUN } } });
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAIM 1 — a REAL StaffRole reference blocks deletion
// ─────────────────────────────────────────────────────────────────────────────

function reportProbeFailure(group: string, error: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  check(group, "probe executed against the live database", false, detail);
}

async function probeStaffRoleBlocksDeletion(): Promise<void> {
  const group = "1. StaffRole reference blocks deletion";
  const outcome = await probe(group, async (tx) => {
    const fixture = await makeTenant(tx, "del");
    const role = await createProbeRole(tx, fixture, probeRoleName("waiter"));
    await tx.staffRole.create({ data: { staffId: fixture.staffId, roleId: role.id } });

    const assignmentsBefore = await tx.staffRole.count({ where: { roleId: role.id } });

    let thrown: unknown = null;
    let returned: unknown = null;
    try {
      returned = await deleteTenantRole({ tx, context: fixture.context, roleId: role.id });
    } catch (error) {
      thrown = error;
    }

    return {
      assignmentsBefore,
      thrown,
      returnedNull: returned === null,
      roleRows: await tx.role.count({ where: { id: role.id } }),
      assignmentsAfter: await tx.staffRole.count({ where: { roleId: role.id } }),
      staffStillAssigned: (await tx.staffRole.count({ where: { staffId: fixture.staffId } })) === 1,
      deleteAuditRows: await tx.auditLog.count({
        where: { entityId: role.id, action: "ROLE_DELETED" },
      }),
    };
  });

  if (!outcome.value) {
    reportProbeFailure(group, outcome.error);
    return;
  }
  const value = outcome.value;
  const expected = decideRoleDeletion({
    staffReferences: value.assignmentsBefore,
    permissionGrants: 0,
  });
  const expectedMessage = expected.ok ? "" : expected.message;

  check(
    group,
    "deleteTenantRole refused (no value returned)",
    value.thrown instanceof RoleManagementError && value.returnedNull,
    `threw=${value.thrown ? "yes" : "no"} returned=${value.returnedNull ? "null" : "value"}`
  );
  check(
    group,
    "refusal carries statusCode 409",
    statusOf(value.thrown) === 409,
    `statusCode=${statusOf(value.thrown)}`
  );
  check(
    group,
    "blocker resolved as STAFF_REFERENCES",
    expected.ok === false && expected.blocker === "STAFF_REFERENCES" && expected.status === 409,
    `blocker=${expected.ok ? "none" : expected.blocker}`
  );
  check(
    group,
    "message is the canonical staff-reference blocker message",
    value.thrown instanceof Error && value.thrown.message === expectedMessage
  );

  const api = toSafeApiError(value.thrown, "Gagal menghapus role.");
  check(
    group,
    "API error boundary turns it into HTTP 409 / CONFLICT",
    api.status === 409 && api.body.code === "CONFLICT",
    `status=${api.status} code=${api.body.code}`
  );

  check(group, "role row survived the refused delete", value.roleRows === 1, `rows=${value.roleRows}`);
  check(
    group,
    "StaffRole assignment survived (authorization not stripped)",
    value.assignmentsAfter === 1 && value.staffStillAssigned,
    `assignments=${value.assignmentsAfter}`
  );
  check(
    group,
    "no ROLE_DELETED audit row was written for a refused delete",
    value.deleteAuditRows === 0,
    `auditRows=${value.deleteAuditRows}`
  );
}

async function probeDeleteAllowedAfterRelease(): Promise<void> {
  const group = "1b. Deletion allowed after the reference is released";
  const outcome = await probe(group, async (tx) => {
    const fixture = await makeTenant(tx, "release");
    const role = await createProbeRole(tx, fixture, probeRoleName("release"));
    await tx.staffRole.create({ data: { staffId: fixture.staffId, roleId: role.id } });
    await tx.staffRole.delete({
      where: { staffId_roleId: { staffId: fixture.staffId, roleId: role.id } },
    });

    let thrown: unknown = null;
    let deletedId: string | null = null;
    try {
      const deleted = await deleteTenantRole({ tx, context: fixture.context, roleId: role.id });
      deletedId = deleted.id;
    } catch (error) {
      thrown = error;
    }

    return {
      thrown,
      deletedId,
      roleRows: await tx.role.count({ where: { id: role.id } }),
      deleteAuditRows: await tx.auditLog.count({
        where: { entityId: role.id, action: "ROLE_DELETED" },
      }),
    };
  });

  if (!outcome.value) {
    reportProbeFailure(group, outcome.error);
    return;
  }
  const value = outcome.value;
  check(
    group,
    "delete succeeds once no StaffRole references it (reference-driven, not a blanket refusal)",
    value.thrown === null && value.deletedId !== null && value.roleRows === 0,
    `error=${value.thrown ? statusOf(value.thrown) : "none"} roleRows=${value.roleRows}`
  );
  check(
    group,
    "the accepted delete wrote exactly one ROLE_DELETED audit row",
    value.deleteAuditRows === 1,
    `auditRows=${value.deleteAuditRows}`
  );
}

async function probeCascadeHazard(): Promise<void> {
  const group = "1c. PostgreSQL cascade behaviour (justifies the guard)";
  const outcome = await probe(group, async (tx) => {
    const fixture = await makeTenant(tx, "cascade");
    const role = await createProbeRole(tx, fixture, probeRoleName("cascade"));
    await tx.staffRole.create({ data: { staffId: fixture.staffId, roleId: role.id } });
    // Raw delete that BYPASSES the application guard, inside the rolled-back tx.
    await tx.role.delete({ where: { id: role.id } });
    return {
      assignments: await tx.staffRole.count({ where: { staffId: fixture.staffId } }),
      staffRows: await tx.staff.count({ where: { id: fixture.staffId } }),
    };
  });

  if (!outcome.value) {
    reportProbeFailure(group, outcome.error);
    return;
  }
  check(
    group,
    "raw Role delete CASCADEs the StaffRole grant, so the app guard is the real protection",
    outcome.value.assignments === 0 && outcome.value.staffRows === 1,
    `assignmentsAfterRawDelete=${outcome.value.assignments} staffRows=${outcome.value.staffRows}`
  );
  note("Rolled back — the cascade above never persisted.");
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAIM 2 — REAL PostgreSQL uniqueness
// ─────────────────────────────────────────────────────────────────────────────

async function probeRealUniqueName(): Promise<void> {
  const group = "2. @@unique([organizationId,name]) → P2002 → 409";
  const name = probeRoleName("dupe");
  const outcome = await probe(group, async (tx) => {
    const fixture = await makeTenant(tx, "dup");
    const first = await createProbeRole(tx, fixture, name);

    // Raw insert: deliberately bypasses the service pre-read so the database
    // constraint itself has to answer.
    let thrown: unknown = null;
    try {
      await tx.role.create({
        data: {
          organizationId: fixture.organizationId,
          name,
          code: `P151DUP_${RUN}_${fixture.organizationId}`,
        },
      });
    } catch (error) {
      thrown = error;
    }

    const mapped = thrown ? mapRoleWriteConflict(thrown) : null;
    const api = mapped ? toSafeApiError(mapped, "Gagal membuat role.") : null;

    return {
      firstCode: first.code,
      threw: thrown !== null,
      errorCode: codeOf(thrown),
      target: targetOf(thrown),
      mappedStatus: mapped ? mapped.statusCode : null,
      mappedMessage: mapped ? mapped.message : null,
      apiStatus: api ? api.status : null,
      apiCode: api ? api.body.code : null,
    };
  });

  if (!outcome.value) {
    reportProbeFailure(group, outcome.error);
    return;
  }
  const value = outcome.value;
  check(group, "duplicate (organizationId,name) was rejected by PostgreSQL", value.threw);
  check(
    group,
    "PostgreSQL error code is P2002",
    value.errorCode === "P2002",
    `code=${value.errorCode}`
  );
  check(
    group,
    "constraint target is the composite (organizationId,name) index",
    value.target.includes("organizationId") && value.target.includes("name"),
    `target=${value.target}`
  );
  check(
    group,
    "mapRoleWriteConflict converted the live P2002 into 409",
    value.mappedStatus === 409,
    `status=${value.mappedStatus}`
  );
  check(
    group,
    "API error boundary returns HTTP 409 / CONFLICT (no Prisma detail)",
    value.apiStatus === 409 && value.apiCode === "CONFLICT",
    `status=${value.apiStatus} code=${value.apiCode}`
  );
  check(
    group,
    "mapped message is the tenant-safe duplicate-name message",
    typeof value.mappedMessage === "string" &&
      value.mappedMessage.includes("sudah ada di organisasi ini"),
    `message=${value.mappedMessage ?? "none"}`
  );
}

async function probeServiceDuplicateAndCrossTenant(): Promise<void> {
  const group = "2b. Service path: duplicate 409, same name in another tenant allowed";
  const name = probeRoleName("scoped");
  const outcome = await probe(group, async (tx) => {
    const tenantA = await makeTenant(tx, "scopeA");
    const roleA = await createProbeRole(tx, tenantA, name);

    const tenantB = await makeTenant(tx, "scopeB");
    let crossTenantError: unknown = null;
    let roleB: RoleView | null = null;
    try {
      roleB = await createProbeRole(tx, tenantB, name);
    } catch (error) {
      crossTenantError = error;
    }

    let duplicateError: unknown = null;
    try {
      await createProbeRole(tx, tenantA, name);
    } catch (error) {
      duplicateError = error;
    }

    return {
      roleACode: roleA.code,
      roleBId: roleB ? roleB.id : null,
      roleBCode: roleB ? roleB.code : null,
      crossTenantErrorStatus: statusOf(crossTenantError),
      duplicateStatus: statusOf(duplicateError),
      duplicateIsRoleError: duplicateError instanceof RoleManagementError,
      api: toSafeApiError(duplicateError, "Gagal membuat role."),
    };
  });

  if (!outcome.value) {
    reportProbeFailure(group, outcome.error);
    return;
  }
  const value = outcome.value;
  check(
    group,
    "duplicate name inside one tenant answers 409 through the real service path",
    value.duplicateIsRoleError && value.duplicateStatus === 409,
    `status=${value.duplicateStatus}`
  );
  check(
    group,
    "the duplicate answer reaches the client as HTTP 409 / CONFLICT",
    value.api.status === 409 && value.api.body.code === "CONFLICT",
    `status=${value.api.status} code=${value.api.body.code}`
  );
  check(
    group,
    "the same name in a DIFFERENT tenant is accepted (uniqueness is tenant-scoped)",
    value.roleBId !== null && value.crossTenantErrorStatus === -1,
    `roleB=${value.roleBId ? "created" : "rejected"} status=${value.crossTenantErrorStatus}`
  );
  check(
    group,
    "both roles kept a distinct globally unique code",
    typeof value.roleBCode === "string" && value.roleBCode !== value.roleACode,
    `codes=${value.roleACode} / ${value.roleBCode}`
  );
}

async function probeRealUniqueCode(): Promise<void> {
  const group = "2c. Role.code @unique → P2002 → 409";
  const outcome = await probe(group, async (tx) => {
    const tenantA = await makeTenant(tx, "codeA");
    const roleA = await createProbeRole(tx, tenantA, probeRoleName("codeA"));

    const tenantB = await makeTenant(tx, "codeB");
    let thrown: unknown = null;
    try {
      await tx.role.create({
        data: {
          organizationId: tenantB.organizationId,
          name: probeRoleName("codeB"),
          code: roleA.code,
        },
      });
    } catch (error) {
      thrown = error;
    }

    const mapped = thrown ? mapRoleWriteConflict(thrown) : null;
    return {
      threw: thrown !== null,
      errorCode: codeOf(thrown),
      target: targetOf(thrown),
      mappedStatus: mapped ? mapped.statusCode : null,
      mappedMessage: mapped ? mapped.message : null,
    };
  });

  if (!outcome.value) {
    reportProbeFailure(group, outcome.error);
    return;
  }
  const value = outcome.value;
  check(group, "reusing an existing code was rejected by PostgreSQL", value.threw);
  check(group, "PostgreSQL error code is P2002", value.errorCode === "P2002", `code=${value.errorCode}`);
  check(group, "constraint target is Role.code", value.target.includes("code"), `target=${value.target}`);
  check(
    group,
    "mapper resolves the code conflict to 409 with the code-specific message",
    value.mappedStatus === 409 && value.mappedMessage === "Kode role sudah digunakan.",
    `status=${value.mappedStatus} message=${value.mappedMessage ?? "none"}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADDITIONAL AUTHORITY GUARD — a REAL RolePermission grant blocks deletion
// (the Permission catalog row itself is only ever READ)
// ─────────────────────────────────────────────────────────────────────────────

async function probePermissionGrantBlocksDeletion(): Promise<void> {
  const group = "3. RolePermission grant blocks deletion";
  const outcome = await probe(group, async (tx) => {
    const fixture = await makeTenant(tx, "grant");
    const role = await createProbeRole(tx, fixture, probeRoleName("grant"));

    const permission = await tx.permission.findFirst({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });
    if (!permission) {
      return { skipped: true as const, permissionName: null };
    }

    const catalogBefore = await tx.permission.findUnique({
      where: { id: permission.id },
      select: { id: true, name: true },
    });

    await tx.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id },
    });

    let thrown: unknown = null;
    try {
      await deleteTenantRole({ tx, context: fixture.context, roleId: role.id });
    } catch (error) {
      thrown = error;
    }

    const catalogAfter = await tx.permission.findUnique({
      where: { id: permission.id },
      select: { id: true, name: true },
    });

    const state = {
      skipped: false as const,
      permissionName: permission.name,
      catalogUnchanged:
        JSON.stringify(catalogBefore) === JSON.stringify(catalogAfter) &&
        (await tx.permission.count({ where: { id: permission.id } })) === 1,
      thrownStatus: statusOf(thrown),
      thrownMessage: thrown instanceof Error ? thrown.message : null,
      api: toSafeApiError(thrown, "Gagal menghapus role."),
      roleRowsWhileBlocked: await tx.role.count({ where: { id: role.id } }),
      grantRowsWhileBlocked: await tx.rolePermission.count({ where: { roleId: role.id } }),
      auditRowsWhileBlocked: await tx.auditLog.count({
        where: { entityId: role.id, action: "ROLE_DELETED" },
      }),
    };

    // Release the grant: the refusal must lift, proving it is reference-driven.
    await tx.rolePermission.delete({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
    });
    let releaseError: unknown = null;
    try {
      await deleteTenantRole({ tx, context: fixture.context, roleId: role.id });
    } catch (error) {
      releaseError = error;
    }

    return {
      ...state,
      roleRowsAfterRelease: await tx.role.count({ where: { id: role.id } }),
      releaseErrorStatus: statusOf(releaseError),
      auditRowsAfterRelease: await tx.auditLog.count({
        where: { entityId: role.id, action: "ROLE_DELETED" },
      }),
    };
  });

  if (!outcome.value) {
    reportProbeFailure(group, outcome.error);
    return;
  }
  const value = outcome.value;
  if (value.skipped || !("thrownStatus" in value)) {
    note(`${group}: SKIPPED — the Permission catalog is empty, nothing to reference.`);
    return;
  }
  check(
    group,
    "delete refused with 409 while a real RolePermission grant exists",
    value.thrownStatus === 409,
    `status=${value.thrownStatus} permission=${value.permissionName ?? "?"}`
  );
  check(
    group,
    "refusal is the PERMISSION_GRANTS blocker message",
    typeof value.thrownMessage === "string" && value.thrownMessage.includes("grant permission"),
    `message=${value.thrownMessage ?? "none"}`
  );
  check(
    group,
    "API boundary answers HTTP 409 / CONFLICT",
    value.api.status === 409 && value.api.body.code === "CONFLICT",
    `status=${value.api.status}`
  );
  check(
    group,
    "role and grant rows intact, no ROLE_DELETED audit written",
    value.roleRowsWhileBlocked === 1 && value.grantRowsWhileBlocked === 1 && value.auditRowsWhileBlocked === 0
  );
  check(
    group,
    "the referenced Permission catalog row was not modified",
    value.catalogUnchanged
  );
  check(
    group,
    "delete succeeds after the grant is released",
    value.releaseErrorStatus === -1 &&
      value.roleRowsAfterRelease === 0 &&
      value.auditRowsAfterRelease === 1,
    `status=${value.releaseErrorStatus} roleRows=${value.roleRowsAfterRelease}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RUN
// ─────────────────────────────────────────────────────────────────────────────

async function preflight(): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
  check("0. Preflight", "live PostgreSQL reachable", Array.isArray(rows) && rows[0].ok === 1);

  let interactive = true;
  let failure = "";
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1`;
      throw new RollbackSignal();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) {
      interactive = false;
      failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }
  }
  check(
    "0. Preflight",
    "interactive transaction + rollback supported by the configured connection",
    interactive,
    interactive ? undefined : failure
  );
  if (!interactive) return false;

  const catalog = await prisma.permission.count();
  note(`Permission catalog rows present (read-only, never written): ${catalog}`);
  return true;
}

async function main(): Promise<number> {
  log("HANSAN — PHASE 15.1 · LIVE PostgreSQL VERIFICATION (tenant role management)");
  log(`run marker ${RUN} · every write lives inside a transaction that is ALWAYS rolled back`);
  log(
    `DATABASE_URL present=${Boolean(process.env.DATABASE_URL)} · DIRECT_URL present=${Boolean(
      process.env.DIRECT_URL
    )} (values never printed)`
  );

  await prisma.$connect();
  if (!(await preflight())) {
    log("BLOCKED: the configured connection cannot run a rollback-only transaction.");
    return 2;
  }

  const before = await snapshot();
  printSnapshot("BEFORE", before);
  log("");

  await probeStaffRoleBlocksDeletion();
  log("");
  await probeDeleteAllowedAfterRelease();
  log("");
  await probeCascadeHazard();
  log("");
  await probeRealUniqueName();
  log("");
  await probeServiceDuplicateAndCrossTenant();
  log("");
  await probeRealUniqueCode();
  log("");
  await probePermissionGrantBlocksDeletion();
  log("");

  const after = await snapshot();
  printSnapshot("AFTER ", after);
  log("");
  compareSnapshots(before, after);
  await scanLeftovers();
  check("4. Cleanup", "no probe transaction ever committed", !unexpectedCommit);
  await emergencyCleanup();

  const failed = CHECKS.filter((entry) => !entry.ok);
  log("");
  log(`RESULT checks=${CHECKS.length} passed=${CHECKS.length - failed.length} failed=${failed.length}`);
  for (const entry of failed) {
    log(`  FAILED  ${entry.group} :: ${entry.name}${entry.detail ? `  [${entry.detail}]` : ""}`);
  }
  return failed.length === 0 ? 0 : 1;
}

main()
  .then(async (code) => {
    await prisma.$disconnect().catch(() => undefined);
    process.exit(code);
  })
  .catch(async (error) => {
    log(`UNHANDLED ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
    await emergencyCleanup().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
