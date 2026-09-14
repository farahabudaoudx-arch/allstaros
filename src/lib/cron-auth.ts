import type { NextRequest } from "next/server";

export type CronAuthorization =
  | { ok: true }
  | { ok: false; status: 403 | 503; error: string };

/**
 * Scheduled jobs fail closed. A missing CRON_SECRET is a configuration error,
 * never permission to run. Secrets are accepted only in the Authorization
 * header so they do not leak into URLs, access logs, analytics, or referrers.
 */
export function authorizeCronRequest(request: NextRequest): CronAuthorization {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return { ok: false, status: 503, error: "Scheduled job authorization is not configured." };
  }
  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true };
}
