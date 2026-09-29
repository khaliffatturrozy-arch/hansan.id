/**
 * POST /api/auth/bootstrap
 *
 * Secure, idempotent owner bootstrap provisioning endpoint.
 *
 * This route:
 * 1. Requires a valid authenticated session (bearer token).
 * 2. Requires the caller to have owner.hq.manage and settings.manage permissions.
 * 3. Verifies the authenticated staff has an OWNER role.
 * 4. Writes an AuditLog record on first bootstrap (idempotent on replay).
 * 5. Returns a structured bootstrap record — never arbitrary data from client.
 *
 * SECURITY:
 * - Client-supplied organizationId/outletId/role/permissions are ignored.
 * - Bootstrap eligibility is determined server-side from the authenticated identity.
 * - Replay detection is done via AuditLog — second call returns REPLAYED status.
 * - Service-role key is required; anon key fallback is forbidden.
 */

import { NextResponse } from "next/server";
import { AuthGuardError, buildOwnerBootstrapRecord, requireProtectedRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const authContext = await requireProtectedRequest(request, ["settings.manage", "owner.hq.manage"]);
    const bootstrap = buildOwnerBootstrapRecord(authContext);

    // Check for an existing bootstrap audit record (idempotency)
    const existingBootstrap = await prisma.auditLog.findFirst({
      where: {
        actorUserId: authContext.userId,
        organizationId: authContext.organizationId,
        entityType: "OWNER_BOOTSTRAP",
        action: "BOOTSTRAP_COMPLETED",
      },
      select: { id: true, createdAt: true },
    });

    if (existingBootstrap) {
      // Idempotent replay — return REPLAYED status without writing again
      return NextResponse.json({
        ok: true,
        status: "REPLAYED",
        data: {
          ...bootstrap,
          bootstrapStatus: "REPLAYED",
          originalBootstrapAt: existingBootstrap.createdAt.toISOString(),
        },
      });
    }

    // First bootstrap — write an audit record
    await prisma.auditLog.create({
      data: {
        actorUserId: authContext.userId,
        actorStaffId: authContext.staffId,
        organizationId: authContext.organizationId,
        outletId: authContext.outletId || null,
        entityType: "OWNER_BOOTSTRAP",
        entityId: authContext.staffId,
        action: "BOOTSTRAP_COMPLETED",
        metadata: {
          roleName: authContext.roleName,
          permissions: authContext.permissions,
          bootstrappedAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({
      ok: true,
      status: bootstrap.bootstrapStatus,
      data: bootstrap,
    });
  } catch (error) {
    const status = error instanceof AuthGuardError ? error.statusCode : 500;

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Bootstrap could not be completed.",
      },
      { status }
    );
  }
}
