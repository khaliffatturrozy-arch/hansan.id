// Relative imports on purpose: this module is loaded directly by the node:test
// suite, which does not resolve the `@/` path alias.
import {
  PLATFORM_ROLE_NAMES,
  requireOrganization,
  requirePermission,
  requireStaff,
  type AuthenticatedStaffContext,
} from "./auth";
import { PERMISSION } from "./permissions";

/**
 * HANSAN — tenant role management rules (PURE + transaction-scoped service).
 *
 * Backs /api/roles. Same shape the developer-lifecycle module proved: pure
 * deciders carry no Prisma, Supabase or Next.js import and are loadable by the
 * node:test runner; the service functions receive their transaction client as a
 * parameter, so the whole flow (guard → decision → conditional write → audit) is
 * unit-testable offline against a fake tx.
 *
 * SECURITY CONTRACT
 * - `organizationId` and `isPlatform` are NEVER read from a request body as
 *   authority. A created role is always `{ organizationId: <authenticated staff
 *   organization>, isPlatform: false }`; the return type of
 *   buildTenantRoleCreateData makes any other combination unrepresentable.
 * - Target roles are resolved by id and then proven to belong to the caller's
 *   organization. Another tenant's id and an unknown id produce the identical
 *   404, so the API is not an existence oracle across tenants.
 * - `code` is server-generated (see roleCodeFromRoleName) and immutable: client
 *   codes are rejected outright, which is what keeps global `Role.code`
 *   uniqueness and the `OWNER_<organizationId>` convention intact.
 * - The canonical OWNER role of an organization is immutable and undeletable
 *   through this surface (409), and a tenant can never claim a reserved
 *   platform/developer role name (403) — see decideReservedRoleName for why that
 *   is an escalation guard, not cosmetics.
 * - Deletion is refused while the role is still referenced (StaffRole
 *   assignments, RolePermission grants). Nothing here cascades authorization
 *   away from a staff member, and no grant the caller cannot see is destroyed.
 * - This phase implements ROLE CRUD only. RolePermission and StaffRole are
 *   read-only here: they are counted and listed, never written.
 * - Permission vocabulary is imported from the frozen catalog
 *   (src/lib/permissions.ts) and never extended.
 */

export class RoleManagementError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "RoleManagementError";
    this.statusCode = statusCode;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OPERATIONS → CANONICAL PERMISSIONS
// ─────────────────────────────────────────────────────────────────────────────

export const ROLE_OPERATIONS = ["read", "create", "update", "delete"] as const;
export type RoleOperation = (typeof ROLE_OPERATIONS)[number];

/**
 * The operation → permission map. Every value is an existing canonical
 * permission name; no alternative or new vocabulary is introduced by this phase.
 */
export const ROLE_OPERATION_PERMISSIONS: Readonly<Record<RoleOperation, string>> = Object.freeze({
  read: PERMISSION.ROLES_READ,
  create: PERMISSION.ROLES_CREATE,
  update: PERMISSION.ROLES_UPDATE,
  delete: PERMISSION.ROLES_DELETE,
});

export function rolePermissionForOperation(operation: RoleOperation): string {
  const permission = ROLE_OPERATION_PERMISSIONS[operation];
  if (!permission) {
    // Unreachable through the routes (the operation is a literal per handler).
    // Fail loud rather than default to a permissive check.
    throw new RoleManagementError(`Unknown role management operation.`, 500);
  }
  return permission;
}

/**
 * The authorization gate every role-management operation passes through, reusing
 * the canonical guards in src/lib/auth.ts:
 *   1. ACTIVE staff            — a deactivated or suspended account is refused
 *   2. organization context    — a staff record without one can act on nothing
 *   3. canonical roles.* grant — from the session's RolePermission-derived set
 *
 * Returns the organization id the caller is allowed to act within; it is the
 * ONLY organization value any writer in this module ever uses.
 */
export function assertRoleOperation(
  context: AuthenticatedStaffContext,
  operation: RoleOperation
): string {
  requireStaff(context);
  const organizationId = requireOrganization(context);
  requirePermission(context, rolePermissionForOperation(operation));
  return organizationId;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTED + RESERVED ROLE IDENTITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The OWNER role of an organization. Its identity in the current implementation
 * is the role NAME, not an id: /api/auth/provision creates
 * `{ name: "OWNER", code: OWNER_<orgId>, isPlatform: false }`,
 * resolveCanonicalRoleName() promotes the name, /api/staff warns on it, and
 * @@unique([organizationId, name]) means an organization holds exactly one.
 * Those invariants are preserved, not reinvented: the OWNER role is never
 * renamed, re-described, deleted or replaced through tenant role management.
 */
export const PROTECTED_TENANT_ROLE_NAME = "OWNER";

/** Mirrors the code convention established by /api/auth/provision. */
export function ownerRoleCodeOf(organizationId: string): string {
  return `${PROTECTED_TENANT_ROLE_NAME}_${organizationId}`;
}

/** `Barista Bar` / `barista-bar` → `BARISTA_BAR`; the comparison key for names. */
export function normalizeRoleNameKey(name: unknown): string {
  if (typeof name !== "string") {
    return "";
  }
  return name
    .trim()
    .toUpperCase()
    .replace(/[\s\-–—]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Whether a role row IS the organization's protected OWNER role. Both the name
 * and the provisioning code are checked, so a row cannot escape protection by
 * having drifted from the code convention.
 */
export function isProtectedTenantRole(role: {
  name: string;
  code: string;
  organizationId?: string | null;
}): boolean {
  if (normalizeRoleNameKey(role.name) === PROTECTED_TENANT_ROLE_NAME) {
    return true;
  }
  return Boolean(role.organizationId && role.code === ownerRoleCodeOf(role.organizationId));
}

/**
 * Names a tenant may never own.
 *
 * This is an escalation guard, not tidiness: resolveCanonicalRoleName() treats
 * `PLATFORM_ADMIN` / `PLATFORM_DEVELOPER` / `PLATFORM_SUPPORT` as platform
 * authority, and `developer.*` / `platform.*` / `admin.*` authorities live
 * outside the tenant permission catalog entirely (NON_CATALOG_PERMISSION_PREFIXES).
 * A tenant-created role carrying one of those names would let a tenant writer
 * mint platform/developer authority out of a tenant role row. Refused with 403 so
 * the denial reads as an authority boundary, not as a form validation error.
 */
const RESERVED_PLATFORM_NAME_PREFIXES = ["PLATFORM", "DEVELOPER", "SUPER_"] as const;
const RESERVED_PLATFORM_EXACT_NAMES: readonly string[] = [
  "ADMIN",
  "SUPERADMIN",
  "DEVELOPER",
  "PLATFORM",
  ...PLATFORM_ROLE_NAMES,
];

export type ReservedRoleNameVerdict =
  | { ok: true }
  | { ok: false; status: 403 | 409; message: string };

export function decideReservedRoleName(rawName: string): ReservedRoleNameVerdict {
  const key = normalizeRoleNameKey(rawName);

  if (key === PROTECTED_TENANT_ROLE_NAME) {
    return {
      ok: false,
      status: 409,
      message:
        "Nama role OWNER dilindungi. Role OWNER organisasi sudah ada dan tidak dapat dibuat ulang.",
    };
  }

  const reserved =
    RESERVED_PLATFORM_EXACT_NAMES.includes(key) ||
    RESERVED_PLATFORM_NAME_PREFIXES.some((prefix) => key.startsWith(prefix));

  if (reserved) {
    return {
      ok: false,
      status: 403,
      message:
        "Nama role ini dicadangkan untuk otoritas platform/developer dan tidak dapat dibuat oleh tenant.",
    };
  }

  return { ok: true };
}

export function rejectReservedRoleName(rawName: string): string {
  const verdict = decideReservedRoleName(rawName);
  if (!verdict.ok) {
    throw new RoleManagementError(verdict.message, verdict.status);
  }
  return rawName;
}

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST PARSING (allowlist)
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_ROLE_NAME_LENGTH = 80;
export const MAX_ROLE_DESCRIPTION_LENGTH = 300;

/**
 * Body keys that carry authority or derived state and therefore have no writable
 * meaning on this API. They are REJECTED (not silently ignored): every one of
 * them is either derived from the authenticated session, generated by the server,
 * or owned by a later phase (RolePermission / StaffRole). Silently accepting them
 * would let a client believe it had granted itself a platform role.
 */
export const NON_WRITABLE_ROLE_FIELDS: readonly string[] = Object.freeze([
  "id",
  "roleId",
  "organizationId",
  "tenantId",
  "outletId",
  "isPlatform",
  "platform",
  "isSystem",
  "code",
  "permissions",
  "permissionIds",
  "permissionNames",
  "rolePermissions",
  "grants",
  "staffIds",
  "staffRoles",
  "userIds",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
]);

function rejectNonWritableFields(record: Record<string, unknown>): void {
  const offending = Object.keys(record).find((key) => NON_WRITABLE_ROLE_FIELDS.includes(key));
  if (offending) {
    throw new RoleManagementError(
      `Field "${offending}" tidak dapat diisi atau diubah melalui API role.`,
      400
    );
  }
}

function parseRoleName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RoleManagementError("name wajib diisi.", 400);
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_ROLE_NAME_LENGTH) {
    throw new RoleManagementError(
      `name tidak boleh melebihi ${MAX_ROLE_NAME_LENGTH} karakter.`,
      400
    );
  }
  // Reject before any write: reserved names are an authority boundary.
  rejectReservedRoleName(trimmed);
  return trimmed;
}

/** `undefined` = not supplied, `null` = explicit clear, string = set. */
function parseRoleDescription(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new RoleManagementError("description harus berupa teks atau null.", 400);
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_ROLE_DESCRIPTION_LENGTH) {
    throw new RoleManagementError(
      `description tidak boleh melebihi ${MAX_ROLE_DESCRIPTION_LENGTH} karakter.`,
      400
    );
  }
  return trimmed.length > 0 ? trimmed : null;
}

function asObjectRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RoleManagementError("Payload role tidak valid.", 400);
  }
  return body as Record<string, unknown>;
}

export type CreateRoleRequest = {
  name: string;
  description: string | null;
};

/**
 * Parses the ONLY business fields a tenant role needs: name + description.
 * Everything that carries authority is refused by rejectNonWritableFields.
 */
export function parseCreateRoleRequest(body: unknown): CreateRoleRequest {
  const record = asObjectRecord(body);
  rejectNonWritableFields(record);

  return {
    name: parseRoleName(record.name),
    description: parseRoleDescription(record.description) ?? null,
  };
}

export type UpdateRoleRequest = {
  name: string | null;
  description: string | null | undefined;
  /** Names of the fields the caller actually supplied; drives the no-op check. */
  suppliedFields: string[];
};

/** PATCH allowlist: `name` and `description`. Nothing else is mutable. */
export function parseUpdateRoleRequest(body: unknown): UpdateRoleRequest {
  const record = asObjectRecord(body);
  rejectNonWritableFields(record);

  const suppliedFields = Object.keys(record);
  if (suppliedFields.length === 0) {
    throw new RoleManagementError("Tidak ada perubahan yang diminta.", 400);
  }

  return {
    name: record.name === undefined ? null : parseRoleName(record.name),
    description: parseRoleDescription(record.description),
    suppliedFields,
  };
}

/**
 * Extracts the body's `organizationId` claim ONLY so the route can hand it to
 * requireProtectedRequest(), which compares it against the authenticated session
 * and denies a contradiction (403) before anything else is interpreted. The value
 * is never used as authority; the parsers reject the key outright, so a role is
 * never written into another organization.
 */
export function extractRoleOrganizationClaim(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return undefined;
  }
  return (body as Record<string, unknown>).organizationId;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLE CODE (server-generated, globally unique, immutable)
// ─────────────────────────────────────────────────────────────────────────────

const CODE_MAX_SLUG_LENGTH = 48;

/**
 * `MANAGER` + `cky1abc…` → `MANAGER_cky1abc…`.
 *
 * `Role.code` is globally UNIQUE (Role_code_key) — not tenant-scoped — so a bare
 * slug such as `MANAGER` would collide across organizations. Suffixing the
 * caller's organization id keeps codes globally unique by construction, mirrors
 * the `OWNER_<organizationId>` convention already produced by
 * /api/auth/provision, and makes it impossible for a tenant to claim another
 * tenant's (or a platform role's) code. Codes are never derived from client input
 * beyond the already-validated name, and are immutable after creation.
 */
export function roleCodeFromRoleName(name: string, organizationId: string): string {
  const slug = normalizeRoleNameKey(name)
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, CODE_MAX_SLUG_LENGTH)
    .replace(/_+$/g, "");

  if (!slug) {
    throw new RoleManagementError("Nama role tidak dapat dijadikan kode role.", 400);
  }
  return `${slug}_${organizationId}`;
}

export type TenantRoleCreateData = {
  organizationId: string;
  name: string;
  code: string;
  description: string | null;
  /** Literal false. `true` is unrepresentable here: see the security contract. */
  isPlatform: false;
};

/**
 * The complete row a tenant role write may produce. `organizationId` comes only
 * from the authenticated context and `isPlatform` is a literal, so no code path
 * in this phase can create a platform role or convert a tenant role into one.
 */
export function buildTenantRoleCreateData(
  organizationId: string,
  request: CreateRoleRequest
): TenantRoleCreateData {
  if (!organizationId) {
    throw new RoleManagementError("Konteks organisasi tidak tersedia.", 403);
  }
  return {
    organizationId,
    name: request.name,
    code: roleCodeFromRoleName(request.name, organizationId),
    description: request.description,
    isPlatform: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TARGET RESOLUTION (tenant isolation) + MUTATION GUARDS
// ─────────────────────────────────────────────────────────────────────────────

/** The columns every guard needs. Deliberately excludes any other tenant data. */
export type TenantRoleTarget = {
  id: string;
  organizationId: string | null;
  name: string;
  code: string;
  description: string | null;
  isPlatform: boolean;
};

export type RoleTargetAccess =
  | { ok: true; role: TenantRoleTarget }
  | { ok: false; status: number; message: string };

/**
 * Pure tenant-isolation decision for a role addressed by id.
 *
 * 404 is returned for BOTH an unknown id and another organization's id, with the
 * identical message, so this endpoint cannot be used to probe which role ids
 * exist in somebody else's tenant. A platform role answers 403 instead: it is not
 * another tenant's data, and the platform boundary is already an explicit 403 in
 * `requireRoleInOrganization` (/api/staff) — the same semantics are preserved.
 */
export function decideRoleTargetAccess(
  target: TenantRoleTarget | null,
  organizationId: string
): RoleTargetAccess {
  if (!target) {
    return { ok: false, status: 404, message: "Role tidak ditemukan." };
  }
  if (target.isPlatform) {
    return {
      ok: false,
      status: 403,
      message: "Role platform tidak dapat dikelola melalui API role tenant.",
    };
  }
  if (!organizationId || target.organizationId !== organizationId) {
    return { ok: false, status: 404, message: "Role tidak ditemukan." };
  }
  return { ok: true, role: target };
}

/** Narrowing gate: throws the mapped error, otherwise returns the owned role. */
export function requireTenantRoleTarget(
  target: TenantRoleTarget | null,
  organizationId: string
): TenantRoleTarget {
  const access = decideRoleTargetAccess(target, organizationId);
  if (!access.ok) {
    throw new RoleManagementError(access.message, access.status);
  }
  return access.role;
}

/**
 * OWNER invariants. Renaming or re-describing the OWNER role would change the
 * input that `resolveCanonicalRoleName`, `requireRole(context, "OWNER")`,
 * `assertCanManageStaff` and `/owner` already depend on, so any PATCH against it
 * is refused rather than partially applied. Deleting it would strand the
 * organization's own owner authority. Both answers are 409 (protected resource),
 * never 404: the caller legitimately owns this role, so there is no existence
 * secret to keep from them.
 */
export function rejectProtectedRoleMutation(role: TenantRoleTarget, action: "update" | "delete"): void {
  if (!isProtectedTenantRole(role)) {
    return;
  }
  throw new RoleManagementError(
    action === "delete"
      ? "Role OWNER adalah role pelindung organisasi dan tidak dapat dihapus."
      : "Role OWNER dilindungi dan tidak dapat diubah melalui manajemen role tenant.",
    409
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE PLAN (explicit mutable fields only, + audit diff)
// ─────────────────────────────────────────────────────────────────────────────

export type RoleUpdatePlan = {
  /** Columns to write. Never contains organizationId, isPlatform or code. */
  data: { name?: string; description?: string | null };
  changed: { name: boolean; description: boolean };
  before: { name: string; description: string | null };
  after: { name: string; description: string | null };
};

/**
 * Turns a parsed PATCH into the columns to write.
 *
 * A supplied value identical to the stored one is dropped, so an unchanged PATCH
 * writes nothing, claims no optimistic-concurrency slot and emits no audit row.
 * If nothing remains to write the request is a 400, never a silent success.
 */
export function planRoleUpdate(
  role: TenantRoleTarget,
  request: UpdateRoleRequest
): RoleUpdatePlan {
  const before = { name: role.name, description: role.description };

  const wantName = request.name !== null && request.name !== role.name;
  const wantDescription =
    request.description !== undefined && request.description !== role.description;

  if (!wantName && !wantDescription) {
    throw new RoleManagementError(
      "Tidak ada perubahan. Periksa kembali name atau description yang dikirim.",
      400
    );
  }

  const data: RoleUpdatePlan["data"] = {};
  if (wantName) {
    data.name = request.name as string;
  }
  if (wantDescription) {
    data.description = request.description as string | null;
  }

  return {
    data,
    changed: { name: wantName, description: wantDescription },
    before,
    after: {
      name: wantName ? (request.name as string) : role.name,
      description: wantDescription
        ? (request.description as string | null)
        : role.description,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETION SAFETY (no authorization cascade)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Why a role still cannot be deleted.
 *
 * `StaffRole.roleId` is declared `onDelete: Cascade`, so an unguarded DELETE
 * would silently remove staff assignments — i.e. revoke authorization as a side
 * effect of editing a label. That is exactly what these blockers exist to prevent.
 * `RolePermission` cascades too, so a role that still carries grants cannot be
 * dropped by a phase that has no permission editor: those grants would vanish
 * with no record of what the role was able to do.
 */
export type RoleDeletionBlocker = "STAFF_REFERENCES" | "PERMISSION_GRANTS";

export type RoleDeletionCounts = {
  staffReferences: number;
  permissionGrants: number;
};

export type RoleDeletionDecision =
  | { ok: true }
  | { ok: false; blocker: RoleDeletionBlocker; status: 409; message: string };

export function decideRoleDeletion(counts: RoleDeletionCounts): RoleDeletionDecision {
  if (counts.staffReferences > 0) {
    return {
      ok: false,
      blocker: "STAFF_REFERENCES",
      status: 409,
      message:
        "Role masih digunakan oleh staff. Lepaskan penugasan role tersebut terlebih dahulu.",
    };
  }
  if (counts.permissionGrants > 0) {
    return {
      ok: false,
      blocker: "PERMISSION_GRANTS",
      status: 409,
      message:
        "Role masih memiliki grant permission. Penghapusan role dengan permission belum tersedia pada fase ini.",
    };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE VIEW (permissions are read-only, derived from RolePermission only)
// ─────────────────────────────────────────────────────────────────────────────

/** Structural shape of the rows the data layer selects. */
export type RoleViewRow = {
  id: string;
  organizationId: string | null;
  name: string;
  code: string;
  description: string | null;
  isPlatform: boolean;
  createdAt: Date;
  permissions: Array<{ permission: { name: string; description: string | null } }>;
  _count: { staffRoles: number; permissions: number };
};

export type RoleView = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isPlatform: boolean;
  /** Derived (never stored): the canonical OWNER role cannot be mutated here. */
  isProtected: boolean;
  /** READ-ONLY inspection data, straight from RolePermission rows. */
  permissions: string[];
  permissionCount: number;
  assignedStaffCount: number;
  createdAt: string;
};

/**
 * Maps a selected role row to the API view.
 *
 * `permissions` is derived exclusively from RolePermission rows attached to that
 * role — it is inspection data, never authority: a session's authority is resolved
 * by src/lib/auth.ts through the canonical catalog, and nothing in this module
 * reads a permission name out of a response or a request as authority.
 */
export function toRoleView(row: RoleViewRow): RoleView {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    isPlatform: row.isPlatform,
    isProtected: isProtectedTenantRole(row),
    permissions: row.permissions.map((entry) => entry.permission.name),
    permissionCount: row._count.permissions,
    assignedStaffCount: row._count.staffRoles,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT
// ─────────────────────────────────────────────────────────────────────────────

export const ROLE_AUDIT_ENTITY_TYPE = "ROLE";

export type RoleAuditAction = "ROLE_CREATED" | "ROLE_UPDATED" | "ROLE_DELETED";

/**
 * Structural JSON vocabulary for the AuditLog.metadata column. Declared by shape
 * instead of `Record<string, unknown>` so an audit row stays assignable to the
 * real Prisma `Json` input without this pure module importing Prisma: an
 * `unknown` value is not provably JSON-serializable, this is.
 */
export type RoleAuditMetadata = {
  [key: string]: string | number | boolean | null | RoleAuditMetadata;
};

export type RoleAuditRecord = {
  actorStaffId: string;
  actorUserId: string;
  organizationId: string;
  outletId: string | null;
  entityType: string;
  entityId: string;
  action: RoleAuditAction;
  metadata: RoleAuditMetadata;
};

/**
 * Audit rows carry facts, never secrets: the role's own identity and the field
 * diff. Tenant fields come from the authenticated actor, mirroring
 * `buildDeveloperLifecycleAudit`, and state + audit are always written inside the
 * same transaction so neither can exist without the other.
 */
export function buildRoleAudit(params: {
  actorStaffId: string;
  actorUserId: string;
  organizationId: string;
  outletId: string | null;
  roleId: string;
  action: RoleAuditAction;
  metadata: RoleAuditMetadata;
}): RoleAuditRecord {
  return {
    actorStaffId: params.actorStaffId,
    actorUserId: params.actorUserId,
    organizationId: params.organizationId,
    outletId: params.outletId,
    entityType: ROLE_AUDIT_ENTITY_TYPE,
    entityId: params.roleId,
    action: params.action,
    metadata: params.metadata,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIQUE-CONSTRAINT MAPPING (database stays the final authority)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps a Prisma unique-constraint failure (P2002) to a deterministic 409.
 *
 * Duck-typed instead of importing Prisma so this file stays loadable by the
 * node:test runner. The database constraint is what actually guarantees
 * uniqueness — `Role_organizationId_name_key` (name per organization) and
 * `Role_code_key` (global code) — the pre-reads in the service only produce a
 * better message for the common case. No Prisma detail is ever forwarded:
 * `toSafeApiError` independently refuses to echo infrastructure wording.
 */
export function mapRoleWriteConflict(error: unknown): RoleManagementError | null {
  const candidate = error as { code?: unknown; meta?: { target?: unknown } } | null;
  if (!candidate || candidate.code !== "P2002") {
    return null;
  }
  const target = Array.isArray(candidate.meta?.target)
    ? (candidate.meta.target as unknown[]).join(",")
    : String(candidate.meta?.target ?? "");

  if (target.includes("code")) {
    return new RoleManagementError("Kode role sudah digunakan.", 409);
  }
  return new RoleManagementError(
    "Role dengan nama tersebut sudah ada di organisasi ini.",
    409
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SELECT SHAPES (shared by the read path and the write read-backs)
// ─────────────────────────────────────────────────────────────────────────────

/** Columns a mutation guard is allowed to see about a target role. */
export const ROLE_TARGET_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  code: true,
  description: true,
  isPlatform: true,
} as const;

/** Columns the API view needs. `_count` is read-only reference metadata. */
export const ROLE_VIEW_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  code: true,
  description: true,
  isPlatform: true,
  createdAt: true,
  permissions: { select: { permission: { select: { name: true, description: true } } } },
  _count: { select: { staffRoles: true, permissions: true } },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION-SCOPED SERVICES (caller owns prisma.$transaction; tx injected so
// the whole flow is unit-testable with a fake client and never imports Prisma)
// ─────────────────────────────────────────────────────────────────────────────

export type RoleWriteTxClient = {
  role: {
    findUnique(args: {
      where: { id: string };
      select: typeof ROLE_TARGET_SELECT;
    }): Promise<TenantRoleTarget | null>;
    findMany(args: {
      where: { id: string; organizationId: string };
      select: typeof ROLE_VIEW_SELECT;
      take: number;
    }): Promise<RoleViewRow[]>;
    findFirst(args: {
      where: { organizationId?: string; name?: string; code?: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    create(args: {
      data: TenantRoleCreateData;
      select: typeof ROLE_VIEW_SELECT;
    }): Promise<RoleViewRow>;
    updateMany(args: {
      where: { id: string; organizationId: string; isPlatform: false; name?: string };
      data: { name?: string; description?: string | null };
    }): Promise<{ count: number }>;
    deleteMany(args: {
      where: { id: string; organizationId: string; isPlatform: false };
    }): Promise<{ count: number }>;
  };
  staffRole: { count(args: { where: { roleId: string } }): Promise<number> };
  rolePermission: { count(args: { where: { roleId: string } }): Promise<number> };
  auditLog: { create(args: { data: RoleAuditRecord }): Promise<unknown> };
};

export type RoleActor = {
  staffId: string;
  userId: string;
  organizationId: string;
  outletId: string | null;
};

/** Actor columns an audit row needs; every one comes from the session context. */
function actorOf(context: AuthenticatedStaffContext): RoleActor {
  return {
    staffId: context.staffId,
    userId: context.userId,
    organizationId: context.organizationId,
    outletId: context.outletId ?? null,
  };
}

function auditContext(context: AuthenticatedStaffContext) {
  const actor = actorOf(context);
  return {
    actorStaffId: actor.staffId,
    actorUserId: actor.userId,
    organizationId: actor.organizationId,
    outletId: actor.outletId,
  };
}

/**
 * Creates one tenant role inside the caller's transaction.
 *
 * 1. buildTenantRoleCreateData — organizationId from the session, isPlatform false.
 * 2. Deterministic pre-reads for the two unique constraints, so the common
 *    duplicate returns a precise 409 instead of a mapped constraint failure. The
 *    database constraints remain the authority and are mapped as a fallback.
 * 3. Insert, then the audit row — same transaction, mutual rollback.
 */
export async function createTenantRole(params: {
  tx: RoleWriteTxClient;
  context: AuthenticatedStaffContext;
  request: CreateRoleRequest;
}): Promise<RoleView> {
  const { tx, context, request } = params;
  const organizationId = context.organizationId;
  const data = buildTenantRoleCreateData(organizationId, request);

  const duplicateName = await tx.role.findFirst({
    where: { organizationId, name: data.name },
    select: { id: true },
  });
  if (duplicateName) {
    throw new RoleManagementError(
      "Role dengan nama tersebut sudah ada di organisasi ini.",
      409
    );
  }

  const duplicateCode = await tx.role.findFirst({
    where: { code: data.code },
    select: { id: true },
  });
  if (duplicateCode) {
    throw new RoleManagementError("Kode role sudah digunakan.", 409);
  }

  let created: RoleViewRow;
  try {
    created = await tx.role.create({ data, select: ROLE_VIEW_SELECT });
  } catch (error) {
    throw mapRoleWriteConflict(error) ?? error;
  }

  await tx.auditLog.create({
    data: buildRoleAudit({
      ...auditContext(context),
      roleId: created.id,
      action: "ROLE_CREATED",
      metadata: {
        name: created.name,
        code: created.code,
        description: created.description,
        isPlatform: created.isPlatform,
      },
    }),
  });

  return toRoleView(created);
}

/**
 * Renames / re-describes one tenant role inside the caller's transaction.
 *
 * Guards run in this order and each one is a distinct, deterministic outcome:
 *   404 unknown id OR another organization's id (identical answer, no oracle)
 *   403 platform role
 *   409 protected OWNER role
 *   400 nothing actually changing
 *   409 lost the optimistic-concurrency race
 *   409 unique conflict (another role already took the name)
 * `where` pins the organization, the non-platform flag AND the name that was
 * observed, so a concurrent mutation cannot be overwritten by this one.
 */
export async function updateTenantRole(params: {
  tx: RoleWriteTxClient;
  context: AuthenticatedStaffContext;
  roleId: string;
  request: UpdateRoleRequest;
}): Promise<RoleView> {
  const { tx, context, roleId, request } = params;
  const organizationId = context.organizationId;

  const target = requireTenantRoleTarget(
    await tx.role.findUnique({ where: { id: roleId }, select: ROLE_TARGET_SELECT }),
    organizationId
  );
  rejectProtectedRoleMutation(target, "update");

  const plan = planRoleUpdate(target, request);

  try {
    const updated = await tx.role.updateMany({
      where: {
        id: target.id,
        organizationId,
        isPlatform: false,
        name: target.name,
      },
      data: plan.data,
    });
    if (updated.count !== 1) {
      throw new RoleManagementError(
        "Role berubah secara bersamaan. Muat ulang dan coba lagi.",
        409
      );
    }

    const [row] = await tx.role.findMany({
      where: { id: target.id, organizationId },
      select: ROLE_VIEW_SELECT,
      take: 1,
    });
    if (!row) {
      throw new RoleManagementError("Role tidak ditemukan.", 404);
    }

    await tx.auditLog.create({
      data: buildRoleAudit({
        ...auditContext(context),
        roleId: target.id,
        action: "ROLE_UPDATED",
        metadata: {
          changed: {
            name: plan.changed.name,
            description: plan.changed.description,
          },
          before: plan.before,
          after: plan.after,
          code: target.code,
        },
      }),
    });

    return toRoleView(row);
  } catch (error) {
    throw mapRoleWriteConflict(error) ?? error;
  }
}

/**
 * Deletes one unreferenced tenant role inside the caller's transaction.
 *
 * Refusal before mutation is the whole design: OWNER (409), platform role (403),
 * foreign tenant (404), still assigned to staff (409), still carrying permission
 * grants (409). `deleteMany` re-pins organization + isPlatform at the moment of
 * deletion, and the reference counts are taken inside the same transaction, so no
 * StaffRole assignment is ever cascade-removed by this code path.
 */
export async function deleteTenantRole(params: {
  tx: RoleWriteTxClient;
  context: AuthenticatedStaffContext;
  roleId: string;
}): Promise<{ id: string; name: string; code: string }> {
  const { tx, context, roleId } = params;
  const organizationId = context.organizationId;

  const target = requireTenantRoleTarget(
    await tx.role.findUnique({ where: { id: roleId }, select: ROLE_TARGET_SELECT }),
    organizationId
  );
  rejectProtectedRoleMutation(target, "delete");

  const decision = decideRoleDeletion({
    staffReferences: await tx.staffRole.count({ where: { roleId: target.id } }),
    permissionGrants: await tx.rolePermission.count({ where: { roleId: target.id } }),
  });
  if (!decision.ok) {
    throw new RoleManagementError(decision.message, decision.status);
  }

  const deleted = await tx.role.deleteMany({
    where: { id: target.id, organizationId, isPlatform: false },
  });
  if (deleted.count !== 1) {
    throw new RoleManagementError(
      "Role berubah secara bersamaan. Muat ulang dan coba lagi.",
      409
    );
  }

  await tx.auditLog.create({
    data: buildRoleAudit({
      ...auditContext(context),
      roleId: target.id,
      action: "ROLE_DELETED",
      metadata: {
        name: target.name,
        code: target.code,
        // Factual record of what the role could no longer do after deletion.
        permissionGrants: 0,
        staffReferences: 0,
      },
    }),
  });

  return { id: target.id, name: target.name, code: target.code };
}
