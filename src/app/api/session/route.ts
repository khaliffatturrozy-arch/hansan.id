import { NextResponse } from "next/server";
import { requireOutlet, requireProtectedRequest } from "@/lib/auth";
import { toSafeApiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";

// This route reads the request (session cookies), so it can never be static.
// Declared explicitly so the build does not attempt prerendering it.
export const dynamic = "force-dynamic";

/**
 * GET /api/session
 *
 * Returns the identity of the CALLER, resolved entirely server-side, so the POS
 * can display real values instead of hardcoded ones:
 *
 *   - cashier name  (Staff.firstName + lastName, falling back to the auth email)
 *   - organization  (real Organization row for the authenticated tenant)
 *   - outlet        (real Outlet row, verified to belong to that organization)
 *   - role and permissions (from the database, already permission-checked)
 *
 * No identity field is accepted from the client. There is nothing to spoof: the
 * response is derived from the authenticated session and the caller's own Staff
 * record.
 *
 * An assigned outlet is required, because the POS is an outlet-bound workstation
 * and an outlet-less staff member cannot operate it. The rejection is explicit
 * (403) rather than an empty-string fallback.
 */
export async function GET(request: Request) {
  try {
    const authContext = await requireProtectedRequest(request, []);
    const outletId = requireOutlet(authContext);

    const [organization, outlet] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: authContext.organizationId },
        select: { id: true, name: true, slug: true },
      }),
      prisma.outlet.findUnique({
        where: { id: outletId },
        select: { id: true, name: true, slug: true, organizationId: true },
      }),
    ]);

    if (!organization) {
      throw new Error("BLOCKED_EXTERNAL_DEPENDENCY: Organization not found for authenticated staff.");
    }

    // Defense in depth: an outlet that belongs to another organization must never
    // be usable as a POS context, even if it were somehow assigned to the staff.
    if (!outlet || outlet.organizationId !== organization.id) {
      throw new Error("BLOCKED_EXTERNAL_DEPENDENCY: Outlet is not part of the authenticated organization.");
    }

    return NextResponse.json({
      ok: true,
      data: {
        staff: {
          id: authContext.staffId,
          name: authContext.staffName ?? authContext.email,
          email: authContext.email,
        },
        organization: { id: organization.id, name: organization.name, slug: organization.slug },
        outlet: { id: outlet.id, name: outlet.name, slug: outlet.slug },
        roleName: authContext.roleName,
        permissions: authContext.permissions,
      },
    });
  } catch (error) {
    const { status, body } = toSafeApiError(error, "Gagal memuat konteks sesi.");
    return NextResponse.json(body, { status });
  }
}
