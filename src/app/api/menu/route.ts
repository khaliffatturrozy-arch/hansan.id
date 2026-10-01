import { NextResponse } from "next/server";
import { requireOutlet, requireProtectedRequest } from "@/lib/auth";
import { toSafeApiError } from "@/lib/api-errors";
import { listTenantMenu } from "@/lib/menu-service";
import { PERMISSION } from "@/lib/permissions";

// This route reads the request (session cookies), so it can never be static.
// Declared explicitly so the build does not attempt prerendering it.
export const dynamic = "force-dynamic";

/**
 * GET /api/menu
 *
 * Returns the catalog for the AUTHENTICATED tenant only.
 *
 * Authorization:
 *  - requires a valid server-side session (bearer or Supabase SSR cookie)
 *  - requires the `orders.read` permission, which the POS needs to operate.
 *    The canonical catalog also defines `menu.read`, but no role has been
 *    granted it yet, so requiring it here would lock out every existing owner.
 *    Moving the POS to `menu.read` must wait for real role management.
 *  - requires an assigned outlet, because the POS is an outlet-bound workstation
 *
 * The tenant is NEVER taken from the request. There is no query parameter, body
 * field, or header that can select another organization's catalog.
 *
 * An empty catalog is a valid response: the production database is allowed to be
 * empty, and the POS must show an honest empty state rather than dummy products.
 */
export async function GET(request: Request) {
  try {
    const authContext = await requireProtectedRequest(request, [PERMISSION.ORDERS_READ]);
    requireOutlet(authContext);

    const menu = await listTenantMenu(authContext.organizationId);

    return NextResponse.json({ ok: true, data: menu });
  } catch (error) {
    const { status, body } = toSafeApiError(error, "Gagal memuat katalog menu.");
    return NextResponse.json(body, { status });
  }
}
