import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { PRODUCER_LOAD_ERROR_COPY } from "@/lib/producer/error-copy";
import { ProducerQueryError } from "@/lib/producer/query-error";

export type { ProducerQueryPhase } from "@/lib/producer/query-error";
export { ProducerQueryError } from "@/lib/producer/query-error";

export type ProducerLoadErrorContext = {
  route: string;
  rangeKey?: string;
  queryPhase?: string;
  roleType?: "builder" | "producer";
  /** Defaults to PRODUCER_LOAD_ERROR_COPY. */
  clientMessage?: string;
};

function normalizeError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === "object") {
    const e = err as { message?: unknown; code?: unknown };
    if (typeof e.message === "string") {
      const msg = e.code ? `${e.message} (${String(e.code)})` : e.message;
      return new Error(msg);
    }
  }
  return new Error("unknown error");
}

/**
 * Capture a producer load failure for Sentry and return a generic 500 JSON body.
 * Never includes Postgres/Supabase text or PII in the response.
 */
export function producerLoadErrorResponse(
  err: unknown,
  ctx: ProducerLoadErrorContext,
): NextResponse {
  const normalized = normalizeError(err);
  const queryPhase =
    ctx.queryPhase ??
    (err instanceof ProducerQueryError ? err.queryPhase : undefined);

  const tags: Record<string, string> = { route: ctx.route };
  if (ctx.rangeKey) tags.rangeKey = ctx.rangeKey;
  if (queryPhase) tags.queryPhase = queryPhase;
  if (ctx.roleType) tags.roleType = ctx.roleType;

  const eventId = Sentry.captureException(normalized, { tags });
  const correlationId =
    typeof eventId === "string" && eventId.length > 0 ? eventId : randomUUID();

  return NextResponse.json(
    {
      ok: false,
      error: ctx.clientMessage ?? PRODUCER_LOAD_ERROR_COPY,
      correlationId,
    },
    { status: 500 },
  );
}
