import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { getServiceRoleKey, getSupabaseConfig } from "@/lib/supabase-server";
import {
  requireOutletInOrganization,
  requireRoleInOrganization,
  StaffProvisioningError,
  type CreateStaffRequest,
} from "@/lib/staff-provisioning";
import type { AuthenticatedStaffContext } from "@/lib/auth";

/**
 * HANSAN — staff provisioning (DATA LAYER).
 *
 * AUTH IDENTITY — how a new staff member obtains `authUserId`:
 * `Staff.authUserId` is NOT NULL and UNIQUE, so a Staff row cannot exist
 * without a real Supabase Auth identity. The identity is therefore created
 * FIRST through the Supabase Admin API (`auth.admin.createUser`) using the
 * server-side service-role key — the same capability already used by
 * `POST /api/auth/provision`. Nothing about the auth system is replaced or
 * re-implemented.
 *
 * SAFETY — the account is created WITHOUT a password:
 *   - no password is generated, stored, returned, or logged by HANSAN
 *   - Supabase assigns its own random internal credential
 *   - the account is email-confirmed, because the OWNER has vouched for the
 *     address. Until an email/identity provider is configured, the operator
 *     must set an initial password through the Supabase admin console.
 *   There is no temporary password, no default credential and no fake login.
 *
 * TENANT SAFETY — organizationId is ALWAYS `context.organizationId`. The role
 * and the outlet are loaded by id and proven to belong to that same
 * organization before anything is written.
 */

function adminClient() {
  const { url } = getSupabaseConfig();
  const serviceRoleKey = getServiceRoleKey();

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createAuthIdentity(email: string): Promise<string> {
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (error || !data?.user?.id) {
    // Never surface the provider's raw error: it can contain account details.
    throw new StaffProvisioningError(
      "Akun autentikasi tidak dapat dibuat untuk email ini.",
      409
    );
  }

  return data.user.id;
}

/** Best-effort compensation so a failed insert cannot orphan an auth user. */
async function discardAuthIdentity(authUserId: string): Promise<void> {
  try {
    await adminClient().auth.admin.deleteUser(authUserId);
  } catch (error) {
    console.error(
      "[hansan:staff] compensation failed:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

export type StaffView = {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  status: string;
  outletId: string | null;
  outletName: string | null;
  roleNames: string[];
  createdAt: string;
};

const staffSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  outletId: true,
  createdAt: true,
  outlet: { select: { name: true } },
  roles: { select: { role: { select: { name: true } } } },
} as const;

type StaffRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  status: string;
  outletId: string | null;
  createdAt: Date;
  outlet: { name: string } | null;
  roles: Array<{ role: { name: string } }>;
};

function toStaffView(staff: StaffRow): StaffView {
  return {
    id: staff.id,
    email: staff.email,
    firstName: staff.firstName,
    lastName: staff.lastName,
    status: staff.status,
    outletId: staff.outletId,
    outletName: staff.outlet?.name ?? null,
    roleNames: staff.roles.map((entry) => entry.role.name),
    createdAt: staff.createdAt.toISOString(),
  };
}

/** Tenant-scoped staff listing. Never returns another organization's staff. */
export async function listOrganizationStaff(
  context: AuthenticatedStaffContext
): Promise<StaffView[]> {
  const staff = await prisma.staff.findMany({
    where: { organizationId: context.organizationId },
    orderBy: { createdAt: "asc" },
    select: staffSelect,
  });

  return staff.map(toStaffView);
}

/** Assignable options for the OWNER UI: org-scoped tenant roles + active outlets. */
export async function listStaffManagementOptions(context: AuthenticatedStaffContext) {
  const [roles, outlets] = await Promise.all([
    prisma.role.findMany({
      where: { organizationId: context.organizationId, isPlatform: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true },
    }),
    prisma.outlet.findMany({
      where: { organizationId: context.organizationId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return { roles, outlets };
}

export type CreateStaffResult = {
  staff: StaffView;
  /** Populated when the assigned role grants owner-level authority. */
  warnings: string[];
};

export async function createStaffForOrganization(
  context: AuthenticatedStaffContext,
  input: CreateStaffRequest
): Promise<CreateStaffResult> {
  const organizationId = context.organizationId;

  // 1. Prove the role belongs to the caller's organization.
  const role = requireRoleInOrganization(
    await prisma.role.findUnique({
      where: { id: input.roleId },
      select: { id: true, name: true, organizationId: true, isPlatform: true },
    }),
    organizationId
  );

  // 2. Prove the outlet belongs to the caller's organization.
  const outlet = requireOutletInOrganization(
    await prisma.outlet.findUnique({
      where: { id: input.outletId },
      select: { id: true, name: true, organizationId: true, isActive: true },
    }),
    organizationId
  );
  if (outlet.isActive === false) {
    throw new StaffProvisioningError("Outlet tidak aktif.", 409);
  }

  // 3. Staff.email is globally unique across every tenant.
  const emailConflict = await prisma.staff.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (emailConflict) {
    throw new StaffProvisioningError("Email ini sudah terdaftar pada HANSAN.", 409);
  }

  // 4. Create the real Supabase Auth identity first.
  const authUserId = await createAuthIdentity(input.email);

  // 5. Persist staff + role assignment + audit event atomically.
  try {
    const created = await prisma.$transaction(async (tx) => {
      const staff = await tx.staff.create({
        data: {
          authUserId,
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          // Derived from the authenticated context. Never from the request.
          organizationId,
          outletId: outlet.id,
          status: "ACTIVE",
        },
        select: staffSelect,
      });

      await tx.staffRole.create({
        data: { staffId: staff.id, roleId: input.roleId },
      });

      await tx.auditLog.create({
        data: {
          actorStaffId: context.staffId,
          actorUserId: context.userId,
          organizationId,
          outletId: outlet.id,
          entityType: "STAFF",
          entityId: staff.id,
          action: "STAFF_CREATED",
          // Factual only: no credentials, tokens or secrets.
          metadata: {
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            roleId: input.roleId,
            roleName: role.name,
            outletId: outlet.id,
            status: "ACTIVE",
          },
        },
      });

      return staff;
    });

    const warnings: string[] = [];
    if (role.name === "OWNER") {
      warnings.push(
        "Role OWNER memberi akses penuh organisasi, termasuk pengaturan staff. Gunakan hanya bila memang diperlukan."
      );
    }

    return { staff: toStaffView(created), warnings };
  } catch (error) {
    // Compensation: never leave a Supabase user behind with no Staff row.
    await discardAuthIdentity(authUserId);
    throw error;
  }
}

const ALLOWED_STATUS = ["ACTIVE", "INACTIVE"] as const;

/**
 * Activates / deactivates a staff member.
 *
 * Deactivation is a genuine kill switch: `resolveAuthenticatedStaffContext`
 * rejects any staff whose status is not ACTIVE, so access stops immediately
 * without deleting the record or its audit history.
 */
export async function setStaffStatus(
  context: AuthenticatedStaffContext,
  staffId: string,
  status: string
): Promise<StaffView> {
  const nextStatus = status.trim().toUpperCase();

  if (!ALLOWED_STATUS.includes(nextStatus as (typeof ALLOWED_STATUS)[number])) {
    throw new StaffProvisioningError("Status staff tidak valid.", 400);
  }

  // Tenant-scoped: a staff id belonging to another organization is not found.
  const existing = await prisma.staff.findFirst({
    where: { id: staffId, organizationId: context.organizationId },
    select: { id: true, status: true, outletId: true },
  });

  if (!existing) {
    throw new StaffProvisioningError("Staff tidak ditemukan.", 404);
  }

  // Guard against locking the organization out of its own staff management.
  if (existing.id === context.staffId && nextStatus !== "ACTIVE") {
    throw new StaffProvisioningError(
      "Anda tidak dapat menonaktifkan akun Anda sendiri.",
      409
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const staff = await tx.staff.update({
      where: { id: existing.id },
      data: { status: nextStatus },
      select: staffSelect,
    });

    await tx.auditLog.create({
      data: {
        actorStaffId: context.staffId,
        actorUserId: context.userId,
        organizationId: context.organizationId,
        outletId: existing.outletId ?? null,
        entityType: "STAFF",
        entityId: staff.id,
        action: "STAFF_STATUS_CHANGED",
        metadata: { from: existing.status, to: nextStatus },
      },
    });

    return staff;
  });

  return toStaffView(updated);
}
