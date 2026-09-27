'use client';

import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [message, setMessage] = useState('');

  const supabaseClient = useMemo(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      return null;
    }

    return createClient(supabaseUrl, supabaseAnonKey);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabaseClient) {
      setStatus('error');
      setMessage('Authentication is not configured in this environment.');
      return;
    }

    setStatus('loading');
    setMessage('Signing in…');

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      setStatus('error');
      setMessage(error?.message ?? 'Unable to sign in. Please verify your credentials.');
      return;
    }

    setStatus('success');
    setMessage('Signed in successfully. Redirecting…');
    router.push('/owner');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-slate-100">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80 shadow-2xl shadow-slate-950/40 backdrop-blur-sm md:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden border-r border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-10 md:flex md:flex-col md:justify-between">
          <div>
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-emerald-300">
              HANSAN OS
            </div>
            <h1 className="max-w-md text-4xl font-semibold leading-tight text-white">
              Secure access for your hospitality operations.
            </h1>
          </div>

          <div className="space-y-4 text-sm text-slate-300">
            <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
              <p className="font-medium text-white">Tenant-aware identity</p>
              <p className="mt-1">Staff access is resolved from the authenticated Supabase user and matched to the correct organization and outlet.</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
              <p className="font-medium text-white">Role-driven permissions</p>
              <p className="mt-1">Access is granted only after staff, role, and permission checks are validated server-side.</p>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center p-6 md:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">Sign in</p>
              <h2 className="mt-3 text-3xl font-semibold text-white">Welcome back</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="name@tenant.com"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="Enter your password"
                />
              </label>

              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {status === 'loading' ? 'Signing in…' : 'Continue to dashboard'}
              </button>
            </form>

            {message ? (
              <p
                className={
                  status === 'error'
                    ? 'mt-4 text-sm text-rose-300'
                    : 'mt-4 text-sm text-emerald-300'
                }
              >
                {message}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
