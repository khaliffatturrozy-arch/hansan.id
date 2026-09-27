export default function OwnerPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/40">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-700 bg-emerald-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-emerald-300">
          Owner workspace
        </div>
        <h1 className="text-3xl font-semibold text-white">Operations control center</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          This protected area is reserved for an authenticated owner identity that has already been resolved to the correct organization, outlet, role, and permissions.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
            <p className="text-sm text-slate-400">Access model</p>
            <p className="mt-2 text-xl font-semibold text-white">Owner</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
            <p className="text-sm text-slate-400">Tenant scope</p>
            <p className="mt-2 text-xl font-semibold text-white">Organization</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
            <p className="text-sm text-slate-400">Permission check</p>
            <p className="mt-2 text-xl font-semibold text-white">Verified</p>
          </div>
        </div>
      </div>
    </main>
  );
}
