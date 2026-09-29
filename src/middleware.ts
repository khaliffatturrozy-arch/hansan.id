/**
 * Next.js Edge Middleware — HANSAN Platform Session Guard
 *
 * Responsibilities:
 * 1. Refresh the Supabase session on every request (keeps cookies valid).
 * 2. Protect routes that require authentication by redirecting to /login.
 * 3. Protect routes that require specific access tiers (owner, platform).
 * 4. Prevent authenticated users from accessing the login page again.
 *
 * SECURITY RULES:
 * - Session refresh must use the anon key (the user's own session JWT).
 * - Token validation against Supabase is done server-side only.
 * - Client-supplied organizationId/outletId/role/permissions are never trusted here;
 *   that validation is done in the API layer by requireProtectedRequest().
 * - This middleware only gates page access; API route authorization is separate.
 *
 * PROTECTED ROUTE TIERS:
 * /owner/*     — requires authenticated session (role resolved at page/API level)
 * /api/*       — handled by requireProtectedRequest() in each route handler
 * /login       — redirects to /owner if already authenticated
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Routes that require a valid session
const PROTECTED_PREFIXES = ["/owner"];

// Routes that should redirect authenticated users away (e.g. login)
const AUTH_ENTRY_ROUTES = ["/login"];

function buildSupabaseSessionClient(request: NextRequest, response: NextResponse) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: "", ...options });
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Pass through static assets and Next.js internals immediately
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = buildSupabaseSessionClient(request, response);

  // If Supabase is not configured, allow requests through but do not attempt
  // session refresh. Routes are still guarded at the API layer.
  if (!supabase) {
    return response;
  }

  // Refresh the session — this keeps cookies alive and re-validates the JWT.
  // The result is used for page-level redirect decisions only.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isAuthEntry = AUTH_ENTRY_ROUTES.some((route) => pathname === route);

  // Unauthenticated user accessing a protected route → redirect to login
  if (isProtected && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Authenticated user accessing the login page → redirect to owner HQ
  if (isAuthEntry && user) {
    return NextResponse.redirect(new URL("/owner", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * Files with extensions (.js, .css, .png, etc.) are excluded by the
     * pathname check in the middleware body.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
