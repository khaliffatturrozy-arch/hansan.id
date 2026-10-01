/**
 * Developer / Platform area — Server Component.
 *
 * Authorization: requireDeveloperAccess(authUserId) ONLY (DeveloperAccess is
 * the authoritative Developer boundary). This page NEVER consults
 * Staff/Organization/Outlet, and a Developer WITHOUT a Staff record gains no
 * tenant authority here or anywhere else.
 *
 * Content is real data only: the developer's own grant record plus cheap
 * platform-wide tenant counts. Empty database → honest empty state.
 * No fake metrics, no sample organizations, no sample staff.
 */

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createServerSessionClient } from "@/lib/supabase-server";
import { prisma } from "@/lib/prisma";
import { requireDeveloperAccess, DeveloperAccessError } from "@/lib/developer-access";

async function resolveDeveloperPageData() {
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

  let grant;
  try {
    grant = await requireDeveloperAccess(user.id);
  } catch (error) {
    if (error instanceof DeveloperAccessError) {
      return { configured: true as const, authenticated: true as const, authorized: false as const };
    }
    throw error;
  }

  const [organizationCount, outletCount] = await Promise.all([
    prisma.organization.count(),
    prisma.outlet.count(),
  ]);

  return {
    configured: true as const,
    authenticated: true as const,
    authorized: true as const,
    email: grant.email,
    status: grant.status,
    createdAt: grant.createdAt.toISOString(),
    lastLoginAt: grant.lastLoginAt ? grant.lastLoginAt.toISOString() : null,
    organizationCount,
    outletCount,
  };
}

export default async function DeveloperPage() {
  const data = await resolveDeveloperPageData();

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
    redirect("/unauthorized");
  }

  const hasTenantData = data.organizationCount > 0 || data.outletCount > 0;

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">
            HANSAN Developer / Platform
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-white">Developer Access</h1>
          <p className="mt-1 text-sm text-slate-400">
            Tenant-independent platform area. This identity carries no tenant authority.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-[0.15em] text-slate-400">
            Grant
          </h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Email</dt>
              <dd className="text-white">{data.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Status</dt>
              <dd className="text-white">{data.status}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Created</dt>
              <dd className="text-white">{data.createdAt}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Last login</dt>
              <dd className="text-white">{data.lastLoginAt ?? "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-[0.15em] text-slate-400">
            Platform state
          </h2>
          {hasTenantData ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500">Organizations</p>
                <p className="mt-1 text-2xl font-semibold text-white">{data.organizationCount}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Outlets</p>
                <p className="mt-1 text-2xl font-semibold text-white">{data.outletCount}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No tenant data yet.</p>
          )}
        </div>
      </div>
    </main>
  );
}
