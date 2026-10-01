/**
 * HANSAN — Developer access lifecycle rules (PURE + transaction-scoped service).
 *
 * Suspend / reactivate management for DeveloperAccess grants, backing
 * PATCH /api/developer/access. Pure helpers carry no database, Supabase, or
 * Next.js imports and are loadable directly by the node:test suite; the
 * service function receives its transaction client as a parameter, so the
 * whole flow is unit-testable with a fake tx and never couples business rules
 * to Next.js request objects.
 *
 * SECURITY CONTRACT
 * - The actor is ALWAYS the authenticated developer resolved from the session
 *   by the route; it is never read from the request body. Body fields that
 *   could assert authority (actorUserId, actorAuthUserId, organizationId,
 *   outletId, staffId, role, status, permissions) are never read — only
 *   `action`, `targetAuthUserId`, `targetEmail` are parsed.
 * - Target resolution: `targetAuthUserId` (unique, authoritative) takes
 *   precedence over `targetEmail` (display snapshot, NOT unique). An email
 *   matching multiple grants is a safe 409 — never a guess.
 * - Status decisions use STRICT canonical values: only the exact stored values
 *   "ACTIVE" / "SUSPENDED" are valid states. Anything else is drift → 409.
 *   Drift is never silently normalized or repaired (note: the read-path gate
 *   `isActiveDeveloperRecord` normalizes case; the lifecycle is deliberately
 *   stricter so out-of-band tampering cannot be laundered through an API).
 * - State mutation and AuditLog creation happen inside the SAME caller-owned
 *   transaction: no mutation without audit, no audit without mutation.
 * - Tenant fields (actorStaffId, organizationId, outletId) are ALWAYS null:
 *   developer lifecycle is tenant-independent by construction and never
 *   consults Staff, Role, Organization, or Outlet for authority.
 * - Last-active-developer protection: after the conditional update, ACTIVE is
 *   recounted inside the same transaction; a post-update count of 0 aborts
 *   (rolls back) the transition. Self-suspension is prohibited separately.
 *   Residual race documented in docs/ARCHITECTURE-DECISIONS.md §5.
 * - No `@/` alias: relative imports only, so the module stays loadable by
 *   the node:test runner.
 */

import { normalizeDeveloperEmail, type DeveloperAccessStatus } from "./developer-access";

export class DeveloperLifecycleError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "DeveloperLifecycleError";
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Request parsing (allowlist: action + target selector; nothing else is read)
// ---------------------------------------------------------------------------

export const DEVELOPER_LIFECYCLE_ACTIONS = ["suspend", "reactivate"] as const;
export type DeveloperLifecycleAction = (typeof DEVELOPER_LIFECYCLE_ACTIONS)[number];

export type DeveloperLifecycleRequest = {
  action: DeveloperLifecycleAction;
  /** Authoritative target selector (unique in DeveloperAccess). */
  targetAuthUserId: string | null;
  /** Snapshot selector, normalized lowercase; only used when no authUserId. */
  targetEmail: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_AUTH_USER_ID_LENGTH = 255;
const MAX_EMAIL_LENGTH = 320;

/**
 * Parses the ONLY semantic fields (`action`, `targetAuthUserId`,
 * `targetEmail`). Authority fields are ignored outright — never read, never
 * validated, never forwarded. `action` is trimmed and case-normalized;
 * selectors are validated when supplied (fail fast, never silently ignored).
 */
export function parseDeveloperLifecycleBody(body: unknown): DeveloperLifecycleRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new DeveloperLifecycleError("Request body must be a JSON object.", 400);
  }

  const record = body as Record<string, unknown>;

  const rawAction = typeof record.action === "string" ? record.action.trim().toLowerCase() : "";
  if (rawAction !== "suspend" && rawAction !== "reactivate") {
    throw new DeveloperLifecycleError('action must be "suspend" or "reactivate".', 400);
  }
  const action = rawAction as DeveloperLifecycleAction;

  let targetAuthUserId: string | null = null;
  if (record.targetAuthUserId !== undefined && record.targetAuthUserId !== null) {
    if (typeof record.targetAuthUserId !== "string") {
      throw new DeveloperLifecycleError("targetAuthUserId must be a string.", 400);
    }
    const trimmed = record.targetAuthUserId.trim();
    if (!trimmed || trimmed.length > MAX_AUTH_USER_ID_LENGTH) {
      throw new DeveloperLifecycleError("targetAuthUserId is invalid.", 400);
    }
    targetAuthUserId = trimmed;
  }

  let targetEmail: string | null = null;
  if (record.targetEmail !== undefined && record.targetEmail !== null) {
    if (typeof record.targetEmail !== "string") {
      throw new DeveloperLifecycleError("targetEmail must be a string.", 400);
    }
    const normalized = normalizeDeveloperEmail(record.targetEmail);
    if (!normalized || normalized.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(normalized)) {
      throw new DeveloperLifecycleError("targetEmail is invalid.", 400);
    }
    targetEmail = normalized;
  }

  if (!targetAuthUserId && !targetEmail) {
    throw new DeveloperLifecycleError("targetAuthUserId or targetEmail is required.", 400);
  }

  return { action, targetAuthUserId, targetEmail };
}

// ---------------------------------------------------------------------------
// Target selector resolution (authUserId is unique + authoritative;
// email is a non-unique snapshot and only a fallback)
// ---------------------------------------------------------------------------

export type DeveloperLifecycleTargetLookup =
  | { selector: "authUserId"; authUserId: string }
  | { selector: "email"; email: string };

/** `targetAuthUserId` wins whenever both selectors were supplied. */
export function resolveDeveloperLifecycleTargetLookup(
  request: DeveloperLifecycleRequest
): DeveloperLifecycleTargetLookup {
  if (request.targetAuthUserId) {
    return { selector: "authUserId", authUserId: request.targetAuthUserId };
  }
  if (!request.targetEmail) {
    // Unreachable through parseDeveloperLifecycleBody; fail closed anyway.
    throw new DeveloperLifecycleError("targetAuthUserId or targetEmail is required.", 400);
  }
  return { selector: "email", email: request.targetEmail };
}

export type LifecycleGrantRecord = {
  id: string;
  authUserId: string;
  email: string;
  status: string;
};

export type EmailTargetResolution =
  | { outcome: "FOUND"; target: LifecycleGrantRecord }
  | { outcome: "NOT_FOUND" }
  | { outcome: "AMBIGUOUS" };

/** Email is not unique: two matches is a safe 409, never a guess. */
export function decideEmailTargetResolution(
  matches: LifecycleGrantRecord[]
): EmailTargetResolution {
  if (matches.length === 0) return { outcome: "NOT_FOUND" };
  if (matches.length > 1) return { outcome: "AMBIGUOUS" };
  return { outcome: "FOUND", target: matches[0] };
}

// ---------------------------------------------------------------------------
// Transition matrix (pure)
// ---------------------------------------------------------------------------

export type LifecycleTransitionDecision =
  | { outcome: "TARGET_NOT_FOUND" }
  | { outcome: "REJECT_SELF_SUSPEND" }
  | { outcome: "INVALID_STATE" }
  | { outcome: "NO_OP"; status: DeveloperAccessStatus }
  | { outcome: "PROCEED"; from: DeveloperAccessStatus; to: DeveloperAccessStatus };

/**
 * Pure transition decider for the stored target row.
 *
 *   suspend:    ACTIVE -> SUSPENDED (PROCEED) | SUSPENDED -> NO_OP | drift -> 409
 *   reactivate: SUSPENDED -> ACTIVE (PROCEED) | ACTIVE   -> NO_OP | drift -> 409
 *
 * Self-suspension is rejected BEFORE the status is consulted (prohibited for
 * v1 regardless of the target's state). Self-reactivation needs no guard: a
 * suspended developer can never pass requireDeveloperAccess to become an
 * actor in the first place. Stored status is matched STRICTLY — "active",
 * " active ", "INACTIVE", "" etc. are drift, never repaired.
 */
export function decideDeveloperLifecycleTransition(params: {
  action: DeveloperLifecycleAction;
  target: { authUserId: string; status: string } | null | undefined;
  actorAuthUserId: string;
}): LifecycleTransitionDecision {
  const { action, target, actorAuthUserId } = params;

  if (!target) {
    return { outcome: "TARGET_NOT_FOUND" };
  }

  // Actor and target are separate identities by rule; the actor may never
  // suspend themselves (v1 prohibition — protects the last-active invariant
  // against the most realistic self-lockout path).
  if (action === "suspend" && target.authUserId === actorAuthUserId) {
    return { outcome: "REJECT_SELF_SUSPEND" };
  }

  const status = target.status;

  if (status === "ACTIVE") {
    if (action === "suspend") return { outcome: "PROCEED", from: "ACTIVE", to: "SUSPENDED" };
    return { outcome: "NO_OP", status: "ACTIVE" };
  }

  if (status === "SUSPENDED") {
    if (action === "reactivate") return { outcome: "PROCEED", from: "SUSPENDED", to: "ACTIVE" };
    return { outcome: "NO_OP", status: "SUSPENDED" };
  }

  return { outcome: "INVALID_STATE" };
}

// ---------------------------------------------------------------------------
// Last-active-developer protection (pure decision, route supplies the count)
// ---------------------------------------------------------------------------

export type LastActiveProtectionDecision =
  | { ok: true }
  | { ok: false; reason: "LAST_ACTIVE_DEVELOPER" };

/**
 * The application must never intentionally commit
 * `count(DeveloperAccess WHERE status = "ACTIVE") === 0`: with every grant
 * suspended there is no ACTIVE developer left to reactivate anyone, and the
 * provisioning endpoint deliberately refuses to re-enable suspended grants.
 * Input is the ACTIVE count observed AFTER the conditional update ran in the
 * same transaction (the suspended target is therefore already excluded).
 */
export function decideLastActiveDeveloperProtection(
  activeCountAfterUpdate: number
): LastActiveProtectionDecision {
  if (activeCountAfterUpdate >= 1) return { ok: true };
  return { ok: false, reason: "LAST_ACTIVE_DEVELOPER" };
}

// ---------------------------------------------------------------------------
// Audit construction (pure)
// ---------------------------------------------------------------------------

export type DeveloperLifecycleAuditRecord = {
  actorUserId: string;
  actorStaffId: null;
  organizationId: null;
  outletId: null;
  entityType: "DEVELOPER_ACCESS";
  entityId: string;
  action: "DEVELOPER_SUSPENDED" | "DEVELOPER_REACTIVATED";
  metadata: {
    from: DeveloperAccessStatus;
    to: DeveloperAccessStatus;
    targetAuthUserId: string;
  };
};

/**
 * Builds the lifecycle audit row. actorUserId is the CURRENT authenticated
 * developer (unlike bootstrap provisioning, a real human actor exists).
 * Tenant fields are ALWAYS null. Metadata is factual only — no secrets,
 * tokens, passwords, or keys.
 */
export function buildDeveloperLifecycleAudit(params: {
  grantId: string;
  actorAuthUserId: string;
  targetAuthUserId: string;
  from: DeveloperAccessStatus;
  to: DeveloperAccessStatus;
}): DeveloperLifecycleAuditRecord {
  return {
    actorUserId: params.actorAuthUserId,
    actorStaffId: null,
    organizationId: null,
    outletId: null,
    entityType: "DEVELOPER_ACCESS",
    entityId: params.grantId,
    action: params.to === "SUSPENDED" ? "DEVELOPER_SUSPENDED" : "DEVELOPER_REACTIVATED",
    metadata: {
      from: params.from,
      to: params.to,
      targetAuthUserId: params.targetAuthUserId,
    },
  };
}

// ---------------------------------------------------------------------------
// Transaction-scoped service (caller owns prisma.$transaction; tx injected so
// the flow is unit-testable with a fake client and never imports Prisma)
// ---------------------------------------------------------------------------

export type LifecycleTxClient = {
  developerAccess: {
    findUnique(args: { where: { authUserId: string } }): Promise<LifecycleGrantRecord | null>;
    findMany(args: { where: { email: string }; take: number }): Promise<LifecycleGrantRecord[]>;
    updateMany(args: {
      where: { id: string; status: string };
      data: { status: string };
    }): Promise<{ count: number }>;
    count(args: { where: { status: string } }): Promise<number>;
  };
  auditLog: { create(args: { data: DeveloperLifecycleAuditRecord }): Promise<unknown> };
};

export type DeveloperLifecycleResult = {
  outcome: "TRANSITIONED" | "NO_OP";
  grant: { id: string; email: string; status: string };
};

/**
 * Executes one lifecycle action inside the CALLER's transaction.
 *
 * 1. Resolve the target (authUserId precedence, email ambiguity → 409).
 * 2. Pure transition decision (404 / self-suspend 409 / drift 409 / NO_OP).
 * 3. Conditional update — `where.status` must still equal the observed
 *    status; count 0 means a concurrent transition won → generic 409.
 * 4. Suspend only: recount ACTIVE in the same transaction; 0 → abort 409.
 * 5. Audit row in the same transaction (mutual rollback guaranteed).
 *
 * Throws DeveloperLifecycleError with the HTTP status the route should map:
 * 404 (absent), 409 (self-suspend, drift, ambiguous, concurrent, last-active).
 * NO_OP performs no update and writes no audit row.
 */
export async function applyDeveloperLifecycle(params: {
  tx: LifecycleTxClient;
  actorAuthUserId: string;
  request: DeveloperLifecycleRequest;
}): Promise<DeveloperLifecycleResult> {
  const { tx, actorAuthUserId, request } = params;

  // 1. Target resolution.
  const lookup = resolveDeveloperLifecycleTargetLookup(request);
  let target: LifecycleGrantRecord | null = null;

  if (lookup.selector === "authUserId") {
    target = await tx.developerAccess.findUnique({ where: { authUserId: lookup.authUserId } });
  } else {
    // take: 2 — a third match must not cost a full scan; 2 is already "many".
    const matches = await tx.developerAccess.findMany({
      where: { email: lookup.email },
      take: 2,
    });
    const resolution = decideEmailTargetResolution(matches);
    if (resolution.outcome === "NOT_FOUND") {
      throw new DeveloperLifecycleError("Developer grant not found.", 404);
    }
    if (resolution.outcome === "AMBIGUOUS") {
      throw new DeveloperLifecycleError(
        "targetEmail matches multiple developer grants; supply targetAuthUserId instead.",
        409
      );
    }
    target = resolution.target;
  }

  // Explicit null gate (authUserId branch): keeps the rest of the flow
  // non-null for TypeScript. The pure decider keeps its own TARGET_NOT_FOUND
  // outcome so the contract stays testable independently of this service.
  if (!target) {
    throw new DeveloperLifecycleError("Developer grant not found.", 404);
  }

  // 2. Pure transition decision.
  const decision = decideDeveloperLifecycleTransition({
    action: request.action,
    target,
    actorAuthUserId,
  });

  switch (decision.outcome) {
    case "TARGET_NOT_FOUND":
      throw new DeveloperLifecycleError("Developer grant not found.", 404);
    case "REJECT_SELF_SUSPEND":
      throw new DeveloperLifecycleError("You cannot suspend your own developer access.", 409);
    case "INVALID_STATE":
      // Never echo the stored value: only that drift exists is disclosed.
      throw new DeveloperLifecycleError(
        "Developer grant status is invalid and cannot be transitioned. Operator investigation required.",
        409
      );
    case "NO_OP":
      // Idempotent replay: no update, no audit row.
      return {
        outcome: "NO_OP",
        grant: { id: target.id, email: target.email, status: target.status },
      };
    case "PROCEED":
      break;
  }

  // 3. Conditional update. The row may have transitioned concurrently between
  //    the lookup and this statement; count 0 aborts with a safe 409 instead
  //    of blindly writing an unseen state.
  const updated = await tx.developerAccess.updateMany({
    where: { id: target.id, status: decision.from },
    data: { status: decision.to },
  });
  if (updated.count !== 1) {
    throw new DeveloperLifecycleError(
      "Target status changed concurrently. Re-read and retry.",
      409
    );
  }

  // 4. Last-active-developer protection (suspend only — reactivate can never
  //    reduce the ACTIVE count). Count runs after the update, in the same
  //    transaction, so this transaction's own transition is already reflected.
  if (decision.to === "SUSPENDED") {
    const activeCountAfter = await tx.developerAccess.count({ where: { status: "ACTIVE" } });
    const protection = decideLastActiveDeveloperProtection(activeCountAfter);
    if (!protection.ok) {
      throw new DeveloperLifecycleError(
        "Cannot suspend the last active developer. Reactivate or provision another developer first.",
        409
      );
    }
  }

  // 5. Audit in the SAME transaction — rollback is mutual.
  await tx.auditLog.create({
    data: buildDeveloperLifecycleAudit({
      grantId: target.id,
      actorAuthUserId,
      targetAuthUserId: target.authUserId,
      from: decision.from,
      to: decision.to,
    }),
  });

  return {
    outcome: "TRANSITIONED",
    grant: { id: target.id, email: target.email, status: decision.to },
  };
}