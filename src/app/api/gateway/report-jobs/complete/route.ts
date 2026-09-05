import { NextResponse, type NextRequest } from "next/server";
import {
  completeGatewayReportPullJob,
  failGatewayReportPullJob,
  gatewayReportAgentAuthorized,
  gatewayReportAgentConfigured,
} from "@/lib/gateway/report-pulls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Outcome = "succeeded" | "failed" | "retryable" | "needs_reconnect";

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function POST(request: NextRequest) {
  if (!gatewayReportAgentConfigured()) {
    return NextResponse.json({ error: "gateway_report_agent_not_configured" }, { status: 503 });
  }
  if (!gatewayReportAgentAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const jobId = text(body?.jobId);
  const claimToken = text(body?.claimToken);
  const outcome = text(body?.outcome) as Outcome | null;
  const sessionGeneration = Number(body?.sessionGeneration);
  if (
    !jobId || !claimToken ||
    !outcome ||
    !["succeeded", "failed", "retryable", "needs_reconnect"].includes(outcome) ||
    !Number.isSafeInteger(sessionGeneration) ||
    sessionGeneration < 0
  ) {
    return NextResponse.json({ error: "invalid_completion_payload" }, { status: 400 });
  }

  try {
    if (outcome === "succeeded") {
      const accepted = await completeGatewayReportPullJob({
        jobId,
        sessionGeneration,
        claimToken,
        summary: body?.summary && typeof body.summary === "object"
          ? body.summary as Record<string, unknown>
          : {},
      });
      return NextResponse.json({ ok: accepted, status: accepted ? "succeeded" : "stale" }, {
        status: accepted ? 200 : 409,
      });
    }

    const status = await failGatewayReportPullJob({
      jobId,
      sessionGeneration,
      claimToken,
      error: text(body?.error),
      needsReconnect: outcome === "needs_reconnect",
      retryable: outcome === "retryable",
    });
    return NextResponse.json({ ok: status !== "stale", status }, { status: status === "stale" ? 409 : 200 });
  } catch (error) {
    console.error("[gateway-report-jobs/complete] Failed to complete report job.", error);
    return NextResponse.json(
      { error: "gateway_report_completion_failed" },
      { status: 500 },
    );
  }
}
