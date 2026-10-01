/**
 * HANSAN — Phase 15 tenant Role Management tests.
 *
 * Everything here runs against the REAL production modules (./role-management and,
 * through it, the canonical guards in ./auth and the frozen catalog in
 * ./permissions) with an injected fake transaction client. No database, no
 * Supabase, no fixtures: nothing is written anywhere, so the production database
 * stays empty. Unique local identifiers keep tsc's global scope clean.
 */

import {
  assertRoleOperation,
  buildTenantRoleCreateData,
  createTenantRole,
  decideRoleDeletion,
  decideRoleTargetAccess,
  decideReservedRoleName,
  deleteTenantRole,
  extractRoleOrganizationClaim,
  isProtectedTenantRole,
  mapRoleWriteConflict,
  NON_WRITABLE_ROLE_FIELDS,
  normalizeRoleNameKey,
  parseCreateRoleRequest,
  parseUpdateRoleRequest,
  planRoleUpdate,
  rejectProtectedRoleMutation,
  ROLE_AUDIT_ENTITY_TYPE,
  ROLE_OPERATIONS,
  ROLE_OPERATION_PERMISSIONS,
  roleCodeFromRoleName,
  rolePermissionForOperation,
  RoleManagementError,
  toRoleView,
  updateTenantRole,
  type RoleAuditRecord,
  type RoleViewRow,
  type RoleWriteTxClient,
  type TenantRoleTarget,
} from "./role-management";
import { PERMISSION, PERMISSION_NAMES } from "./permissions";
import { resolveCanonicalGrantPermissions, validateClientIdentity } from "./auth";

const roleAssert = require("node:assert/strict");
const { describe: roleDescribe, it: roleIt } = require("node:test");

type RoleRecord = RoleViewRow;

function roleRecord(overrides: Partial<RoleRecord> = {}): RoleRecord {
  return {
    id: "role_1",
    organizationId: "org_alpha",
    name: "Barista",
    code: "BARISTA_org_alpha",
    description: null,
    isPlatform: false,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    permissions: [],
    _count: { staffRoles: 0, permissions: 0 },
    ...overrides,
  };
}

function roleTarget(record: RoleRecord): TenantRoleTarget {
  return {
    id: record.id,
    organizationId: record.organizationId,
    name: record.name,
    code: record.code,
    description: record.description,
    isPlatform: record.isPlatform,
  };
}

const OWNER_CTX = {
  userId: "auth_owner_1",
  email: "owner@alpha.test",
  staffId: "staff_owner_1",
  staffName: "Owner Alpha",
  organizationId: "org_alpha",
  outletId: "outlet_alpha_1",
  roleName: "OWNER",
  permissions: [
    "owner.hq.manage",
    "settings.manage",
    "orders.read",
    "orders.create",
    "roles.read",
    "roles.create",
    "roles.update",
    "roles.delete",
  ],
  status: "ACTIVE",
};

const ROLE_ID = "role_target_1";

function statusOf(error: unknown): number {
  return (error as { statusCode?: number } | null)?.statusCode ?? -1;
}

async function statusOfAsync(fn: () => Promise<unknown>): Promise<number> {
  try {
    await fn();
  } catch (error) {
    return statusOf(error);
  }
  return -1;
}

type FakeRoleTxOptions = {
  target?: RoleRecord | null;
  duplicateByName?: boolean;
  duplicateByCode?: boolean;
  staffReferences?: number;
  permissionGrants?: number;
  updateCount?: number;
  deleteCount?: number;
  createError?: unknown;
};

/** A fake transaction client shaped exactly like RoleWriteTxClient. */
function makeRoleTx(options: FakeRoleTxOptions = {}) {
  const calls = {
    findUnique: [] as Array<Record<string, unknown>>,
    findFirst: [] as Array<Record<string, unknown>>,
    findMany: [] as Array<Record<string, unknown>>,
    create: [] as Array<Record<string, unknown>>,
    updateMany: [] as Array<Record<string, unknown>>,
    deleteMany: [] as Array<Record<string, unknown>>,
    staffRoleCount: [] as Array<Record<string, unknown>>,
    rolePermissionCount: [] as Array<Record<string, unknown>>,
    audit: [] as RoleAuditRecord[],
  };

  let lastUpdateData: Record<string, unknown> = {};
  const target = options.target ?? null;

  const tx = {
    role: {
      findUnique: async (args: { where: { id: string } }) => {
        calls.findUnique.push(args as unknown as Record<string, unknown>);
        return target ? roleTarget(target) : null;
      },
      findFirst: async (args: {
        where: { organizationId?: string; name?: string; code?: string };
      }) => {
        calls.findFirst.push(args as unknown as Record<string, unknown>);
        const byName = typeof args.where.name === "string";
        if (byName && options.duplicateByName) {
          return { id: "role_duplicate" };
        }
        if (!byName && options.duplicateByCode) {
          return { id: "role_duplicate" };
        }
        return null;
      },
      findMany: async (args: { where: { id: string; organizationId: string } }) => {
        calls.findMany.push(args as unknown as Record<string, unknown>);
        return target ? [{ ...target, ...lastUpdateData }] : [];
      },
      create: async (args: { data: Record<string, unknown> }) => {
        calls.create.push(args as unknown as Record<string, unknown>);
        if (options.createError) {
          throw options.createError;
        }
        return roleRecord({
          id: "role_created",
          organizationId: String(args.data.organizationId),
          name: String(args.data.name),
          code: String(args.data.code),
          description: (args.data.description as string | null) ?? null,
          isPlatform: Boolean(args.data.isPlatform),
        });
      },
      updateMany: async (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        calls.updateMany.push(args as unknown as Record<string, unknown>);
        lastUpdateData = args.data;
        return { count: options.updateCount ?? 1 };
      },
      deleteMany: async (args: { where: Record<string, unknown> }) => {
        calls.deleteMany.push(args as unknown as Record<string, unknown>);
        return { count: options.deleteCount ?? 1 };
      },
    },
    staffRole: {
      count: async (args: { where: { roleId: string } }) => {
        calls.staffRoleCount.push(args as unknown as Record<string, unknown>);
        return options.staffReferences ?? 0;
      },
    },
    rolePermission: {
      count: async (args: { where: { roleId: string } }) => {
        calls.rolePermissionCount.push(args as unknown as Record<string, unknown>);
        return options.permissionGrants ?? 0;
      },
    },
    auditLog: {
      create: async (args: { data: RoleAuditRecord }) => {
        calls.audit.push(args.data);
        return {};
      },
    },
  };

  return { tx: tx as unknown as RoleWriteTxClient, calls };
}

const OWNER_RECORD = roleRecord({
  id: ROLE_ID,
  name: "OWNER",
  code: "OWNER_org_alpha",
  description: "Organization owner with full operational access",
  permissions: [
    { permission: { name: "owner.hq.manage", description: null } },
    { permission: { name: "settings.manage", description: null } },
    { permission: { name: "orders.read", description: null } },
    { permission: { name: "orders.create", description: null } },
  ],
  _count: { staffRoles: 1, permissions: 4 },
});

const BARISTA_RECORD = roleRecord({
  id: ROLE_ID,
  name: "Barista",
  code: "BARISTA_org_alpha",
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. CANONICAL PERMISSION ENFORCEMENT (roles.read / create / update / delete)
// ─────────────────────────────────────────────────────────────────────────────

roleDescribe("role operation permissions", () => {
  roleIt("uses the canonical catalog names and nothing else", () => {
    roleAssert.deepEqual(ROLE_OPERATION_PERMISSIONS, {
      read: "roles.read",
      create: "roles.create",
      update: "roles.update",
      delete: "roles.delete",
    });
    for (const operation of ["read", "create", "update", "delete"] as const) {
      const permission = rolePermissionForOperation(operation);
      roleAssert.equal(permission, ROLE_OPERATION_PERMISSIONS[operation]);
      roleAssert.ok(
        (PERMISSION_NAMES as readonly string[]).includes(permission),
        `${permission} must be a canonical catalog permission`
      );
    }
    roleAssert.equal(rolePermissionForOperation("read"), PERMISSION.ROLES_READ);
    roleAssert.equal(rolePermissionForOperation("create"), PERMISSION.ROLES_CREATE);
    roleAssert.equal(rolePermissionForOperation("update"), PERMISSION.ROLES_UPDATE);
    roleAssert.equal(rolePermissionForOperation("delete"), PERMISSION.ROLES_DELETE);
  });

  roleIt("allows an ACTIVE owner that holds the required grant, per operation", () => {
    for (const operation of ["read", "create", "update", "delete"] as const) {
      roleAssert.equal(assertRoleOperation(OWNER_CTX as never, operation), "org_alpha");
    }
  });

  roleIt("rejects a staff member who lacks that operation's permission", () => {
    const noRoleGrants = { ...OWNER_CTX, permissions: ["owner.hq.manage", "settings.manage"] };
    for (const operation of ["read", "create", "update", "delete"] as const) {
      roleAssert.throws(
        () => assertRoleOperation(noRoleGrants as never, operation),
        (error: unknown) => statusOf(error) === 403,
        `${operation} must require its own grant`
      );
    }
    // read must not be satisfied by a write grant, and vice versa.
    roleAssert.doesNotThrow(() =>
      assertRoleOperation({ ...OWNER_CTX, permissions: ["roles.read"] } as never, "read")
    );
    roleAssert.throws(() =>
      assertRoleOperation({ ...OWNER_CTX, permissions: ["roles.read"] } as never, "create")
    );
    roleAssert.throws(() =>
      assertRoleOperation({ ...OWNER_CTX, permissions: ["roles.delete"] } as never, "update")
    );
  });

  roleIt("rejects INACTIVE and SUSPENDED staff", () => {
    for (const status of ["INACTIVE", "SUSPENDED", "", "PENDING"]) {
      roleAssert.throws(
        () => assertRoleOperation({ ...OWNER_CTX, status } as never, "read"),
        (error: unknown) => statusOf(error) === 403,
        `status "${status}" must be refused`
      );
    }
  });

  roleIt("rejects a caller with no organization context", () => {
    for (const organizationId of ["", "   ", null, undefined]) {
      roleAssert.throws(
        () => assertRoleOperation({ ...OWNER_CTX, organizationId } as never, "create"),
        (error: unknown) => statusOf(error) === 403,
        "a missing organization context authorizes nothing"
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. REQUEST PARSING — CLIENT AUTHORITY FIELDS ARE NEVER ACCEPTED
// ─────────────────────────────────────────────────────────────────────────────

roleDescribe("role request parsing", () => {
  roleIt("keeps only name and description", () => {
    const parsed = parseCreateRoleRequest({ name: " Barista ", description: " Sedang " });
    roleAssert.deepEqual(parsed, { name: "Barista", description: "Sedang" });
    roleAssert.equal(parseCreateRoleRequest({ name: "Barista" }).description, null);
    roleAssert.equal(
      parseCreateRoleRequest({ name: "Barista", description: null }).description,
      null
    );
  });

  roleIt("rejects organizationId, isPlatform, code and permission/staff arrays", () => {
    for (const field of [
      "organizationId",
      "isPlatform",
      "code",
      "permissions",
      "permissionIds",
      "staffIds",
      "rolePermissions",
      "tenantId",
      "outletId",
      "id",
      "createdAt",
    ]) {
      roleAssert.throws(
        () => parseCreateRoleRequest({ name: "Barista", [field]: "attacker" }),
        (error: unknown) => statusOf(error) === 400,
        `${field} must not be writable`
      );
      roleAssert.throws(
        () => parseUpdateRoleRequest({ [field]: "attacker" }),
        (error: unknown) => statusOf(error) === 400,
        `${field} must not be writable through PATCH either`
      );
    }
    // isPlatform: true is the platform-escalation attempt and never reaches a write.
    roleAssert.throws(
      () => parseCreateRoleRequest({ name: "Barista", isPlatform: true }),
      (error: unknown) => statusOf(error) === 400
    );
  });

  roleIt("rejects malformed payloads and oversized values", () => {
    for (const body of [null, undefined, [], "Barista", 42]) {
      roleAssert.throws(() => parseCreateRoleRequest(body), RoleManagementError);
    }
    roleAssert.throws(
      () => parseCreateRoleRequest({ name: "" }),
      (error: unknown) => statusOf(error) === 400
    );
    roleAssert.throws(
      () => parseCreateRoleRequest({ name: "x".repeat(81) }),
      (error: unknown) => statusOf(error) === 400
    );
    roleAssert.throws(
      () => parseCreateRoleRequest({ name: "Barista", description: "x".repeat(301) }),
      (error: unknown) => statusOf(error) === 400
    );
  });

  roleIt("PATCH allowlist is name + description; an empty patch is refused", () => {
    roleAssert.equal(parseUpdateRoleRequest({ name: " Barista " }).name, "Barista");
    roleAssert.equal(parseUpdateRoleRequest({ name: " Barista " }).suppliedFields.length, 1);
    roleAssert.equal(parseUpdateRoleRequest({ description: null }).description, null);
    roleAssert.equal(parseUpdateRoleRequest({ description: undefined }).description, undefined);
    roleAssert.throws(
      () => parseUpdateRoleRequest({}),
      (error: unknown) => statusOf(error) === 400
    );
  });

  roleIt("exposes the organizationId claim for session comparison, nothing more", () => {
    roleAssert.equal(extractRoleOrganizationClaim({ organizationId: "org_beta" }), "org_beta");
    roleAssert.equal(extractRoleOrganizationClaim({ name: "Barista" }), undefined);
    roleAssert.equal(extractRoleOrganizationClaim(null), undefined);

    // The claim exists ONLY so the route can reject a contradiction with the
    // session; it is never used as authority.
    const tampered = validateClientIdentity({
      authContext: OWNER_CTX as never,
      suppliedOrganizationId: "org_beta",
    });
    roleAssert.equal(tampered.allowed, false);
    roleAssert.match(String(tampered.reason), /organization/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. RESERVED NAMES + SERVER-GENERATED CODE (no platform escalation)
// ─────────────────────────────────────────────────────────────────────────────

roleDescribe("reserved role names", () => {
  roleIt("protects the OWNER name from re-creation", () => {
    for (const name of ["OWNER", "owner", " Owner "]) {
      const verdict = decideReservedRoleName(name);
      roleAssert.equal(verdict.ok, false);
      roleAssert.equal((verdict as { status: number }).status, 409);
      roleAssert.throws(
        () => parseCreateRoleRequest({ name }),
        (error: unknown) => statusOf(error) === 409
      );
      roleAssert.throws(
        () => parseUpdateRoleRequest({ name }),
        (error: unknown) => statusOf(error) === 409,
        "renaming a role to OWNER must be impossible too"
      );
    }
  });

  roleIt("makes platform and developer role names impossible for a tenant", () => {
    for (const name of [
      "PLATFORM_ADMIN",
      "platform_developer",
      "Platform Support",
      "PLATFORM_AUDIT",
      "DEVELOPER",
      "developer_debug",
      "ADMIN",
      "Superadmin",
      "SUPER_USER",
    ]) {
      roleAssert.equal(decideReservedRoleName(name).ok, false, `${name} must be refused`);
      roleAssert.throws(
        () => parseCreateRoleRequest({ name }),
        (error: unknown) => statusOf(error) === 403,
        `${name} must answer 403, not a silent write`
      );
    }
  });

  roleIt("accepts ordinary operational role names", () => {
    for (const name of ["Barista", "Manager Sore", "Kitchen Runner", "kasir", "Supervisor"]) {
      roleAssert.equal(decideReservedRoleName(name).ok, true, `${name} must be allowed`);
      roleAssert.doesNotThrow(() => parseCreateRoleRequest({ name }));
    }
  });
});

roleDescribe("server-generated role code", () => {
  roleIt("normalizes the name and never trusts a client code", () => {
    roleAssert.equal(normalizeRoleNameKey("  barista-sore "), "BARISTA_SORE");
    roleAssert.equal(roleCodeFromRoleName("Barista Sore", "org_alpha"), "BARISTA_SORE_org_alpha");
    roleAssert.equal(
      roleCodeFromRoleName("Kitchen & Runner", "org_alpha"),
      "KITCHEN_RUNNER_org_alpha"
    );
    roleAssert.notEqual(
      roleCodeFromRoleName("OWNER_org_alpha", "org_alpha"),
      "OWNER_org_alpha",
      "a name can never reproduce the protected OWNER code verbatim"
    );
  });

  roleIt("cannot collide globally across organizations", () => {
    // Role.code is globally unique, so the organization suffix is what keeps
    // two tenants naming a role alike from conflicting.
    roleAssert.equal(roleCodeFromRoleName("Manager", "org_alpha"), "MANAGER_org_alpha");
    roleAssert.equal(roleCodeFromRoleName("Manager", "org_beta"), "MANAGER_org_beta");
    roleAssert.notEqual(roleCodeFromRoleName("Manager", "org_alpha"), roleCodeFromRoleName("Manager", "org_beta"));
  });

  roleIt("builds a create row whose organization is the session's and isPlatform is false", () => {
    const data = buildTenantRoleCreateData("org_alpha", {
      name: "Barista",
      description: "Bar station",
    });
    roleAssert.deepEqual(data, {
      organizationId: "org_alpha",
      name: "Barista",
      code: "BARISTA_org_alpha",
      description: "Bar station",
      isPlatform: false,
    });
    roleAssert.equal(data.isPlatform, false);
    roleAssert.throws(
      () => buildTenantRoleCreateData("", { name: "Barista", description: null }),
      (error: unknown) => statusOf(error) === 403
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. TENANT ISOLATION + OWNER PROTECTION (pure decisions)
// ─────────────────────────────────────────────────────────────────────────────

roleDescribe("role target access", () => {
  roleIt("grants access to a role owned by the caller's organization", () => {
    roleAssert.equal(decideRoleTargetAccess(roleTarget(BARISTA_RECORD), "org_alpha").ok, true);
  });

  roleIt("answers an unknown id and a foreign tenant id identically", () => {
    const foreign = decideRoleTargetAccess(
      roleTarget(roleRecord({ id: ROLE_ID, organizationId: "org_beta" })),
      "org_alpha"
    );
    const unknown = decideRoleTargetAccess(null, "org_alpha");
    roleAssert.equal((foreign as { ok: boolean }).ok, false);
    roleAssert.equal((foreign as { status: number }).status, 404);
    roleAssert.equal((unknown as { status: number }).status, 404);
    roleAssert.equal(
      (foreign as { message: string }).message,
      (unknown as { message: string }).message,
      "no cross-tenant existence may be probed through this API"
    );
  });

  roleIt("refuses a platform role with 403", () => {
    const access = decideRoleTargetAccess(
      roleTarget(
        roleRecord({
          id: ROLE_ID,
          organizationId: null,
          name: "PLATFORM_ADMIN",
          code: "PLATFORM_ADMIN",
          isPlatform: true,
        })
      ),
      "org_alpha"
    );
    roleAssert.equal((access as { status: number }).status, 403);
  });

  roleIt("refuses every target when the caller has no organization", () => {
    roleAssert.equal(
      (decideRoleTargetAccess(roleTarget(BARISTA_RECORD), "") as { status: number }).status,
      404
    );
  });
});

roleDescribe("OWNER protection", () => {
  roleIt("recognizes the OWNER role by name and by provisioning code", () => {
    roleAssert.equal(
      isProtectedTenantRole({ name: "OWNER", code: "X_org_alpha", organizationId: "org_alpha" }),
      true
    );
    roleAssert.equal(
      isProtectedTenantRole({ name: "owner", code: "X", organizationId: "org_alpha" }),
      true
    );
    roleAssert.equal(
      isProtectedTenantRole({
        name: "Owner",
        code: "OWNER_org_alpha",
        organizationId: "org_alpha",
      }),
      true
    );
    roleAssert.equal(
      isProtectedTenantRole({
        name: "Barista",
        code: "OWNER_org_alpha",
        organizationId: "org_alpha",
      }),
      true
    );
    roleAssert.equal(
      isProtectedTenantRole({
        name: "Barista",
        code: "BARISTA_org_alpha",
        organizationId: "org_alpha",
      }),
      false
    );
    roleAssert.equal(
      isProtectedTenantRole({
        name: "Barista",
        code: "OWNER_org_beta",
        organizationId: "org_alpha",
      }),
      false
    );
  });

  roleIt("blocks both mutating actions with 409", () => {
    roleAssert.throws(
      () => rejectProtectedRoleMutation(roleTarget(OWNER_RECORD), "update"),
      (error: unknown) => statusOf(error) === 409
    );
    roleAssert.throws(
      () => rejectProtectedRoleMutation(roleTarget(OWNER_RECORD), "delete"),
      (error: unknown) => statusOf(error) === 409
    );
    roleAssert.doesNotThrow(() =>
      rejectProtectedRoleMutation(roleTarget(BARISTA_RECORD), "delete")
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. UPDATE PLAN + DELETION SAFETY
// ─────────────────────────────────────────────────────────────────────────────

roleDescribe("role update plan", () => {
  roleIt("writes only name/description and reports the diff", () => {
    const plan = planRoleUpdate(roleTarget(BARISTA_RECORD), {
      name: "Barista Sore",
      description: "Bar station",
      suppliedFields: ["name", "description"],
    });
    roleAssert.deepEqual(plan.data, { name: "Barista Sore", description: "Bar station" });
    roleAssert.deepEqual(Object.keys(plan.data).sort(), ["description", "name"]);
    roleAssert.deepEqual(plan.before, { name: "Barista", description: null });
    roleAssert.deepEqual(plan.after, { name: "Barista Sore", description: "Bar station" });
  });

  roleIt("treats description null as an explicit clear", () => {
    const plan = planRoleUpdate(roleTarget(roleRecord({ description: "lama" })), {
      name: null,
      description: null,
      suppliedFields: ["description"],
    });
    roleAssert.deepEqual(plan.data, { description: null });
    roleAssert.equal(plan.after.description, null);
  });

  roleIt("never emits organizationId, isPlatform, code or id in a write payload", () => {
    const plan = planRoleUpdate(roleTarget(BARISTA_RECORD), {
      name: "Barista Sore",
      description: null,
      suppliedFields: ["name", "description"],
    });
    for (const forbidden of ["organizationId", "isPlatform", "code", "id"]) {
      roleAssert.equal(forbidden in plan.data, false, `${forbidden} is immutable`);
    }
  });

  roleIt("refuses a no-op patch instead of claiming success", () => {
    roleAssert.throws(
      () =>
        planRoleUpdate(roleTarget(BARISTA_RECORD), {
          name: "Barista",
          description: undefined,
          suppliedFields: ["name"],
        }),
      (error: unknown) => statusOf(error) === 400
    );
    roleAssert.throws(
      () =>
        planRoleUpdate(roleTarget(BARISTA_RECORD), {
          name: null,
          description: undefined,
          suppliedFields: [],
        }),
      (error: unknown) => statusOf(error) === 400
    );
  });
});

roleDescribe("role deletion safety", () => {
  roleIt("blocks deletion while staff still hold the role", () => {
    const decision = decideRoleDeletion({ staffReferences: 3, permissionGrants: 0 });
    roleAssert.equal((decision as { ok: boolean }).ok, false);
    roleAssert.equal((decision as { blocker: string }).blocker, "STAFF_REFERENCES");
    roleAssert.equal((decision as { status: number }).status, 409);
  });

  roleIt("blocks deletion while permission grants still exist", () => {
    const decision = decideRoleDeletion({ staffReferences: 0, permissionGrants: 4 });
    roleAssert.equal((decision as { ok: boolean }).ok, false);
    roleAssert.equal((decision as { blocker: string }).blocker, "PERMISSION_GRANTS");
    roleAssert.equal((decision as { status: number }).status, 409);
  });

  roleIt("permits deletion only when nothing references the role", () => {
    roleAssert.deepEqual(decideRoleDeletion({ staffReferences: 0, permissionGrants: 0 }), {
      ok: true,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. WRITE SERVICES (fake tx — nothing is written to a database)
// ─────────────────────────────────────────────────────────────────────────────

roleDescribe("createTenantRole", () => {
  roleIt("writes the session's organization and isPlatform=false", async () => {
    const { tx, calls } = makeRoleTx();
    const view = await createTenantRole({
      tx,
      context: OWNER_CTX as never,
      request: { name: "Barista", description: "Bar station" },
    });

    roleAssert.equal(calls.create.length, 1);
    roleAssert.deepEqual(calls.create[0]?.data, {
      organizationId: "org_alpha",
      name: "Barista",
      code: "BARISTA_org_alpha",
      description: "Bar station",
      isPlatform: false,
    });
    roleAssert.equal("organizationId" in view, false, "the view exposes no organizationId");
    roleAssert.equal(view.code, "BARISTA_org_alpha");
    roleAssert.equal(view.isPlatform, false);
    roleAssert.equal(view.isProtected, false);
  });

  roleIt("audits the creation with the actor taken from the session", async () => {
    const { tx, calls } = makeRoleTx();
    await createTenantRole({
      tx,
      context: OWNER_CTX as never,
      request: { name: "Barista", description: null },
    });

    roleAssert.equal(calls.audit.length, 1);
    const audit = calls.audit[0];
    roleAssert.equal(audit.action, "ROLE_CREATED");
    roleAssert.equal(audit.entityType, ROLE_AUDIT_ENTITY_TYPE);
    roleAssert.equal(audit.actorStaffId, "staff_owner_1");
    roleAssert.equal(audit.actorUserId, "auth_owner_1");
    roleAssert.equal(audit.organizationId, "org_alpha");
    roleAssert.equal(audit.outletId, "outlet_alpha_1");
    roleAssert.equal(audit.entityId, "role_created");
  });

  roleIt("refuses a duplicate name or a colliding code without writing", async () => {
    const nameClash = makeRoleTx({ duplicateByName: true });
    roleAssert.equal(
      await statusOfAsync(() =>
        createTenantRole({
          tx: nameClash.tx,
          context: OWNER_CTX as never,
          request: { name: "Barista", description: null },
        })
      ),
      409
    );
    roleAssert.equal(nameClash.calls.create.length, 0);
    roleAssert.equal(nameClash.calls.audit.length, 0);

    const codeClash = makeRoleTx({ duplicateByCode: true });
    roleAssert.equal(
      await statusOfAsync(() =>
        createTenantRole({
          tx: codeClash.tx,
          context: OWNER_CTX as never,
          request: { name: "Barista", description: null },
        })
      ),
      409
    );
    roleAssert.equal(codeClash.calls.create.length, 0);
  });

  roleIt("maps a unique-constraint failure to a safe 409 with no audit row", async () => {
    const { tx, calls } = makeRoleTx({
      createError: Object.assign(new Error("Unique constraint failed on Role_name_key"), {
        code: "P2002",
        meta: { target: ["organizationId", "name"] },
      }),
    });
    roleAssert.equal(
      await statusOfAsync(() =>
        createTenantRole({
          tx,
          context: OWNER_CTX as never,
          request: { name: "Barista", description: null },
        })
      ),
      409
    );
    roleAssert.equal(calls.audit.length, 0);

    const codeConflict = mapRoleWriteConflict({ code: "P2002", meta: { target: ["code"] } });
    roleAssert.equal(codeConflict?.statusCode, 409);
    roleAssert.equal(mapRoleWriteConflict(new Error("something else")), null);
  });

  roleIt("cannot express a platform role even in the service call itself", async () => {
    const { tx, calls } = makeRoleTx();
    const view = await createTenantRole({
      tx,
      context: OWNER_CTX as never,
      request: { name: "Barista", description: null },
    });
    roleAssert.equal(view.isPlatform, false);
    roleAssert.equal((calls.create[0]?.data as { isPlatform: boolean }).isPlatform, false);
  });
});

roleDescribe("updateTenantRole", () => {
  const patch = (name: string | null, description?: string | null) => ({
    name,
    description,
    suppliedFields: name === null ? ["description"] : ["name"],
  });

  roleIt("renames a role of the caller's organization and pins the write", async () => {
    const { tx, calls } = makeRoleTx({ target: BARISTA_RECORD });
    const view = await updateTenantRole({
      tx,
      context: OWNER_CTX as never,
      roleId: ROLE_ID,
      request: patch("Barista Sore"),
    });

    roleAssert.equal(calls.updateMany.length, 1);
    roleAssert.deepEqual(calls.updateMany[0]?.where, {
      id: ROLE_ID,
      organizationId: "org_alpha",
      isPlatform: false,
      name: "Barista",
    });
    roleAssert.deepEqual(calls.updateMany[0]?.data, { name: "Barista Sore" });
    roleAssert.equal(view.name, "Barista Sore");
    roleAssert.equal(calls.audit.length, 1);
    roleAssert.equal(calls.audit[0].action, "ROLE_UPDATED");
    roleAssert.equal(calls.audit[0].organizationId, "org_alpha");
  });

  roleIt("rejects another tenant's role id with 404 and writes nothing", async () => {
    const { tx, calls } = makeRoleTx({
      target: roleRecord({ id: ROLE_ID, organizationId: "org_beta" }),
    });
    roleAssert.equal(
      await statusOfAsync(() =>
        updateTenantRole({
          tx,
          context: OWNER_CTX as never,
          roleId: ROLE_ID,
          request: patch("Hijacked"),
        })
      ),
      404
    );
    roleAssert.equal(calls.updateMany.length, 0);
    roleAssert.equal(calls.audit.length, 0);
  });

  roleIt("rejects a platform role with 403 and writes nothing", async () => {
    const { tx, calls } = makeRoleTx({
      target: roleRecord({
        id: ROLE_ID,
        organizationId: null,
        name: "PLATFORM_ADMIN",
        code: "PLATFORM_ADMIN",
        isPlatform: true,
      }),
    });
    roleAssert.equal(
      await statusOfAsync(() =>
        updateTenantRole({
          tx,
          context: OWNER_CTX as never,
          roleId: ROLE_ID,
          request: patch("Barista Sore"),
        })
      ),
      403
    );
    roleAssert.equal(calls.updateMany.length, 0);
  });

  roleIt("rejects an unknown role id with 404", async () => {
    const { tx, calls } = makeRoleTx({ target: null });
    roleAssert.equal(
      await statusOfAsync(() =>
        updateTenantRole({
          tx,
          context: OWNER_CTX as never,
          roleId: "role_missing",
          request: patch("Barista Sore"),
        })
      ),
      404
    );
    roleAssert.equal(calls.updateMany.length, 0);
  });

  roleIt("never mutates the OWNER role", async () => {
    const { tx, calls } = makeRoleTx({ target: OWNER_RECORD });
    roleAssert.equal(
      await statusOfAsync(() =>
        updateTenantRole({
          tx,
          context: OWNER_CTX as never,
          roleId: ROLE_ID,
          request: patch("Owner Bestie", "harmless"),
        })
      ),
      409
    );
    roleAssert.equal(calls.updateMany.length, 0);
    roleAssert.equal(calls.audit.length, 0);
  });

  roleIt("loses a concurrent mutation instead of overwriting it", async () => {
    const { tx, calls } = makeRoleTx({ target: BARISTA_RECORD, updateCount: 0 });
    roleAssert.equal(
      await statusOfAsync(() =>
        updateTenantRole({
          tx,
          context: OWNER_CTX as never,
          roleId: ROLE_ID,
          request: patch("Barista Sore"),
        })
      ),
      409
    );
    roleAssert.equal(calls.audit.length, 0);
  });
});

roleDescribe("deleteTenantRole", () => {
  roleIt("deletes only an unreferenced tenant role and re-pins the guard", async () => {
    const { tx, calls } = makeRoleTx({ target: BARISTA_RECORD });
    const result = await deleteTenantRole({ tx, context: OWNER_CTX as never, roleId: ROLE_ID });

    roleAssert.equal(calls.deleteMany.length, 1);
    roleAssert.deepEqual(calls.deleteMany[0]?.where, {
      id: ROLE_ID,
      organizationId: "org_alpha",
      isPlatform: false,
    });
    roleAssert.deepEqual(result, {
      id: ROLE_ID,
      name: "Barista",
      code: "BARISTA_org_alpha",
    });
    roleAssert.equal(calls.audit.length, 1);
    roleAssert.equal(calls.audit[0].action, "ROLE_DELETED");
    roleAssert.equal(calls.audit[0].organizationId, "org_alpha");
    roleAssert.equal(calls.audit[0].entityId, ROLE_ID);
  });

  roleIt("refuses a role still assigned to staff and deletes nothing", async () => {
    const { tx, calls } = makeRoleTx({ target: BARISTA_RECORD, staffReferences: 2 });
    roleAssert.equal(
      await statusOfAsync(() => deleteTenantRole({ tx, context: OWNER_CTX as never, roleId: ROLE_ID })),
      409
    );
    roleAssert.equal(calls.deleteMany.length, 0);
    roleAssert.equal(calls.audit.length, 0);
  });

  roleIt("refuses a role that still carries permission grants", async () => {
    const { tx, calls } = makeRoleTx({ target: BARISTA_RECORD, permissionGrants: 5 });
    roleAssert.equal(
      await statusOfAsync(() => deleteTenantRole({ tx, context: OWNER_CTX as never, roleId: ROLE_ID })),
      409
    );
    roleAssert.equal(calls.deleteMany.length, 0);
    roleAssert.equal(calls.audit.length, 0);
  });

  roleIt("never deletes the OWNER role, even when nothing references it", async () => {
    const { tx, calls } = makeRoleTx({
      target: roleRecord({ id: ROLE_ID, name: "OWNER", code: "OWNER_org_alpha" }),
    });
    roleAssert.equal(
      await statusOfAsync(() => deleteTenantRole({ tx, context: OWNER_CTX as never, roleId: ROLE_ID })),
      409
    );
    roleAssert.equal(calls.deleteMany.length, 0);
    roleAssert.equal(calls.staffRoleCount.length, 0, "refused before any reference scan");
  });

  roleIt("refuses a platform role with 403", async () => {
    const { tx, calls } = makeRoleTx({
      target: roleRecord({
        id: ROLE_ID,
        organizationId: null,
        name: "PLATFORM_SUPPORT",
        code: "PLATFORM_SUPPORT",
        isPlatform: true,
      }),
    });
    roleAssert.equal(
      await statusOfAsync(() => deleteTenantRole({ tx, context: OWNER_CTX as never, roleId: ROLE_ID })),
      403
    );
    roleAssert.equal(calls.deleteMany.length, 0);
  });

  roleIt("refuses another tenant's and an unknown id with the same 404", async () => {
    const foreign = makeRoleTx({
      target: roleRecord({ id: ROLE_ID, organizationId: "org_beta" }),
    });
    const missing = makeRoleTx({ target: null });
    const foreignStatus = await statusOfAsync(() =>
      deleteTenantRole({ tx: foreign.tx, context: OWNER_CTX as never, roleId: ROLE_ID })
    );
    const missingStatus = await statusOfAsync(() =>
      deleteTenantRole({ tx: missing.tx, context: OWNER_CTX as never, roleId: "role_missing" })
    );
    roleAssert.equal(foreignStatus, 404);
    roleAssert.equal(missingStatus, 404);
    roleAssert.equal(foreign.calls.deleteMany.length, 0);
    roleAssert.equal(missing.calls.deleteMany.length, 0);
  });

  roleIt("refuses the deletion when the re-pinned delete matched nothing", async () => {
    const { tx, calls } = makeRoleTx({ target: BARISTA_RECORD, deleteCount: 0 });
    roleAssert.equal(
      await statusOfAsync(() => deleteTenantRole({ tx, context: OWNER_CTX as never, roleId: ROLE_ID })),
      409
    );
    roleAssert.equal(calls.audit.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. SESSION AUTHORITY BOUNDARY — role data is never authority
// ─────────────────────────────────────────────────────────────────────────────

roleDescribe("client-claimed identity never becomes authority", () => {
  roleIt("refuses a claimed organization, role or permission set", () => {
    const session = OWNER_CTX as never;
    roleAssert.deepEqual(validateClientIdentity({ authContext: session }), { allowed: true });
    roleAssert.equal(
      validateClientIdentity({
        authContext: session,
        suppliedOrganizationId: extractRoleOrganizationClaim({ organizationId: "org_beta" }),
      }).allowed,
      false
    );
    roleAssert.equal(
      validateClientIdentity({ authContext: session, suppliedRole: "PLATFORM_ADMIN" }).allowed,
      false
    );
    roleAssert.equal(
      validateClientIdentity({
        authContext: session,
        suppliedPermissions: ["platform.impersonate"],
      }).allowed,
      false
    );
  });

  roleIt("grants nothing to a permission name outside the catalog", () => {
    // The names a role view exposes are inspection data. Even if a RolePermission
    // row carried a platform-namespace name, the session could not hold it.
    const resolved = resolveCanonicalGrantPermissions(
      ["roles.read", "roles.create", "platform.impersonate", "developer.debug", "roles.read"],
      "staff_owner_1"
    );
    roleAssert.deepEqual([...resolved].sort(), ["roles.create", "roles.read"]);
  });

  roleIt("refuses a platform/developer session that has no tenant staff context", () => {
    // A developer/platform identity is resolved outside the tenant Staff record
    // (src/lib/developer-access.ts): no staffId, no organizationId, no roles.*
    // grant. That is exactly the shape refused here — role management is a tenant
    // surface and never a path for a platform login to edit tenant roles.
    const developerSession = {
      userId: "auth_dev_1",
      email: "dev@platform.test",
      staffId: "",
      staffName: "",
      organizationId: "",
      outletId: null,
      roleName: "PLATFORM_DEVELOPER",
      permissions: [],
      status: "ACTIVE",
    };
    for (const operation of ["read", "create", "update", "delete"] as const) {
      roleAssert.throws(
        () => assertRoleOperation(developerSession as never, operation),
        (error: unknown) => statusOf(error) === 403,
        `${operation} must be unreachable without a tenant staff context`
      );
    }
  });

  roleIt("never leaks tenant or infrastructure detail through the view", () => {
    const view = toRoleView(OWNER_RECORD);
    roleAssert.deepEqual(Object.keys(view).sort(), [
      "assignedStaffCount",
      "code",
      "createdAt",
      "description",
      "id",
      "isPlatform",
      "isProtected",
      "name",
      "permissionCount",
      "permissions",
    ]);
    roleAssert.equal(view.isProtected, true);
    roleAssert.deepEqual(view.permissions, [
      "owner.hq.manage",
      "settings.manage",
      "orders.read",
      "orders.create",
    ]);
    roleAssert.equal(typeof view.createdAt, "string");
    roleAssert.equal(Object.prototype.hasOwnProperty.call(view, "organizationId"), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. PERMISSION CATALOG IS FROZEN (this phase may not widen it)
// ─────────────────────────────────────────────────────────────────────────────

roleDescribe("permission vocabulary stays canonical", () => {
  roleIt("reuses existing roles.* grants and widens nothing", () => {
    // The catalog is the frozen source of truth: it already carries a fifth
    // roles.* permission (assign_permission) that this phase deliberately does
    // NOT use, because RolePermission writing is a later phase.
    const rolePermissions = PERMISSION_NAMES.filter((name) => name.startsWith("roles."));
    roleAssert.deepEqual([...rolePermissions].sort(), [
      "roles.assign_permission",
      "roles.create",
      "roles.delete",
      "roles.read",
      "roles.update",
    ]);
    for (const operation of ROLE_OPERATIONS) {
      roleAssert.ok(
        rolePermissions.includes(rolePermissionForOperation(operation) as never),
        `${operation} must map onto an existing catalog permission`
      );
    }
    roleAssert.equal(ROLE_OPERATIONS.length, 4);
    roleAssert.equal(Object.keys(ROLE_OPERATION_PERMISSIONS).length, ROLE_OPERATIONS.length);
    roleAssert.equal(Object.isFrozen(ROLE_OPERATION_PERMISSIONS), true);
    roleAssert.equal(
      Object.values(ROLE_OPERATION_PERMISSIONS).includes("roles.assign_permission" as never),
      false,
      "permission assignment is not part of role CRUD"
    );
  });

  roleIt("rejects a mutation of the writable-field allowlist", () => {
    roleAssert.equal(Object.isFrozen(NON_WRITABLE_ROLE_FIELDS), true);
    roleAssert.equal(
      new Set(NON_WRITABLE_ROLE_FIELDS).size,
      NON_WRITABLE_ROLE_FIELDS.length,
      "no duplicated guard entries"
    );
    for (const field of ["organizationId", "isPlatform", "code", "permissions", "staffIds"]) {
      roleAssert.ok(NON_WRITABLE_ROLE_FIELDS.includes(field), `${field} must stay rejected`);
    }
  });
});










