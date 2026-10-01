import { NextResponse } from "next/server";
import { toSafeApiError } from "@/lib/api-errors";
import { requireProtectedRequest, type AuthenticatedStaffContext } from "@/lib/auth";
import { assertCanManageStaff, parseCreateStaffRequest } from "@/lib/staff-provisioning";
import {
  createStaffForOrganization,
  listOrganizationStaff,
  listStaffManagementOptions,
  setStaffStatus,
} from "@/lib/staff-service";

/**
 * /api/staff — OWNER staff management.
 *
 * GET    list the caller's organization staff + assignable roles/outlets
 * POST   create a staff member (real Supabase Auth identity + Staff + role)
 * PATCH  activate / deactivate a staff member
 *
 * AUTHORIZATION
 *  - a valid server-side session is required (bearer or Supabase SSR cookie)
 *  - the caller must be an ACTIVE staff member whose role is OWNER
 *  - the caller must hold the existing `settings.manage` permission
 *  No new permission is introduced.
 *
 * TENANT ISOLATION
 *  organizationId is always `context.organizationId` and is never read from the
 *  body. A role or outlet belonging to another organization is rejected with 403.
 */

export const dynamic = "force-dynamic";

async function requireOwnerStaffManager(
  request: Request
): Promise<AuthenticatedStaffContext> {
  const context = await requireProtectedRequest(request, []);
  assertCanManageStaff(context);
  return context;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("INVALID_JSON");
  }
}

export async function GET(request: Request) {
  try {
    const context = await requireOwnerStaffManager(request);

    const [staff, options] = await Promise.all([
      listOrganizationStaff(context),
      listStaffManagementOptions(context),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        staff,
        roles: options.roles,
        outlets: options.outlets,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_JSON") {
      return NextResponse.json(
        { ok: false, error: "Payload tidak valid.", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }
    const { status, body } = toSafeApiError(error, "Gagal memuat data staff.");
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    // Authenticate FIRST, then parse. An unauthenticated caller learns nothing
    // about the request shape, and the tenant/actor are resolved before any
    // untrusted body is interpreted.
    const context = await requireOwnerStaffManager(request);

    // Parse the OWNER-supplied fields only. Identity/authorization fields in
    // the body are ignored by parseCreateStaffRequest.
    const input = parseCreateStaffRequest(await readJson(request));

    const result = await createStaffForOrganization(context, input);

    return NextResponse.json(
      { ok: true, data: { staff: result.staff, warnings: result.warnings } },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_JSON") {
      return NextResponse.json(
        { ok: false, error: "Payload tidak valid.", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }
    const { status, body } = toSafeApiError(error, "Gagal membuat staff.");
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    // Authenticate before interpreting the body (same rule as POST).
    const context = await requireOwnerStaffManager(request);

    const body = (await readJson(request)) as Record<string, unknown>;

    const staffId = typeof body.staffId === "string" ? body.staffId.trim() : "";
    const status = typeof body.status === "string" ? body.status : "";

    if (!staffId || !status) {
      return NextResponse.json(
        {
          ok: false,
          error: "staffId dan status wajib diisi.",
          code: "INVALID_REQUEST",
        },
        { status: 400 }
      );
    }

    const staff = await setStaffStatus(context, staffId, status);

    return NextResponse.json({ ok: true, data: { staff } });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_JSON") {
      return NextResponse.json(
        { ok: false, error: "Payload tidak valid.", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }
    const { status, body } = toSafeApiError(error, "Gagal memperbarui status staff.");
    return NextResponse.json(body, { status });
  }
}
