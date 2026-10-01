/**
 * POST /api/auth/developer-provision
 *
 * BOOTSTRAP-ONLY Developer provisioning endpoint.
 *
 * Creates a DeveloperAccess grant for an EXISTING Supabase Auth identity.
 * Never creates an Auth user, password, credential, organization, outlet,
 * Staff, Role, or StaffRole. Never modifies the login gateway.
 *
 * AUTHORIZATION: dedicated bootstrap secret only
 *   HANSAN_DEVELOPER_PROVISION_SECRET (env, server-only) vs
 *   X-Developer-Provision-Secret (header), timing-safe comparison.
 * Checked BEFORE any Supabase lookup. No session of any kind is accepted.
 *
 * BODY: { "email" } ONLY (lookup key). Authority fields are ignored.
 * The authoritative authUserId comes from the Supabase Admin API lookup.
 *
 * IDEMPOTENCY (by authUserId):
 * - no grant        → 201 PROVISIONED (grant + audit, one transaction)
 * - ACTIVE grant    → 200 PROVISIONED_EXISTS (no write, no extra audit row)
 * - SUSPENDED/other → 409 (explicit reactivation required; not built here)
 *
 * PRE-PRODUCTION RISK: secret-gated but NO rate limiting exists in this
 * repository. Ship real rate limiting before production exposure; keep the
 * secret high-entropy, rotate on suspicion, monitor 403 clusters in logs.
 */

// Reads the request body, so it can never be static.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { toSafeApiError } from "@/lib/api-errors";
import { AuthGuardError } from "@/lib/auth";
import {
  DEVELOPER_PROVISION_SECRET_ENV,
  DEVELOPER_PROVISION_SECRET_HEADER,
  buildDeveloperProvisionAudit,
  decideDeveloperProvision,
  evaluateDeveloperProvisionSecretGate,
  isUniqueViolation,
  parseDeveloperProvisionBody,
} from "@/lib/developer-provisioning";

type SupabaseAdminUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  banned_until?: string | null;
};

function readSecretGate(request: Request): void {
  const envSecret = process.env[DEVELOPER_PROVISION_SECRET_ENV];
  const headerSecret = request.headers.get(DEVELOPER_PROVISION_SECRET_HEADER);
  const result = evaluateDeveloperProvisionSecretGate(envSecret, headerSecret, timingSafeEqual);
  if (!result.pass) {
    throw new AuthGuardError(result.message, result.status);
  }
}

function adminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new AuthGuardError(
      "BLOCKED_EXTERNAL_DEPENDENCY: Server-side auth requires SUPABASE_SERVICE_ROLE_KEY.",
      500
    );
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Resolves an EXISTING Supabase Auth user by normalized email using the
 * repository's installed @supabase/supabase-js Admin API (`listUsers` with
 * pagination — the v2 API exposes no getUserByEmail). Read-only: never
 * creates, updates, or deletes an identity.
 */
async function resolveExistingAuthUser(
  normalizedEmail: string
): Promise<SupabaseAdminUser> {
  const client = adminClient();

  const perPage = 1000;
  let page = 1;
  // Guard the scan so a pathological user table cannot hang provisioning.
  for (let pages = 0; pages < 10; pages += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error || !data) {
      throw new AuthGuardError("Developer identity could not be resolved.", 503);
    }
    const match = data.users.find(
      (candidate) =>
        typeof candidate.email === "string" &&
        candidate.email.toLowerCase() === normalizedEmail
    );
    if (match) {
      return {
        id: match.id,
        email: match.email ?? null,
        email_confirmed_at: match.email_confirmed_at ?? null,
        banned_until: match.banned_until ?? null,
      };
    }
    if (data.users.length < perPage) {
      break;
    }
    page += 1;
  }

  throw new AuthGuardError("Developer identity could not be resolved.", 404);
}

export async function POST(request: Request) {
  try {
    // Step 0: bootstrap secret FIRST — before parsing or any Supabase call,
    // so unauthenticated callers learn nothing about identities.
    readSecretGate(request);

    // Step 1: body carries only { email }. Authority fields are ignored.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AuthGuardError("Request body must be valid JSON.", 400);
    }
    const { email: normalizedEmail } = parseDeveloperProvisionBody(body);

    // Step 2: bind to an EXISTING, confirmed Supabase Auth identity.
    const authUser = await resolveExistingAuthUser(normalizedEmail);
    if (!authUser.email_confirmed_at) {
      throw new AuthGuardError("Developer identity could not be resolved.", 422);
    }
    if (authUser.banned_until) {
      throw new AuthGuardError("Developer identity could not be resolved.", 422);
    }
    const authUserId = authUser.id;

    // Step 3: idempotency by authUserId (never by email).
    const existing = await prisma.developerAccess.findUnique({
      where: { authUserId },
      select: { id: true, authUserId: true, email: true, status: true },
    });

    const decision = decideDeveloperProvision(existing);

    if (decision.outcome === "EXISTS" && existing) {
      return NextResponse.json(
        {
          ok: true,
          status: "PROVISIONED_EXISTS",
          data: {
            id: existing.id,
            authUserId: existing.authUserId,
            email: existing.email,
            status: existing.status,
          },
        },
        { status: 200 }
      );
    }

    if (decision.outcome === "SUSPENDED") {
      return NextResponse.json(
        {
          ok: false,
          error: "Developer access is suspended. Explicit reactivation is required.",
          code: "CONFLICT",
        },
        { status: 409 }
      );
    }

    // Step 4: create grant + audit in ONE transaction (rollback together).
    try {
      const result = await prisma.$transaction(async (tx) => {
        const grant = await tx.developerAccess.create({
          data: { authUserId, email: normalizedEmail, status: "ACTIVE" },
        });
        await tx.auditLog.create({
          data: buildDeveloperProvisionAudit(grant.id, authUserId, normalizedEmail),
        });
        return grant;
      });

      return NextResponse.json(
        {
          ok: true,
          status: "PROVISIONED",
          data: {
            id: result.id,
            authUserId: result.authUserId,
            email: result.email,
            status: result.status,
          },
        },
        { status: 201 }
      );
    } catch (error) {
      // Concurrent-race: the UNIQUE on authUserId fired between lookup and
      // insert. Re-read and return the idempotent result instead of leaking
      // constraint details.
      if (isUniqueViolation(error)) {
        const raced = await prisma.developerAccess.findUnique({
          where: { authUserId },
          select: { id: true, authUserId: true, email: true, status: true },
        });
        if (raced && raced.status === "ACTIVE") {
          return NextResponse.json(
            {
              ok: true,
              status: "PROVISIONED_EXISTS",
              data: {
                id: raced.id,
                authUserId: raced.authUserId,
                email: raced.email,
                status: raced.status,
              },
            },
            { status: 200 }
          );
        }
        return NextResponse.json(
          {
            ok: false,
            error: "Developer access is suspended. Explicit reactivation is required.",
            code: "CONFLICT",
          },
          { status: 409 }
        );
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof AuthGuardError) {
      const { status, body } = toSafeApiError(error, "Developer provisioning could not be completed.");
      return NextResponse.json(body, { status });
    }
    const { status, body } = toSafeApiError(error, "Developer provisioning could not be completed.");
    return NextResponse.json(body, { status });
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Method not allowed. Use POST.", code: "INVALID_REQUEST" },
    { status: 405 }
  );
}
