import { NextResponse, type NextRequest } from "next/server";
import {
  gatewayReportAgentConfigured,
  mintGatewayScheduledReportPullJobs,
} from "@/lib/gateway/report-pulls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Gateway report pull cron is not configured." }, { status: 503 });
  }
  if (!gatewayReportAgentConfigured()) {
    return NextResponse.json({ error: "Gateway report agent is not configured." }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await mintGatewayScheduledReportPullJobs();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/gateway-report-pulls] Report pull mint failed.", error);
    return NextResponse.json(
      { error: "gateway_report_pull_mint_failed" },
      { status: 500 },
    );
  }
}
