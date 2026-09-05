import { NextResponse, type NextRequest } from "next/server";
import {
  gatewayReportAgentAuthorized,
  gatewayReportAgentConfigured,
  renewGatewayReportPullJobLease,
} from "@/lib/gateway/report-pulls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const sessionGeneration = Number(body?.sessionGeneration);
  const leaseSeconds = body?.leaseSeconds == null ? 1200 : Number(body.leaseSeconds);
  if (
    !jobId || !claimToken ||
    !Number.isSafeInteger(sessionGeneration) || sessionGeneration < 0 ||
    !Number.isInteger(leaseSeconds) || leaseSeconds < 60 || leaseSeconds > 3600
  ) {
    return NextResponse.json({ error: "invalid_renew_payload" }, { status: 400 });
  }

  try {
    const leaseExpiresAt = await renewGatewayReportPullJobLease({
      jobId,
      sessionGeneration,
      claimToken,
      leaseSeconds,
    });
    return NextResponse.json(
      { ok: leaseExpiresAt != null, status: leaseExpiresAt ? "renewed" : "stale", leaseExpiresAt },
      { status: leaseExpiresAt ? 200 : 409 },
    );
  } catch (error) {
    console.error("[gateway-report-jobs/renew] Failed to renew report lease.", error);
    return NextResponse.json({ error: "gateway_report_renew_failed" }, { status: 500 });
  }
}
