import { createServerSessionClient } from "@/lib/supabase-server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import {
  canManageStaff,
  STAFF_MANAGEMENT_PERMISSION,
  STAFF_MANAGEMENT_ROLE,
} from "@/lib/staff-provisioning";
import { StaffManager } from "./StaffManager";

/**
 * OWNER — staff management.
 *
 * The minimum capability required to onboard a real cashier so the POS can be
 * smoke-tested end to end. This is deliberately NOT an HR system: it lists
 * staff, creates one, assigns an existing role and outlet, changes a role and
 * toggles status.
 *
 * Authorization is authoritative in /api/staff. This page performs the SAME
 * gate through the shared canManageStaff helper (src/lib/staff-provisioning.ts)
 * purely as an early UX gate — it is not a second authorization model, and it
 * holds no hardcoded role or permission strings of its own.
 */

export const dynamic = "force-dynamic";

async function resolveStaffPageData() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return { configured: false as const };
  }

  let user = null;
  try {
    const supabase = await createServerSessionClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    return { configured: true as const, authenticated: false as const };
  }

  if (!user) {
    return { configured: true as const, authenticated: false as const };
  }

  const staff = await prisma.staff.findFirst({
    where: { authUserId: user.id },
    select: {
      id: true,
      firstName: true,
      status: true,
      organizationId: true,
      roles: {
        select: {
          role: {
            select: {
              name: true,
              permissions: { select: { permission: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });

  if (!staff || staff.status !== "ACTIVE") {
    return { configured: true as const, authenticated: true as const, authorized: false as const };
  }

  const roleNames = staff.roles.map((entry) => entry.role.name);
  const permissionNames = staff.roles.flatMap((entry) =>
    entry.role.permissions.map((entry2) => entry2.permission.name)
  );

  // The same rule /api/staff enforces via assertCanManageStaff, expressed once
  // in staff-provisioning.ts and shared — no hardcoded "OWNER" string, no
  // hardcoded "settings.manage" string. Parity is proven in
  // staff-provisioning.test.ts; the API remains authoritative.
  if (!canManageStaff({ status: staff.status, roleNames, permissions: permissionNames })) {
    return { configured: true as const, authenticated: true as const, authorized: false as const };
  }

  const organizationId = staff.organizationId;

  const [staffList, roles, outlets] = await Promise.all([
    prisma.staff.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        outlet: { select: { name: true } },
        roles: { select: { role: { select: { name: true } } } },
      },
    }),
    prisma.role.findMany({
      where: { organizationId, isPlatform: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true },
    }),
    prisma.outlet.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, isActive: true },
    }),
  ]);

  return {
    configured: true as const,
    authenticated: true as const,
    authorized: true as const,
    viewerId: staff.id,
    staffList: staffList.map((entry) => ({
      id: entry.id,
      email: entry.email,
      firstName: entry.firstName,
      lastName: entry.lastName,
      status: entry.status,
      outletName: entry.outlet?.name ?? null,
      roleNames: entry.roles.map((role) => role.role.name),
    })),
    roles,
    outlets,
  };
}

export default async function StaffPage() {
  const data = await resolveStaffPageData();

  if (!data.configured) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
        <div className="mx-auto max-w-3xl rounded-3xl border border-amber-800/40 bg-amber-900/10 p-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-300">
            Configuration required
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-white">Supabase not configured</h1>
        </div>
      </main>
    );
  }

  if (!data.authenticated) {
    redirect("/login");
  }

  if (!data.authorized) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
        <div className="mx-auto max-w-3xl rounded-3xl border border-rose-800/40 bg-rose-900/10 p-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-rose-300">
            Access denied
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-white">Insufficient permissions</h1>
          <p className="mt-3 text-slate-300">
            {`Staff management requires the ${STAFF_MANAGEMENT_ROLE} role with the ${STAFF_MANAGEMENT_PERMISSION} permission.`}
          </p>
          <a href="/owner" className="mt-4 inline-block text-sm text-emerald-300 underline">
            Kembali ke Owner HQ
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <a href="/owner" className="text-xs text-slate-400 underline">
            &larr; Owner HQ
          </a>
          <h1 className="mt-2 text-2xl font-semibold text-white">Staff Management</h1>
          <p className="mt-1 text-sm text-slate-400">
            Create staff for this organization. Each account receives a real Supabase Auth
            identity; no password is set or displayed by HANSAN.
          </p>
        </div>

        <StaffManager
          viewerId={data.viewerId}
          initialStaff={data.staffList}
          roles={data.roles}
          outlets={data.outlets}
        />
      </div>
    </main>
  );
}
