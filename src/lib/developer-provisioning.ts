/**
 * HANSAN — developer provisioning rules (PURE).
 *
 * Pure helpers for POST /api/auth/developer-provision. No database access,
 * no Supabase access, no Next.js imports, no `@/` alias — loadable directly
 * by the node:test suite.
 *
 * SECURITY CONTRACT
 * - The request body carries exactly ONE semantic field: `email` (lookup key).
 *   Authority fields (authUserId, isDeveloper, role, permissions,
 *   organizationId, outletId, staffId, status) are NEVER read.
 * - The authoritative authUserId always comes from the Supabase Admin API
 *   lookup performed by the route, never from the client.
 * - Email is trimmed + lowercased (same convention as staff provisioning);
 *   it is a lookup key and stored snapshot, never the identity key.
 */

import { normalizeDeveloperEmail } from "./developer-access";

export const DEVELOPER_PROVISION_SECRET_ENV = "HANSAN_DEVELOPER_PROVISION_SECRET";
export const DEVELOPER_PROVISION_SECRET_HEADER = "x-developer-provision-secret";

export class DeveloperProvisioningError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "DeveloperProvisioningError";
    this.statusCode = statusCode;
  }
}

export type DeveloperSecretGateResult =
  | { pass: true }
  | { pass: false; status: 500 | 403; message: string };

/**
 * Dedicated bootstrap secret gate. Same security pattern as the OWNER
 * provision gate: missing/empty env → 500 fail-closed; wrong/absent header →
 * generic 403. Timing-safe comparison with dummy compare on length mismatch.
 * The secret value never appears in any message.
 */
export function evaluateDeveloperProvisionSecretGate(
  envSecret: string | undefined,
  headerSecret: string | null,
  // Injectable timing-safe equal so tests stay deterministic without node:crypto
  // coupling at the call site; the route passes crypto.timingSafeEqual.
  timingSafeEqual: (a: Uint8Array, b: Uint8Array) => boolean
): DeveloperSecretGateResult {
  if (!envSecret) {
    return {
      pass: false,
      status: 500,
      message: `BLOCKED_EXTERNAL_DEPENDENCY: ${DEVELOPER_PROVISION_SECRET_ENV} is not configured.`,
    };
  }

  const secretMatch = (() => {
    if (!headerSecret) return false;
    const a = Buffer.from(envSecret, "utf8");
    const b = Buffer.from(headerSecret, "utf8");
    if (a.length !== b.length) {
      const dummy = Buffer.alloc(a.length);
      timingSafeEqual(a, dummy);
      return false;
    }
    return timingSafeEqual(a, b);
  })();

  if (!secretMatch) {
    return { pass: false, status: 403, message: "Developer provision secret is missing or incorrect." };
  }

  return { pass: true };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type DeveloperProvisionRequest = {
  email: string;
};

/**
 * Parses the ONLY semantic field (`email`). Every authority field that a
 * client might supply is ignored outright — it is never read, never
 * validated, never forwarded.
 */
export function parseDeveloperProvisionBody(body: unknown): DeveloperProvisionRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new DeveloperProvisioningError("Request body must be a JSON object.", 400);
  }

  const record = body as Record<string, unknown>;
  const raw = record.email;

  if (typeof raw !== "string" || !raw.trim()) {
    throw new DeveloperProvisioningError("email is required.", 400);
  }

  const email = normalizeDeveloperEmail(raw);
  if (email.length > 320) {
    throw new DeveloperProvisioningError("email must not exceed 320 characters.", 400);
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new DeveloperProvisioningError("email format is invalid.", 400);
  }

  return { email };
}

export type ExistingGrantInput = { status?: string | null } | null | undefined;

export type DeveloperProvisionDecision =
  | { outcome: "CREATE" }
  | { outcome: "EXISTS" }
  | { outcome: "SUSPENDED" };

/**
 * Idempotency decision on the stored grant looked up BY authUserId.
 * ACTIVE → EXISTS (no write). SUSPENDED/any other stored status → SUSPENDED
 * (explicit reactivation required, never auto-heal). Absent → CREATE.
 */
export function decideDeveloperProvision(
  existing: ExistingGrantInput
): DeveloperProvisionDecision {
  if (!existing) {
    return { outcome: "CREATE" };
  }
  const status = typeof existing.status === "string" ? existing.status.trim().toUpperCase() : "";
  if (status === "ACTIVE") {
    return { outcome: "EXISTS" };
  }
  return { outcome: "SUSPENDED" };
}

export type DeveloperProvisionAuditRecord = {
  actorUserId: string;
  actorStaffId: null;
  organizationId: null;
  outletId: null;
  entityType: "DEVELOPER_ACCESS";
  entityId: string;
  action: "DEVELOPER_PROVISIONED";
  metadata: {
    provisionedVia: "developer-provision-secret";
    email: string;
    authUserId: string;
  };
};

/**
 * Builds the audit row for a NEW grant. Tenant fields are ALWAYS null;
 * bootstrap attribution sets actorUserId to the TARGET identity (no human
 * actor precedes the first grant). Metadata is factual only — never secrets,
 * tokens, passwords, or keys.
 */
export function buildDeveloperProvisionAudit(
  grantId: string,
  authUserId: string,
  normalizedEmail: string
): DeveloperProvisionAuditRecord {
  return {
    actorUserId: authUserId,
    actorStaffId: null,
    organizationId: null,
    outletId: null,
    entityType: "DEVELOPER_ACCESS",
    entityId: grantId,
    action: "DEVELOPER_PROVISIONED",
    metadata: {
      provisionedVia: "developer-provision-secret",
      email: normalizedEmail,
      authUserId,
    },
  };
}

/** Detects a Prisma unique-constraint violation without leaking its details. */
export function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: unknown } | null | undefined;
  return !!candidate && candidate.code === "P2002";
}
