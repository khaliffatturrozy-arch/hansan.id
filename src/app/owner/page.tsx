/**
 * Owner HQ — Server Component
 *
 * This page reads the authenticated session server-side via @supabase/ssr,
 * resolves the Staff profile from Prisma, and derives the Owner HQ snapshot
 * from real DB records. No dummy data is injected.
 *
 * If the Supabase environment is not configured, the page renders a
 * configuration-required state rather than crashing.
 */

import { createServerSessionClient } from "@/lib/supabase-server";
import { prisma } from "@/lib/prisma";
import { buildOwnerOverviewSnapshot } from "@/lib/owner-hq";
import { redirect } from "next/navigation";

async function resolveOwnerPageData() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase is not configured (e.g. fresh dev environment), return a
  // configuration-required state rather than crashing the page.
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

  // Resolve the staff profile from the database
  const staff = await prisma.staff.findFirst({
    where: { authUserId: user.id },
    include: {
      organization: { select: { id: true, name: true, slug: true, isActive: true } },
      outlet: { select: { id: true, name: true, slug: true, isActive: true } },
      roles: {
        include: {
          role: {
            include: {
              permissions: { include: { permission: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });

  if (!staff || staff.status !== "ACTIVE") {
    return { configured: true as const, authenticated: true as const, authorized: false as const };
  }

  // Check that the staff has owner HQ access
  const permissions = new Set(
    staff.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.name.toLowerCase()))
  );

  const hasOwnerAccess =
    permissions.has("owner.hq.manage") ||
    staff.roles.some((r) => r.role.name.toUpperCase() === "OWNER");

  if (!hasOwnerAccess) {
    return { configured: true as const, authenticated: true as const, authorized: false as const };
  }

  // Pull real counts from the database — zero is the correct empty state.
  const organizationId = staff.organizationId;

  const [orderCount, staffCount, outletCount] = await Promise.all([
    prisma.order.count({ where: { organizationId } }),
    prisma.staff.count({ where: { organizationId } }),
    prisma.outlet.count({ where: { organizationId } }),
  ]);

  const completedOrderCount = await prisma.order.count({
    where: { organizationId, status: "COMPLETED" },
  });

  // salesTotal: aggregate totalAmount of COMPLETED orders
  const salesAgg = await prisma.order.aggregate({
    where: { organizationId, status: "COMPLETED" },
    _sum: { totalAmount: true },
  });

  const overview = buildOwnerOverviewSnapshot({
    salesTotal: salesAgg._sum.totalAmount ?? 0,
    orderCount: completedOrderCount,
    paymentCount: completedOrderCount,
    customerCount: 0, // Customer model not yet in schema — correct empty state
    inventoryCount: 0, // Inventory ledger not yet in schema — correct empty state
    reservationCount: 0, // Reservation model not yet in schema — correct empty state
    staffCount,
  });

  return {
    configured: true as const,
    authenticated: true as const,
    authorized: true as const,
    staff: {
      id: staff.id,
      firstName: staff.firstName,
      lastName: staff.lastName,
      email: staff.email,
      status: staff.status,
    },
    organization: staff.organization,
    outlet: staff.outlet,
    roles: staff.roles.map((r) => r.role.name),
    permissions: [...permissions],
    overview,
    counts: {
      orders: orderCount,
      completedOrders: completedOrderCount,
      staff: staffCount,
      outlets: outletCount,
      salesTotal: salesAgg._sum.totalAmount ?? 0,
    },
  };
}

export default async function OwnerPage() {
  const data = await resolveOwnerPageData();

  if (!data.configured) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
        <div className="mx-auto max-w-3xl rounded-3xl border border-amber-800/40 bg-amber-900/10 p-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-300">Configuration required</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">Supabase not configured</h1>
          <p className="mt-3 text-slate-300">
            Set <code className="rounded bg-slate-800 px-1 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="rounded bg-slate-800 px-1 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in your
            environment to enable authentication.
          </p>
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
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-rose-300">Access denied</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">Insufficient permissions</h1>
          <p className="mt-3 text-slate-300">
            Your account does not have Owner HQ access. Contact your platform administrator.
          </p>
        </div>
      </main>
    );
  }

  const { staff, organization, outlet, roles, overview, counts } = data;

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-8">

        {/* Header */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/40">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-700 bg-emerald-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-emerald-300">
            Owner workspace
          </div>
          <h1 className="text-3xl font-semibold text-white">Operations control center</h1>
          <p className="mt-2 text-slate-400">
            {staff.firstName}{staff.lastName ? ` ${staff.lastName}` : ""} · {staff.email}
          </p>

          {/* Identity */}
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
              <p className="text-sm text-slate-400">Organization</p>
              <p className="mt-2 text-xl font-semibold text-white">{organization?.name ?? "—"}</p>
              {organization?.slug ? (
                <p className="mt-1 text-xs text-slate-500">{organization.slug}</p>
              ) : null}
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
              <p className="text-sm text-slate-400">Primary outlet</p>
              <p className="mt-2 text-xl font-semibold text-white">{outlet?.name ?? "All outlets"}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
              <p className="text-sm text-slate-400">Roles</p>
              <p className="mt-2 text-xl font-semibold text-white">{roles.join(", ") || "STAFF"}</p>
            </div>
          </div>
        </div>

        {/* Business overview — sourced from real DB records */}
        <div>
          <h2 className="mb-4 text-sm font-medium uppercase tracking-[0.15em] text-slate-400">
            Business overview
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {overview.map((metric) => (
              <div
                key={metric.label}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
              >
                <p className="text-sm text-slate-400">{metric.label}</p>
                <p className={`mt-2 text-lg font-semibold ${metric.status === "ready" ? "text-white" : "text-slate-500"}`}>
                  {metric.value}
                </p>
                <p className="mt-1 text-xs text-slate-500">{metric.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Raw counts — useful for operators */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-[0.15em] text-slate-400">
            Database state
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">Total orders</p>
              <p className="mt-1 text-2xl font-semibold text-white">{counts.orders}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Completed</p>
              <p className="mt-1 text-2xl font-semibold text-white">{counts.completedOrders}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Staff</p>
              <p className="mt-1 text-2xl font-semibold text-white">{counts.staff}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Outlets</p>
              <p className="mt-1 text-2xl font-semibold text-white">{counts.outlets}</p>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
