import { NextResponse, type NextRequest } from "next/server";
import {
  claimGatewayReportPullJob,
  gatewayReportAgentAuthorized,
  gatewayReportAgentConfigured,
} from "@/lib/gateway/report-pulls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!gatewayReportAgentConfigured()) {
    return NextResponse.json({ error: "gateway_report_agent_not_configured" }, { status: 503 });
  }
  if (!gatewayReportAgentAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { leaseSeconds?: unknown };
  const leaseSeconds = body.leaseSeconds == null ? 1200 : Number(body.leaseSeconds);
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 60 || leaseSeconds > 3600) {
    return NextResponse.json({ error: "invalid_lease_seconds" }, { status: 400 });
  }

  try {
    const job = await claimGatewayReportPullJob(leaseSeconds);
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    console.error("[gateway-report-jobs/claim] Failed to claim report job.", error);
    return NextResponse.json(
      { error: "gateway_report_claim_failed" },
      { status: 500 },
    );
  }
}
