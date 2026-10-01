/**
 * HANSAN — developer lifecycle tests (PURE + injected fake transaction).
 *
 * Covers the rules and the tx-scoped service in ./developer-lifecycle without
 * touching a database, Supabase, secrets, or Next.js. The service is driven
 * with a fake transaction client so the full flow (resolution → decision →
 * conditional update → last-active recount → audit) is verifiable offline.
 * No `@/` alias (node:test has none); unique local identifiers avoid tsc
 * global-scope collisions.
 */

import {
  DeveloperLifecycleError,
  applyDeveloperLifecycle,
  buildDeveloperLifecycleAudit,
  decideDeveloperLifecycleTransition,
  decideEmailTargetResolution,
  decideLastActiveDeveloperProtection,
  parseDeveloperLifecycleBody,
  resolveDeveloperLifecycleTargetLookup,
} from "./developer-lifecycle";
import { isActiveDeveloperRecord } from "./developer-access";
import { toSafeApiError } from "./api-errors";

const devLifeAssert = require("node:assert/strict");
const { describe: devLifeDescribe, it: devLifeIt } = require("node:test");

type DevLifeGrant = { id: string; authUserId: string; email: string; status: string };

type DevLifeFakeOptions = {
  grant?: DevLifeGrant | null;
  emailMatches?: DevLifeGrant[];
  /** ACTIVE count seen by the last-active recount (default 1: safe). */
  activeCountAfter?: number;
  /** updateMany affected-rows count (default 1: transition won the race). */
  updateCount?: number;
};

function makeDevLifeFakeTx(options: DevLifeFakeOptions) {
  const devLifeCalls = {
    findUnique: [] as Array<{ where: { authUserId: string } }>,
    findMany: [] as Array<{ where: { email: string }; take: number }>,
    updateMany: [] as Array<{ where: { id: string; status: string }; data: { status: string } }>,
    count: [] as Array<{ where: { status: string } }>,
    audit: [] as Array<Record<string, unknown>>,
  };
  const devLifeTx = {
    developerAccess: {
      findUnique: async (args: { where: { authUserId: string } }) => {
        devLifeCalls.findUnique.push(args);
        return options.grant ?? null;
      },
      findMany: async (args: { where: { email: string }; take: number }) => {
        devLifeCalls.findMany.push(args);
        return options.emailMatches ?? [];
      },
      updateMany: async (args: { where: { id: string; status: string }; data: { status: string } }) => {
        devLifeCalls.updateMany.push(args);
        return { count: options.updateCount ?? 1 };
      },
      count: async (args: { where: { status: string } }) => {
        devLifeCalls.count.push(args);
        return options.activeCountAfter ?? 1;
      },
    },
    auditLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        devLifeCalls.audit.push(args.data);
        return {};
      },
    },
  };
  return { tx: devLifeTx, calls: devLifeCalls };
}

/** Captures the HTTP status a thrown DeveloperLifecycleError maps to. */
async function devLifeErrorCode(fn: () => Promise<unknown>): Promise<number> {
  try {
    await fn();
  } catch (error) {
    return (error as { statusCode?: number })?.statusCode ?? -1;
  }
  return -1;
}

const DEV_LIFE_TARGET: DevLifeGrant = {
  id: "grant_target_1",
  authUserId: "auth-target-1",
  email: "target@example.com",
  status: "ACTIVE",
};

// ---------------------------------------------------------------------------

devLifeDescribe("developer lifecycle body parsing", () => {
  devLifeIt("1. action accepts suspend/reactivate (trimmed, case-insensitive)", () => {
    devLifeAssert.deepEqual(
      parseDeveloperLifecycleBody({ action: "  SUSPEND ", targetAuthUserId: "u1" }),
      { action: "suspend", targetAuthUserId: "u1", targetEmail: null }
    );
    devLifeAssert.deepEqual(
      parseDeveloperLifecycleBody({ action: "Reactivate", targetEmail: "a@b.co" }),
      { action: "reactivate", targetAuthUserId: null, targetEmail: "a@b.co" }
    );
  });

  devLifeIt("2. invalid action / missing selector / non-object → 400", () => {
    devLifeAssert.throws(() => parseDeveloperLifecycleBody(null), /JSON object/i);
    devLifeAssert.throws(() => parseDeveloperLifecycleBody([]), /JSON object/i);
    devLifeAssert.throws(() => parseDeveloperLifecycleBody({ targetAuthUserId: "u1" }), /action/i);
    devLifeAssert.throws(
      () => parseDeveloperLifecycleBody({ action: "delete", targetAuthUserId: "u1" }),
      /action/i
    );
    devLifeAssert.throws(() => parseDeveloperLifecycleBody({ action: "suspend" }), /target/i);
  });

  devLifeIt("2b. invalid selector values fail fast (400), never silently ignored", () => {
    devLifeAssert.throws(
      () => parseDeveloperLifecycleBody({ action: "suspend", targetAuthUserId: "  " }),
      /targetAuthUserId/i
    );
    devLifeAssert.throws(
      () => parseDeveloperLifecycleBody({ action: "suspend", targetEmail: "not-an-email" }),
      /targetEmail/i
    );
    devLifeAssert.throws(
      () => parseDeveloperLifecycleBody({ action: "suspend", targetAuthUserId: 42 }),
      /targetAuthUserId/i
    );
  });

  devLifeIt("3. authority fields are ignored, never read (actor/target separation)", () => {
    const parsed = parseDeveloperLifecycleBody({
      action: "suspend",
      targetAuthUserId: "auth-target-1",
      actorUserId: "auth-evil-actor",
      actorAuthUserId: "auth-evil-actor",
      organizationId: "org_x",
      outletId: "out_x",
      staffId: "staff_x",
      role: "OWNER",
      status: "ACTIVE",
      permissions: ["*"],
    });
    devLifeAssert.deepEqual(parsed, {
      action: "suspend",
      targetAuthUserId: "auth-target-1",
      targetEmail: null,
    });
    for (const forbidden of ["actorUserId", "actorAuthUserId", "status", "role", "organizationId"]) {
      devLifeAssert.equal(forbidden in parsed, false, `${forbidden} must never reach the service`);
    }
  });

  devLifeIt("4. targetAuthUserId takes precedence over targetEmail", () => {
    const parsed = parseDeveloperLifecycleBody({
      action: "suspend",
      targetAuthUserId: "auth-target-1",
      targetEmail: "TARGET@Example.com",
    });
    devLifeAssert.deepEqual(resolveDeveloperLifecycleTargetLookup(parsed), {
      selector: "authUserId",
      authUserId: "auth-target-1",
    });
  });

  devLifeIt("5. email-only selector is normalized lowercase", () => {
    const parsed = parseDeveloperLifecycleBody({ action: "suspend", targetEmail: " Dev@Example.COM " });
    devLifeAssert.deepEqual(resolveDeveloperLifecycleTargetLookup(parsed), {
      selector: "email",
      email: "dev@example.com",
    });
  });
});

devLifeDescribe("developer lifecycle email ambiguity", () => {
  devLifeIt("6. zero matches → NOT_FOUND, one → FOUND, two → AMBIGUOUS (never guess)", () => {
    devLifeAssert.deepEqual(decideEmailTargetResolution([]), { outcome: "NOT_FOUND" });
    devLifeAssert.deepEqual(decideEmailTargetResolution([DEV_LIFE_TARGET]), {
      outcome: "FOUND",
      target: DEV_LIFE_TARGET,
    });
    devLifeAssert.equal(
      decideEmailTargetResolution([DEV_LIFE_TARGET, { ...DEV_LIFE_TARGET, id: "other" }]).outcome,
      "AMBIGUOUS"
    );
  });
});

devLifeDescribe("developer lifecycle transition matrix (pure)", () => {
  const actor = "auth-actor-1";

  devLifeIt("7. suspend: ACTIVE target → PROCEED ACTIVE->SUSPENDED", () => {
    devLifeAssert.deepEqual(
      decideDeveloperLifecycleTransition({ action: "suspend", target: DEV_LIFE_TARGET, actorAuthUserId: actor }),
      { outcome: "PROCEED", from: "ACTIVE", to: "SUSPENDED" }
    );
  });

  devLifeIt("8. reactivate: SUSPENDED target → PROCEED SUSPENDED->ACTIVE", () => {
    devLifeAssert.deepEqual(
      decideDeveloperLifecycleTransition({
        action: "reactivate",
        target: { ...DEV_LIFE_TARGET, status: "SUSPENDED" },
        actorAuthUserId: actor,
      }),
      { outcome: "PROCEED", from: "SUSPENDED", to: "ACTIVE" }
    );
  });

  devLifeIt("9. NO_OP: reactivate on ACTIVE, suspend on SUSPENDED", () => {
    devLifeAssert.deepEqual(
      decideDeveloperLifecycleTransition({ action: "reactivate", target: DEV_LIFE_TARGET, actorAuthUserId: actor }),
      { outcome: "NO_OP", status: "ACTIVE" }
    );
    devLifeAssert.deepEqual(
      decideDeveloperLifecycleTransition({
        action: "suspend",
        target: { ...DEV_LIFE_TARGET, status: "SUSPENDED" },
        actorAuthUserId: actor,
      }),
      { outcome: "NO_OP", status: "SUSPENDED" }
    );
  });

  devLifeIt("10. self-suspend rejected regardless of target status", () => {
    for (const status of ["ACTIVE", "SUSPENDED", "INACTIVE"]) {
      devLifeAssert.equal(
        decideDeveloperLifecycleTransition({
          action: "suspend",
          target: { ...DEV_LIFE_TARGET, authUserId: actor, status },
          actorAuthUserId: actor,
        }).outcome,
        "REJECT_SELF_SUSPEND"
      );
    }
    // The guard is suspend-only: self-targeted reactivate is NOT rejected here
    // (unreachable in practice — a suspended developer cannot pass the gate).
    devLifeAssert.equal(
      decideDeveloperLifecycleTransition({
        action: "reactivate",
        target: { ...DEV_LIFE_TARGET, authUserId: actor, status: "SUSPENDED" },
        actorAuthUserId: actor,
      }).outcome,
      "PROCEED"
    );
  });

  devLifeIt("11. drift status is INVALID_STATE — strict, never normalized", () => {
    for (const drift of ["INACTIVE", "active", " active ", "", "SUSPEND", "PENDING"]) {
      devLifeAssert.equal(
        decideDeveloperLifecycleTransition({
          action: "suspend",
          target: { ...DEV_LIFE_TARGET, status: drift },
          actorAuthUserId: actor,
        }).outcome,
        "INVALID_STATE",
        `stored status "${drift}" must not be repaired`
      );
    }
  });

  devLifeIt("12. missing target → TARGET_NOT_FOUND", () => {
    devLifeAssert.equal(
      decideDeveloperLifecycleTransition({ action: "suspend", target: null, actorAuthUserId: actor }).outcome,
      "TARGET_NOT_FOUND"
    );
  });
});

devLifeDescribe("developer lifecycle last-active protection (pure)", () => {
  devLifeIt("13. count 0 blocks; count >= 1 passes", () => {
    devLifeAssert.deepEqual(decideLastActiveDeveloperProtection(0), {
      ok: false,
      reason: "LAST_ACTIVE_DEVELOPER",
    });
    devLifeAssert.equal(decideLastActiveDeveloperProtection(1).ok, true);
    devLifeAssert.equal(decideLastActiveDeveloperProtection(7).ok, true);
  });
});

devLifeDescribe("developer lifecycle audit builder", () => {
  devLifeIt("14. exact payload: real actor, null tenant fields, {from,to,target}", () => {
    devLifeAssert.deepEqual(
      buildDeveloperLifecycleAudit({
        grantId: "grant_target_1",
        actorAuthUserId: "auth-actor-1",
        targetAuthUserId: "auth-target-1",
        from: "ACTIVE",
        to: "SUSPENDED",
      }),
      {
        actorUserId: "auth-actor-1",
        actorStaffId: null,
        organizationId: null,
        outletId: null,
        entityType: "DEVELOPER_ACCESS",
        entityId: "grant_target_1",
        action: "DEVELOPER_SUSPENDED",
        metadata: { from: "ACTIVE", to: "SUSPENDED", targetAuthUserId: "auth-target-1" },
      }
    );
    devLifeAssert.equal(
      buildDeveloperLifecycleAudit({
        grantId: "g",
        actorAuthUserId: "a",
        targetAuthUserId: "t",
        from: "SUSPENDED",
        to: "ACTIVE",
      }).action,
      "DEVELOPER_REACTIVATED"
    );
  });

  devLifeIt("15. audit metadata is factual — never secrets/tokens/credentials", () => {
    const audit = buildDeveloperLifecycleAudit({
      grantId: "g",
      actorAuthUserId: "a",
      targetAuthUserId: "t",
      from: "ACTIVE",
      to: "SUSPENDED",
    });
    devLifeAssert.doesNotMatch(JSON.stringify(audit), /secret|token|password|api[_-]?key/i);
  });
});

devLifeDescribe("developer lifecycle authorization parity", () => {
  devLifeIt("16. suspended developer cannot pass the ACTIVE gate (fail closed)", () => {
    devLifeAssert.equal(isActiveDeveloperRecord({ status: "SUSPENDED" }), false);
    devLifeAssert.equal(isActiveDeveloperRecord({ status: "ACTIVE" }), true);
    // Same denial shape as unknown: null/undefined are also inactive, so
    // requireDeveloperAccess collapses "suspended" and "no grant" into one
    // generic 403 — no enumeration oracle.
    devLifeAssert.equal(isActiveDeveloperRecord(null), false);
    devLifeAssert.equal(isActiveDeveloperRecord(undefined), false);
  });
});

devLifeDescribe("developer lifecycle error mapping (toSafeApiError)", () => {
  devLifeIt("17. raised errors map to their status with stable codes", () => {
    const conflict = toSafeApiError(
      new DeveloperLifecycleError("Cannot suspend the last active developer.", 409),
      "fallback"
    );
    devLifeAssert.equal(conflict.status, 409);
    devLifeAssert.equal(conflict.body.code, "CONFLICT");

    const missing = toSafeApiError(new DeveloperLifecycleError("Developer grant not found.", 404), "fallback");
    devLifeAssert.equal(missing.status, 404);
    devLifeAssert.equal(missing.body.code, "NOT_FOUND");
  });

  devLifeIt("18. raw infrastructure failure → generic 500, internals never leak", () => {
    const { status, body } = toSafeApiError(
      new Error("PrismaClientKnownRequestError: Invalid invocation ... P2002 ... postgresql://user:pw@host/db"),
      "Developer lifecycle update could not be completed."
    );
    devLifeAssert.equal(status, 500);
    devLifeAssert.equal(body.code, "INTERNAL_ERROR");
    devLifeAssert.doesNotMatch(body.error, /Prisma|P2002|postgres/i);
  });
});

devLifeDescribe("applyDeveloperLifecycle (fake transaction client)", () => {
  const actor = "auth-actor-1";

  devLifeIt("19. suspend ACTIVE → TRANSITIONED; conditional update; exact audit; tenant null", async () => {
    const { tx, calls } = makeDevLifeFakeTx({ grant: DEV_LIFE_TARGET, activeCountAfter: 2 });
    const result = await applyDeveloperLifecycle({
      tx,
      actorAuthUserId: actor,
      request: { action: "suspend", targetAuthUserId: "auth-target-1", targetEmail: null },
    });
    devLifeAssert.deepEqual(result, {
      outcome: "TRANSITIONED",
      grant: { id: "grant_target_1", email: "target@example.com", status: "SUSPENDED" },
    });
    devLifeAssert.equal(calls.updateMany.length, 1);
    devLifeAssert.deepEqual(calls.updateMany[0].where, { id: "grant_target_1", status: "ACTIVE" });
    devLifeAssert.deepEqual(calls.updateMany[0].data, { status: "SUSPENDED" });
    devLifeAssert.equal(calls.audit.length, 1);
    devLifeAssert.deepEqual(calls.audit[0], {
      actorUserId: actor,
      actorStaffId: null,
      organizationId: null,
      outletId: null,
      entityType: "DEVELOPER_ACCESS",
      entityId: "grant_target_1",
      action: "DEVELOPER_SUSPENDED",
      metadata: { from: "ACTIVE", to: "SUSPENDED", targetAuthUserId: "auth-target-1" },
    });
  });

  devLifeIt("20. reactivate SUSPENDED → TRANSITIONED; no recount needed", async () => {
    const { tx, calls } = makeDevLifeFakeTx({ grant: { ...DEV_LIFE_TARGET, status: "SUSPENDED" } });
    const result = await applyDeveloperLifecycle({
      tx,
      actorAuthUserId: actor,
      request: { action: "reactivate", targetAuthUserId: "auth-target-1", targetEmail: null },
    });
    devLifeAssert.equal(result.outcome, "TRANSITIONED");
    devLifeAssert.equal(result.grant.status, "ACTIVE");
    devLifeAssert.deepEqual(calls.updateMany[0].where, { id: "grant_target_1", status: "SUSPENDED" });
    devLifeAssert.equal(calls.count.length, 0, "reactivate cannot reduce the ACTIVE count — no recount");
    devLifeAssert.equal(calls.audit.length, 1);
    devLifeAssert.equal((calls.audit[0] as { action: string }).action, "DEVELOPER_REACTIVATED");
  });

  devLifeIt("21. NO_OP paths write NOTHING (no update, no audit) for both replays", async () => {
    const suspendReplay = makeDevLifeFakeTx({ grant: { ...DEV_LIFE_TARGET, status: "SUSPENDED" } });
    const r1 = await applyDeveloperLifecycle({
      tx: suspendReplay.tx,
      actorAuthUserId: actor,
      request: { action: "suspend", targetAuthUserId: "auth-target-1", targetEmail: null },
    });
    devLifeAssert.deepEqual(r1, {
      outcome: "NO_OP",
      grant: { id: "grant_target_1", email: "target@example.com", status: "SUSPENDED" },
    });

    const reactivateReplay = makeDevLifeFakeTx({ grant: DEV_LIFE_TARGET });
    const r2 = await applyDeveloperLifecycle({
      tx: reactivateReplay.tx,
      actorAuthUserId: actor,
      request: { action: "reactivate", targetAuthUserId: "auth-target-1", targetEmail: null },
    });
    devLifeAssert.equal(r2.outcome, "NO_OP");

    for (const flow of [suspendReplay, reactivateReplay]) {
      devLifeAssert.equal(flow.calls.updateMany.length, 0);
      devLifeAssert.equal(flow.calls.audit.length, 0);
    }
  });

  devLifeIt("22. self-suspend → 409 BEFORE any write", async () => {
    const { tx, calls } = makeDevLifeFakeTx({ grant: { ...DEV_LIFE_TARGET, authUserId: actor } });
    const code = await devLifeErrorCode(() =>
      applyDeveloperLifecycle({
        tx,
        actorAuthUserId: actor,
        request: { action: "suspend", targetAuthUserId: actor, targetEmail: null },
      })
    );
    devLifeAssert.equal(code, 409);
    devLifeAssert.equal(calls.updateMany.length, 0);
    devLifeAssert.equal(calls.audit.length, 0);
  });

  devLifeIt("23. absent → 404; drift → 409; ambiguous email → 409; no writes", async () => {
    const absent = await devLifeErrorCode(() =>
      applyDeveloperLifecycle({
        tx: makeDevLifeFakeTx({ grant: null }).tx,
        actorAuthUserId: actor,
        request: { action: "suspend", targetAuthUserId: "auth-unknown", targetEmail: null },
      })
    );
    devLifeAssert.equal(absent, 404);

    const drift = await devLifeErrorCode(() =>
      applyDeveloperLifecycle({
        tx: makeDevLifeFakeTx({ grant: { ...DEV_LIFE_TARGET, status: "INACTIVE" } }).tx,
        actorAuthUserId: actor,
        request: { action: "suspend", targetAuthUserId: "auth-target-1", targetEmail: null },
      })
    );
    devLifeAssert.equal(drift, 409);

    const ambiguous = makeDevLifeFakeTx({
      emailMatches: [DEV_LIFE_TARGET, { ...DEV_LIFE_TARGET, id: "grant_target_2", authUserId: "auth-target-2" }],
    });
    const ambiguousCode = await devLifeErrorCode(() =>
      applyDeveloperLifecycle({
        tx: ambiguous.tx,
        actorAuthUserId: actor,
        request: { action: "suspend", targetAuthUserId: null, targetEmail: "target@example.com" },
      })
    );
    devLifeAssert.equal(ambiguousCode, 409);
    devLifeAssert.equal(ambiguous.calls.updateMany.length, 0);
    devLifeAssert.equal(ambiguous.calls.audit.length, 0);
  });

  devLifeIt("24. email selector: normalized findMany (take 2), never findUnique", async () => {
    const { tx, calls } = makeDevLifeFakeTx({
      emailMatches: [{ ...DEV_LIFE_TARGET, status: "SUSPENDED" }],
    });
    // The route feeds the service PARSER output, which normalizes the email;
    // the service must look up with that normalized snapshot value.
    const parsed = parseDeveloperLifecycleBody({
      action: "reactivate",
      targetEmail: "TARGET@Example.com",
    });
    const result = await applyDeveloperLifecycle({ tx, actorAuthUserId: actor, request: parsed });
    devLifeAssert.equal(result.outcome, "TRANSITIONED");
    devLifeAssert.equal(calls.findUnique.length, 0);
    devLifeAssert.deepEqual(calls.findMany[0], { where: { email: "target@example.com" }, take: 2 });
  });

  devLifeIt("25. both selectors → authUserId path wins; email lookup never runs", async () => {
    const { tx, calls } = makeDevLifeFakeTx({ grant: DEV_LIFE_TARGET, activeCountAfter: 2 });
    const result = await applyDeveloperLifecycle({
      tx,
      actorAuthUserId: actor,
      request: { action: "suspend", targetAuthUserId: "auth-target-1", targetEmail: "target@example.com" },
    });
    devLifeAssert.equal(result.outcome, "TRANSITIONED");
    devLifeAssert.equal(calls.findMany.length, 0);
    devLifeAssert.deepEqual(calls.findUnique[0], { where: { authUserId: "auth-target-1" } });
  });

  devLifeIt("26. last-active protection: recount 0 → 409, audit NEVER written", async () => {
    const { tx, calls } = makeDevLifeFakeTx({ grant: DEV_LIFE_TARGET, activeCountAfter: 0 });
    const code = await devLifeErrorCode(() =>
      applyDeveloperLifecycle({
        tx,
        actorAuthUserId: actor,
        request: { action: "suspend", targetAuthUserId: "auth-target-1", targetEmail: null },
      })
    );
    devLifeAssert.equal(code, 409);
    // In a real Prisma transaction the failed guard aborts the transaction,
    // rolling back the conditional update; here the fake proves the recount
    // ran AFTER the update and the audit row is never even attempted.
    devLifeAssert.equal(calls.count.length, 1);
    devLifeAssert.deepEqual(calls.count[0], { where: { status: "ACTIVE" } });
    devLifeAssert.equal(calls.audit.length, 0);
  });

  devLifeIt("27. concurrent transition wins → conditional update count 0 → 409", async () => {
    const { tx, calls } = makeDevLifeFakeTx({ grant: DEV_LIFE_TARGET, updateCount: 0 });
    const code = await devLifeErrorCode(() =>
      applyDeveloperLifecycle({
        tx,
        actorAuthUserId: actor,
        request: { action: "suspend", targetAuthUserId: "auth-target-1", targetEmail: null },
      })
    );
    devLifeAssert.equal(code, 409);
    devLifeAssert.equal(calls.updateMany.length, 1);
    devLifeAssert.equal(calls.count.length, 0, "lost race must not proceed to the recount");
    devLifeAssert.equal(calls.audit.length, 0);
  });

  devLifeIt("28. audit actor is the SESSION actor, never the request body", async () => {
    // The parsed request type physically carries no actor field; the service
    // signature requires an explicit actorAuthUserId supplied by the route
    // from the session only. This test pins the contract: audit actorUserId
    // equals the session actor even though the target identity differs.
    const { tx, calls } = makeDevLifeFakeTx({ grant: DEV_LIFE_TARGET, activeCountAfter: 5 });
    await applyDeveloperLifecycle({
      tx,
      actorAuthUserId: actor,
      request: { action: "suspend", targetAuthUserId: "auth-target-1", targetEmail: null },
    });
    devLifeAssert.equal((calls.audit[0] as { actorUserId: string }).actorUserId, actor);
    devLifeAssert.equal(
      (calls.audit[0] as { metadata: { targetAuthUserId: string } }).metadata.targetAuthUserId,
      "auth-target-1"
    );
  });
});