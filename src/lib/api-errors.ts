/**
 * HANSAN — safe API error responses.
 *
 * Route handlers previously returned `error.message` verbatim, which could
 * surface Prisma internals, provider wording, and infrastructure detail to the
 * client. This module is the single boundary that decides what a client is
 * allowed to see.
 *
 * Rules:
 *  - Only errors we raise ourselves (they carry a numeric `statusCode`) are
 *    eligible to have their message returned.
 *  - Anything that looks like infrastructure detail is replaced with a generic
 *    message, regardless of origin.
 *  - 5xx faults are logged server-side with URLs redacted, never returned.
 *  - The client always receives a stable machine-readable `code`.
 */

export type ApiErrorBody = {
  ok: false;
  error: string;
  code: string;
};

const CLIENT_SAFE_STATUS = new Set([400, 401, 403, 404, 409, 422, 429, 500, 503]);

const INTERNAL_DETAIL_PATTERN =
  /BLOCKED_EXTERNAL_DEPENDENCY|DATABASE_URL|DIRECT_URL|SUPABASE_|SERVICE_ROLE|Prisma|postgres|postgresql|P1001|P1012|P2002|ECONNREFUSED/i;

function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return "INVALID_REQUEST";
    case 401:
      return "UNAUTHENTICATED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 422:
      return "UNPROCESSABLE";
    case 429:
      return "RATE_LIMITED";
    case 503:
      return "UNAVAILABLE";
    default:
      return "INTERNAL_ERROR";
  }
}

function redactForLog(value: string): string {
  return value
    .replace(/\bpostgres(?:ql)?:\/\/\S+/gi, "[redacted-db-url]")
    .replace(/\bhttps?:\/\/\S+/gi, "[redacted-url]")
    .slice(0, 500);
}

export function toSafeApiError(
  error: unknown,
  fallbackMessage: string
): { status: number; body: ApiErrorBody } {
  const candidate = error as { statusCode?: unknown; message?: unknown } | null | undefined;

  const rawStatus = candidate?.statusCode;
  const status =
    typeof rawStatus === "number" && CLIENT_SAFE_STATUS.has(rawStatus) ? rawStatus : 500;

  const rawMessage = typeof candidate?.message === "string" ? candidate.message : "";

  // An error we raised carries a statusCode and was written for a caller. Even
  // then, refuse to echo anything that looks like infrastructure detail.
  const raisedByUs = typeof rawStatus === "number";
  const message =
    raisedByUs && rawMessage && !INTERNAL_DETAIL_PATTERN.test(rawMessage)
      ? rawMessage
      : fallbackMessage;

  if (status >= 500) {
    const diagnostic = error instanceof Error ? error.message : String(error);
    console.error(`[hansan:api] ${fallbackMessage} :: ${redactForLog(diagnostic)}`);
  }

  return {
    status,
    body: { ok: false, error: message, code: codeForStatus(status) },
  };
}
