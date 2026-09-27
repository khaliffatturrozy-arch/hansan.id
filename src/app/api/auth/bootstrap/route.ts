import { NextResponse } from "next/server";
import { AuthGuardError, buildOwnerBootstrapRecord, requireProtectedRequest } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const authContext = await requireProtectedRequest(request, ["settings.manage", "owner.hq.manage"]);
    const bootstrap = buildOwnerBootstrapRecord(authContext);

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
