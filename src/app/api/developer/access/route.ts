/**
 * PATCH /api/developer/access
 *
 * DeveloperAccess lifecycle management (suspend / reactivate) for ACTIVE
 * developers, by ACTIVE developers. Tenant-independent: no Staff, Role,
 * Organization, or Outlet is consulted for authority, and no tenant field is
 * ever written to the audit trail.
 *
 * AUTHORIZATION ORDER (fixed; never reordered)
 *   1. Resolve the Supabase session (existing SSR session architecture only —
 *      no new auth mechanism, no bootstrap secret, no service-role bypass).
 *   2. The actor authUserId comes from the SESSION ONLY. Actor identity in
 *      the request body is never read (parse-level allowlist).
 *   3. requireDeveloperAccess(actorAuthUserId) — ACTIVE grants only, fail
 *      closed (403 otherwise, 401 without a session).
 *   4. Only then the body is parsed: { action, targetAuthUserId?, targetEmail? }.
 *
 * BODY: exactly one action ("suspend" | "reactivate") plus one target
 * selector. targetAuthUserId (unique, authoritative) wins when both are
 * supplied; targetEmail is a non-unique snapshot — ambiguity is a safe 409.
 *
 * OUTCOMES
 *   transitioned   → 200 { status: "SUSPENDED" | "REACTIVATED" }
 *   idempotent replay (same-state action) → 200 { status: "NO_OP" } — no
 *                    audit row is written for a replay
 *   absent target  → 404; self-suspend / drift status / ambiguous email /
 *                    lost concurrent race / last-active protection → 409
 *   invalid body   → 400; unexpected failures → safe-mapped 500
 *
 * STATE + AUDIT are written inside ONE Prisma transaction via
 * applyDeveloperLifecycle. Last-active-developer protection and the residual
 * concurrency window are documented in docs/ARCHITECTURE-DECISIONS.md §5.
 */

// Reads the session cookies and the request body, so it can never be static.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerSessionClient } from "@/lib/supabase-server";
import { prisma } from "@/lib/prisma";
import { toSafeApiError } from "@/lib/api-errors";
import { requireDeveloperAccess } from "@/lib/developer-access";
import {
  DeveloperLifecycleError,
  applyDeveloperLifecycle,
  parseDeveloperLifecycleBody,
} from "@/lib/developer-lifecycle";

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new DeveloperLifecycleError("Request body must be a JSON object.", 400);
  }
}

export async function PATCH(request: Request) {
  try {
    // 1. Session — the repository's existing server-side Supabase session.
    const supabase = await createServerSessionClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user || !user.id) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated.", code: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }

    // 2 + 3. Actor identity is the SESSION user; ACTIVE DeveloperAccess only.
    //        Suspended/unknown developers receive the same generic 403.
    await requireDeveloperAccess(user.id);

    // 4. Parse only after the actor is authorized: an unauthorized caller
    //    learns nothing about the request shape.
    const parsed = parseDeveloperLifecycleBody(await readJson(request));

    // 5. State mutation + recount guard + audit in ONE transaction.
    const result = await prisma.$transaction((tx) =>
      applyDeveloperLifecycle({ tx, actorAuthUserId: user.id, request: parsed })
    );

    return NextResponse.json(
      {
        ok: true,
        status:
          result.outcome === "NO_OP"
            ? "NO_OP"
            : result.grant.status === "SUSPENDED"
              ? "SUSPENDED"
              : "REACTIVATED",
        data: {
          id: result.grant.id,
          email: result.grant.email,
          status: result.grant.status,
          action: parsed.action,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const { status, body } = toSafeApiError(
      error,
      "Developer lifecycle update could not be completed."
    );
    return NextResponse.json(body, { status });
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Method not allowed. Use PATCH.", code: "INVALID_REQUEST" },
    { status: 405 }
  );
}

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Method not allowed. Use PATCH.", code: "INVALID_REQUEST" },
    { status: 405 }
  );
}