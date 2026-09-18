import { NextResponse, type NextRequest } from "next/server";
import { isGatewayIssuedPremiumPeriod } from "@/lib/gateway/issued-premium";
import {
  GATEWAY_REPORT_ARTIFACT_MAX_BYTES,
  gatewayReportArtifactFailure,
  registerGatewayReportPullArtifact,
  type GatewayReportArtifactProvider,
} from "@/lib/gateway/report-artifacts";
import {
  gatewayReportAgentAuthorized,
  gatewayReportAgentConfigured,
} from "@/lib/gateway/report-pulls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_CONTENT_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
]);

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function validIsoDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function daySpan(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000);
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
  const periodType = text(body?.periodType);
  const providerType = text(body?.providerType) as GatewayReportArtifactProvider | null;
  const sourceSha256 = text(body?.sourceSha256)?.toLowerCase() ?? null;
  const sourceFileName = text(body?.sourceFileName);
  const contentType = text(body?.contentType)?.toLowerCase() ?? null;
  const sessionGeneration = Number(body?.sessionGeneration);
  const sourceByteCount = Number(body?.sourceByteCount);
  const fileDate = text(body?.fileDate);
  const rowsSeen = Number(body?.rowsSeen);
  const uniqueNpnCount = Number(body?.uniqueNpnCount);
  const duplicateNpnValues = Number(body?.duplicateNpnValues);
  const reportDate = text(body?.reportDate);
  const gatewayReportDate = text(body?.gatewayReportDate);
  const scorecardPeriodStart = text(body?.scorecardPeriodStart);
  const scorecardPeriodEnd = text(body?.scorecardPeriodEnd);
  const gatewayWeekStart = text(body?.gatewayWeekStart);
  const hasGatewayWeekOrdinal = body?.gatewayWeekOrdinal != null;
  const gatewayWeekOrdinal = hasGatewayWeekOrdinal ? Number(body?.gatewayWeekOrdinal) : null;
  const gatewayPeriodFinal = body?.gatewayPeriodFinal;

  if (
    !jobId || !claimToken ||
    !Number.isSafeInteger(sessionGeneration) || sessionGeneration < 0 ||
    !isGatewayIssuedPremiumPeriod(periodType) ||
    (providerType !== "http" && providerType !== "browser") ||
    !sourceSha256 || !/^[0-9a-f]{64}$/.test(sourceSha256) ||
    !sourceFileName || sourceFileName.length > 255 ||
    !Number.isSafeInteger(sourceByteCount) || sourceByteCount <= 0 ||
    sourceByteCount > GATEWAY_REPORT_ARTIFACT_MAX_BYTES ||
    !contentType || !ALLOWED_CONTENT_TYPES.has(contentType) ||
    !validIsoDate(fileDate) ||
    !Number.isSafeInteger(rowsSeen) || rowsSeen <= 0 ||
    !Number.isSafeInteger(uniqueNpnCount) || uniqueNpnCount < 0 || uniqueNpnCount > rowsSeen ||
    !Number.isSafeInteger(duplicateNpnValues) || duplicateNpnValues < 0 || duplicateNpnValues > rowsSeen ||
    !validIsoDate(reportDate) ||
    !validIsoDate(gatewayReportDate) ||
    !validIsoDate(scorecardPeriodStart) ||
    !validIsoDate(scorecardPeriodEnd) ||
    scorecardPeriodStart > scorecardPeriodEnd ||
    reportDate < fileDate ||
    gatewayReportDate < scorecardPeriodStart || gatewayReportDate > scorecardPeriodEnd ||
    gatewayReportDate > reportDate
  ) {
    return NextResponse.json({ error: "invalid_gateway_report_artifact" }, { status: 400 });
  }

  if (periodType === "wtd") {
    if (
      !validIsoDate(gatewayWeekStart) ||
      gatewayWeekStart !== fileDate ||
      gatewayWeekStart > gatewayReportDate ||
      daySpan(gatewayWeekStart, gatewayReportDate) > 6 ||
      !Number.isInteger(gatewayWeekOrdinal) ||
      (gatewayWeekOrdinal ?? 0) < 1 ||
      (gatewayWeekOrdinal ?? 0) > 8 ||
      typeof gatewayPeriodFinal !== "boolean"
    ) {
      return NextResponse.json({ error: "invalid_gateway_report_artifact" }, { status: 400 });
    }
  } else {
    if (
      fileDate < scorecardPeriodStart || fileDate > scorecardPeriodEnd ||
      body?.gatewayWeekStart != null ||
      hasGatewayWeekOrdinal ||
      body?.gatewayPeriodFinal != null
    ) {
      return NextResponse.json({ error: "invalid_gateway_report_artifact" }, { status: 400 });
    }
  }

  try {
    const artifact = await registerGatewayReportPullArtifact({
      jobId,
      sessionGeneration,
      claimToken,
      periodType,
      providerType,
      sourceSha256,
      sourceFileName,
      sourceByteCount,
      contentType,
      evidence: {
        fileDate,
        rowsSeen,
        uniqueNpnCount,
        duplicateNpnValues,
        reportDate,
        gatewayReportDate,
        scorecardPeriodStart,
        scorecardPeriodEnd,
        gatewayWeekStart: periodType === "wtd" ? gatewayWeekStart : null,
        gatewayWeekOrdinal: periodType === "wtd" ? gatewayWeekOrdinal : null,
        gatewayPeriodFinal: periodType === "wtd" ? gatewayPeriodFinal as boolean : null,
      },
    });
    return NextResponse.json({ ok: true, artifact });
  } catch (error) {
    const failure = gatewayReportArtifactFailure(error);
    if (failure.status === 500) {
      console.error("[gateway-report-jobs/artifacts/register] Failed to register report artifact.");
    }
    return NextResponse.json({ error: failure.code }, { status: failure.status });
  }
}
