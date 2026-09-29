/**
 * Supabase server-side client utilities using @supabase/ssr.
 *
 * This module provides two distinct clients:
 *
 * 1. createServerSessionClient() — reads cookies from Next.js request headers
 *    to reconstruct the authenticated session. Uses the anon key because the
 *    session token embedded in cookies is the user's own JWT. Suitable for
 *    reading the current user session server-side.
 *
 * 2. createServiceClient() — uses the service-role key for privileged operations
 *    such as token validation, staff lookup, and admin provisioning. Must NEVER
 *    fall back to the anon key. Fails closed if the service-role key is absent.
 *
 * SECURITY RULES:
 * - The service-role key must never be exposed to the browser.
 * - No privileged server operation may fall back to the anon key.
 * - createServiceClient() throws if SUPABASE_SERVICE_ROLE_KEY is absent.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export function getSupabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "BLOCKED_EXTERNAL_DEPENDENCY: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required."
    );
  }

  return { url, anonKey };
}

export function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "BLOCKED_EXTERNAL_DEPENDENCY: SUPABASE_SERVICE_ROLE_KEY is required for privileged server operations. " +
        "This operation must fail closed and will not fall back to the anon key."
    );
  }
  return key;
}

/**
 * Creates a Supabase server client that reads the session from cookies.
 * Safe for use in Server Components and Route Handlers to get the current user.
 */
export async function createServerSessionClient() {
  const { url, anonKey } = getSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Cannot set cookies in Server Components; this is expected.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          // Cannot remove cookies in Server Components; this is expected.
        }
      },
    },
  });
}

/**
 * Creates a Supabase client with the service-role key.
 * For privileged server-only operations. Fails closed if key is absent.
 */
export function createServiceClient() {
  const { url } = getSupabaseConfig();
  const serviceRoleKey = getServiceRoleKey();

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
