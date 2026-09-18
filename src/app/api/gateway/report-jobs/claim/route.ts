import { NextResponse, type NextRequest } from "next/server";
import {
  claimGatewayReportPullJob,
  gatewayReportAgentAuthorized,
  gatewayReportAgentConfigured,
} from "@/lib/gateway/report-pulls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function canonicalUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : null;
}

export async function POST(request: NextRequest) {
  if (!gatewayReportAgentConfigured()) {
    return NextResponse.json({ error: "gateway_report_agent_not_configured" }, { status: 503 });
  }
  if (!gatewayReportAgentAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as {
    claimRequestId?: unknown;
    leaseSeconds?: unknown;
  };
  const claimRequestId = canonicalUuid(body.claimRequestId);
  if (!claimRequestId) {
    return NextResponse.json({ error: "invalid_claim_request_id" }, { status: 400 });
  }
  const leaseSeconds = body.leaseSeconds == null ? 1200 : Number(body.leaseSeconds);
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 60 || leaseSeconds > 3600) {
    return NextResponse.json({ error: "invalid_lease_seconds" }, { status: 400 });
  }

  try {
    const job = await claimGatewayReportPullJob({ claimRequestId, leaseSeconds });
    return NextResponse.json({ ok: true, job });
  } catch {
    console.error("[gateway-report-jobs/claim] Failed to claim report job.");
    return NextResponse.json(
      { error: "gateway_report_claim_failed" },
      { status: 500 },
    );
  }
}
