// Relative imports on purpose: this module is loaded directly by the node:test
// suite, which does not resolve the `@/` path alias.
import {
  PERMISSION,
  requirePermissionDefinition,
  type PermissionDefinition,
} from "./permissions";
import {
  decideReservedRoleName,
  normalizeRoleNameKey,
  roleCodeFromRoleName,
} from "./role-management";

/**
 * HANSAN — standard tenant role templates (Phase 16, R1).
 *
 * WHY THIS MODULE EXISTS
 *   POST /api/auth/provision grants the OWNER role exactly four permissions
 *   (owner.hq.manage, settings.manage, orders.read, orders.create) and no other
 *   tenant role ever existed. That made every newly created staff member an
 *   OWNER — least privilege was unreachable and an honest non-OWNER POS smoke
 *   test impossible. This module is the smallest safe fix: a deterministic,
 *   centralized set of STANDARD TENANT ROLE TEMPLATES that tenant provisioning
 *   seeds into the new organization, in the same transaction that creates the
 *   OWNER role.
 *
 * WHAT THIS IS NOT
 *   - Not a RolePermission editor and not a permission-management UI.
 *   - Not a way to grant OWNER anything: the OWNER role and its grants are
 *     created by /api/auth/provision exactly as before and are never touched by
 *     the code below.
 *   - Not custom permissions: every grant is a name from the canonical catalog
 *     (src/lib/permissions.ts). A template whose grant is not canonical makes
 *     import fail loudly (PermissionCatalogError) instead of shipping a role
 *     that may silently grant nothing.
 *
 * GRANT POLICY — IMPLEMENTED WORKFLOWS ONLY
 *   A standard role receives only canonical permissions that a currently
 *   implemented, reachable workflow enforces:
 *     - orders.read   : /api/menu (GET) and /api/orders (GET) — the POS
 *     - orders.create : /api/orders (POST) — the POS
 *   MANAGER and CASHIER therefore receive exactly those two. KITCHEN, BAR,
 *   FINANCE and STAFF receive no grants yet: their workflows (KDS, beverage
 *   station, finance) have no reachable implementation, and inventing grants
 *   for unimplemented features would be fabrication. They are still assignable
 *   so org structure is real, and a later phase can extend grants through role
 *   management once those workflows exist.
 *
 * TENANT SAFETY
 *   - Every seeded role belongs to the provisioning organization that is passed
 *     in; the executor below always writes that organization id (never a
 *     request value) and `isPlatform: false` (a literal — `true` is
 *     unrepresentable).
 *   - Codes follow the same `<NAME>_<organizationId>` convention as
 *     /api/auth/provision and role-management.ts, reusing
 *     roleCodeFromRoleName; codes are therefore globally unique by construction
 *     (Role.code is globally unique) and can never collide across tenants.
 *   - Template names are validated against the reserved-name guard so a
 *     template can never claim a platform/developer name or re-create OWNER.
 *   - Nothing here can create a DeveloperAccess row: the transaction client
 *     type below exposes only Permission / Role / RolePermission writes.
 *
 * REPLAY SAFETY
 *   Plan first, then write, always keyed on the organization-scoped existence
 *   check. An organization that already has a standard role KEEPS the existing
 *   row and its id and grants — it is never duplicated, updated or deleted.
 */

export class TenantRoleTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantRoleTemplateError";
  }
}

export type TenantRoleTemplate = {
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly PermissionDefinition[];
};

/**
 * The template table. This is the ONLY place standard tenant role names and
 * their grants are defined — routes, services and provisioning all consume it,
 * never re-declare permission strings.
 */
type TenantRoleTemplateSpec = {
  readonly name: string;
  readonly description: string;
  readonly permissionNames: readonly string[];
};

const TEMPLATE_SPECS: readonly TenantRoleTemplateSpec[] = Object.freeze([
  {
    name: "MANAGER",
    description:
      "Outlet manager: runs day-to-day operations and can operate the POS",
    permissionNames: Object.freeze([PERMISSION.ORDERS_READ, PERMISSION.ORDERS_CREATE]),
  },
  {
    name: "CASHIER",
    description: "Cashier: operates the POS to take orders at the counter",
    permissionNames: Object.freeze([PERMISSION.ORDERS_READ, PERMISSION.ORDERS_CREATE]),
  },
  {
    name: "KITCHEN",
    description:
      "Kitchen crew: receives and prepares kitchen tickets (KDS workflow not yet implemented)",
    permissionNames: Object.freeze([]),
  },
  {
    name: "BAR",
    description:
      "Bar crew: receives and prepares beverage tickets (beverage station workflow not yet implemented)",
    permissionNames: Object.freeze([]),
  },
  {
    name: "FINANCE",
    description: "Finance officer: financial workflows are not yet implemented",
    permissionNames: Object.freeze([]),
  },
  {
    name: "STAFF",
    description: "General staff: no elevated capability until a later phase grants one",
    permissionNames: Object.freeze([]),
  },
] as const satisfies readonly TenantRoleTemplateSpec[]);

/**
 * Resolves grant names against the canonical catalog.
 *
 * Exported so tests can prove the guard: an unknown or non-canonical name
 * throws PermissionCatalogError instead of being shipped as a grant. A grant
 * the catalog does not recognize would resolve to nothing at session time
 * (see resolveCanonicalGrantPermissions), so failing at import time is the only
 * honest outcome.
 */
export function assertCanonicalPermissionNames(
  names: readonly string[]
): readonly PermissionDefinition[] {
  return Object.freeze(names.map((name) => requirePermissionDefinition(name)));
}

/** A template name may never be OWNER or a reserved platform/developer name. */
function assertTemplateRoleName(name: string): string {
  const verdict = decideReservedRoleName(name);
  if (!verdict.ok) {
    // Defective configuration, not a client error: throw loudly at import.
    throw new TenantRoleTemplateError(
      `Standard role template name "${name}" is reserved: ${verdict.message}`
    );
  }
  return name;
}

function buildTemplate(spec: TenantRoleTemplateSpec): TenantRoleTemplate {
  return Object.freeze({
    name: assertTemplateRoleName(spec.name),
    description: spec.description,
    permissions: assertCanonicalPermissionNames(spec.permissionNames),
  });
}

/** Every standard tenant role template, in deterministic creation order. */
export const TENANT_ROLE_TEMPLATES: readonly TenantRoleTemplate[] = Object.freeze(
  TEMPLATE_SPECS.map(buildTemplate)
);

// Defective configuration guard: names must be unique after normalization.
{
  const keys = TENANT_ROLE_TEMPLATES.map((template) => normalizeRoleNameKey(template.name));
  if (new Set(keys).size !== keys.length) {
    throw new TenantRoleTemplateError("Standard role template names must be unique.");
  }
}

/** Template names in creation order (MANAGER, CASHIER, KITCHEN, BAR, FINANCE, STAFF). */
export const STANDARD_TENANT_ROLE_NAMES: readonly string[] = Object.freeze(
  TENANT_ROLE_TEMPLATES.map((template) => template.name)
);

/** Exact, case-sensitive template lookup by name. Null for a non-standard name. */
export function getTenantRoleTemplate(name: unknown): TenantRoleTemplate | null {
  if (typeof name !== "string") {
    return null;
  }
  return TENANT_ROLE_TEMPLATES.find((template) => template.name === name) ?? null;
}

/** Whether a name is one of the standard tenant role templates. */
export function isStandardTenantRoleName(name: unknown): boolean {
  return getTenantRoleTemplate(name) !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED PLANNING (pure) + TRANSACTION-SCOPED SEEDING (tx injected)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The complete row a seeded standard role write may produce. `organizationId`
 * is the provisioning organization and `isPlatform` is literal false, so no
 * code path here can create a platform role or seed into another tenant.
 */
export type StandardRoleSeed = {
  readonly name: string;
  readonly description: string;
  readonly code: string;
  readonly permissionNames: readonly string[];
};

export function buildStandardRoleSeed(
  template: TenantRoleTemplate,
  organizationId: string
): StandardRoleSeed {
  if (typeof organizationId !== "string" || !organizationId.trim()) {
    throw new TenantRoleTemplateError(
      "organizationId is required to seed standard tenant roles."
    );
  }
  return Object.freeze({
    name: template.name,
    description: template.description,
    code: roleCodeFromRoleName(template.name, organizationId),
    permissionNames: Object.freeze(
      template.permissions.map((permission) => permission.name)
    ),
  });
}

export type StandardRoleSeedPlan = {
  /** Templates that do not exist yet for this organization, in template order. */
  readonly toCreate: readonly StandardRoleSeed[];
  /** Template names that already exist for this organization — never rewritten. */
  readonly existingRoleNames: readonly string[];
};

/**
 * Pure plan: which standard roles are missing for this organization.
 *
 * Names are compared with normalizeRoleNameKey, the same key role-management.ts
 * uses, so casing can never produce a duplicate row.
 */
export function planStandardRoleSeeding(params: {
  organizationId: string;
  existingRoleNames: readonly string[];
}): StandardRoleSeedPlan {
  const existingKeys = new Set(
    params.existingRoleNames.map((name) => normalizeRoleNameKey(name))
  );

  const toCreate: StandardRoleSeed[] = [];
  const existingRoleNames: string[] = [];

  for (const template of TENANT_ROLE_TEMPLATES) {
    if (existingKeys.has(normalizeRoleNameKey(template.name))) {
      existingRoleNames.push(template.name);
      continue;
    }
    toCreate.push(buildStandardRoleSeed(template, params.organizationId));
  }

  return Object.freeze({
    toCreate: Object.freeze(toCreate),
    existingRoleNames: Object.freeze(existingRoleNames),
  });
}

/**
 * The transaction surface the seeding writes through. Deliberately minimal:
 * Permission read/create (canonical rows are expected to exist already — the
 * reference-data migration ships them — the create is the same fallback
 * /api/auth/provision has always used for OWNER), Role read/create, and
 * RolePermission bulk create. There is no DeveloperAccess, StaffRole or
 * platform-write capability in this type, so seeding cannot create one.
 */
export type StandardRoleSeedTxClient = {
  permission: {
    findUnique(args: {
      where: { name: string };
    }): Promise<{ id: string; name: string } | null>;
    create(args: {
      data: { name: string; description: string | null };
    }): Promise<{ id: string; name: string }>;
  };
  role: {
    findFirst(args: {
      where: { organizationId: string; name: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    create(args: {
      data: {
        organizationId: string;
        name: string;
        code: string;
        description: string;
        isPlatform: false;
      };
      select: { id: true; name: true };
    }): Promise<{ id: string; name: string }>;
  };
  rolePermission: {
    createMany(args: {
      data: Array<{ roleId: string; permissionId: string }>;
      skipDuplicates: true;
    }): Promise<unknown>;
  };
};

export type StandardRoleSeedResult = {
  /** Names of the roles this call created (empty on a full replay). */
  readonly createdRoleNames: readonly string[];
  /** Factual record of what was created, for the caller's audit/response. */
  readonly createdRoles: ReadonlyArray<{
    name: string;
    code: string;
    permissionNames: readonly string[];
  }>;
  /** Standard roles that already existed and were left untouched. */
  readonly existingRoleNames: readonly string[];
};

/**
 * Seeds the standard tenant roles for one organization inside the CALLER's
 * transaction (tenant provisioning wraps this in its own $transaction).
 *
 * - Existence is always checked per organization (`where.organizationId`), so a
 *   role in another tenant with the same name can never satisfy or block this
 *   tenant, and an existing row is never duplicated, updated or deleted.
 * - Grants resolve through the canonical catalog (requirePermissionDefinition)
 *   before any Permission row is touched.
 * - Call with `existingRoleNames` when the caller already loaded them; otherwise
 *   the organization-scoped existence check runs here.
 */
export async function seedStandardTenantRoles(params: {
  tx: StandardRoleSeedTxClient;
  organizationId: string;
  existingRoleNames?: readonly string[];
}): Promise<StandardRoleSeedResult> {
  const { tx, organizationId } = params;

  const existingRoleNames = params.existingRoleNames
    ? [...params.existingRoleNames]
    : await findExistingStandardRoleNames(tx, organizationId);

  const plan = planStandardRoleSeeding({ organizationId, existingRoleNames });

  const createdRoles: Array<{
    name: string;
    code: string;
    permissionNames: readonly string[];
  }> = [];

  for (const seed of plan.toCreate) {
    const permissionRecords = await ensurePermissionRecords(tx, seed.permissionNames);

    const role = await tx.role.create({
      data: {
        organizationId,
        name: seed.name,
        code: seed.code,
        description: seed.description,
        isPlatform: false,
      },
      select: { id: true, name: true },
    });

    if (permissionRecords.length > 0) {
      await tx.rolePermission.createMany({
        data: permissionRecords.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });
    }

    createdRoles.push({
      name: role.name,
      code: seed.code,
      permissionNames: seed.permissionNames,
    });
  }

  return {
    createdRoleNames: Object.freeze(createdRoles.map((role) => role.name)),
    createdRoles: Object.freeze(createdRoles),
    existingRoleNames: plan.existingRoleNames,
  };
}

/** Organization-scoped existence check, one query per template (6 total). */
async function findExistingStandardRoleNames(
  tx: StandardRoleSeedTxClient,
  organizationId: string
): Promise<string[]> {
  const found: string[] = [];
  for (const template of TENANT_ROLE_TEMPLATES) {
    const existing = await tx.role.findFirst({
      where: { organizationId, name: template.name },
      select: { id: true },
    });
    if (existing) {
      found.push(template.name);
    }
  }
  return found;
}

/**
 * Finds or creates the canonical Permission rows for a seed's grants.
 * Mirrors the fallback /api/auth/provision has always used for OWNER: the
 * reference-data migration is expected to have inserted every row already, so
 * the create is a recovery path and never re-defines vocabulary — the name and
 * description come from the catalog, not from a caller.
 */
async function ensurePermissionRecords(
  tx: StandardRoleSeedTxClient,
  permissionNames: readonly string[]
): Promise<Array<{ id: string; name: string }>> {
  const records: Array<{ id: string; name: string }> = [];

  for (const name of permissionNames) {
    const definition = requirePermissionDefinition(name);

    const existing = await tx.permission.findUnique({
      where: { name: definition.name },
    });
    if (existing) {
      records.push(existing);
      continue;
    }

    records.push(
      await tx.permission.create({
        data: { name: definition.name, description: definition.description },
      })
    );
  }

  return records;
}

