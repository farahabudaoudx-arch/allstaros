import { NextResponse, type NextRequest } from "next/server";
import {
  authorizeGatewayReportPullArtifactUpload,
  gatewayReportArtifactFailure,
} from "@/lib/gateway/report-artifacts";
import {
  gatewayReportAgentAuthorized,
  gatewayReportAgentConfigured,
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
  const artifactId = text(body?.artifactId);
  const sessionGeneration = Number(body?.sessionGeneration);
  if (
    !jobId || !claimToken || !artifactId ||
    !Number.isSafeInteger(sessionGeneration) || sessionGeneration < 0
  ) {
    return NextResponse.json({ error: "invalid_gateway_report_artifact" }, { status: 400 });
  }

  try {
    const upload = await authorizeGatewayReportPullArtifactUpload({
      jobId,
      sessionGeneration,
      claimToken,
      artifactId,
    });
    return NextResponse.json({ ok: true, upload });
  } catch (error) {
    const failure = gatewayReportArtifactFailure(error);
    if (failure.status === 500) {
      console.error("[gateway-report-jobs/artifacts/upload-ticket] Failed to authorize report artifact upload.");
    }
    return NextResponse.json({ error: failure.code }, { status: failure.status });
  }
}
