/**
 * Unauthorized — terminal state for authenticated Supabase users who have no
 * valid HANSAN access (no ACTIVE DeveloperAccess grant and no ACTIVE Staff
 * record).
 *
 * No automatic redirect (that would loop). The user signs out explicitly and
 * returns to /login. No database details are exposed.
 */

"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function UnauthorizedPage() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const supabaseClient = useMemo(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      return null;
    }
    return createBrowserClient(supabaseUrl, supabaseAnonKey);
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await supabaseClient?.auth.signOut();
    } finally {
      router.refresh();
      router.push("/login");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-slate-100">
      <div className="w-full max-w-md rounded-3xl border border-rose-800/40 bg-rose-900/10 p-8 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-rose-300">
          No access
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-white">Unauthorized</h1>
        <p className="mt-3 text-sm text-slate-300">
          This account is signed in but has no HANSAN access. Contact your administrator
          to request access.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="w-full rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-slate-500"
          >
            Return to login
          </button>
        </div>
      </div>
    </main>
  );
}
