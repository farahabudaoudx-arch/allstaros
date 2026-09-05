import { NextResponse, type NextRequest } from "next/server";
import { isGatewayIssuedPremiumPeriod } from "@/lib/gateway/issued-premium";
import { runGatewayPersonalIssuedPremiumImport } from "@/lib/gateway/personal-issued-premium";
import {
  gatewayReportAgentAuthorized,
  gatewayReportAgentConfigured,
  gatewayReportImportFailure,
} from "@/lib/gateway/report-pulls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CSV_CHARS = 20_000_000;

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function validIsoDate(value: string | null): boolean {
  if (value == null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
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
  const csvText = typeof body?.csvText === "string" ? body.csvText : "";
  const sessionGeneration = Number(body?.sessionGeneration);
  const reportDate = text(body?.reportDate);
  const scorecardPeriodStart = text(body?.scorecardPeriodStart);
  const scorecardPeriodEnd = text(body?.scorecardPeriodEnd);
  const hasWeekOrdinal = body?.gatewayWeekOrdinal != null;
  const weekOrdinal = hasWeekOrdinal ? Number(body?.gatewayWeekOrdinal) : null;
  const weekStart = text(body?.gatewayWeekStart);
  const periodFinal = body?.gatewayPeriodFinal;
  if (!jobId || !claimToken || !isGatewayIssuedPremiumPeriod(periodType)) {
    return NextResponse.json({ error: "invalid_job_or_period" }, { status: 400 });
  }
  if (!Number.isSafeInteger(sessionGeneration) || sessionGeneration < 0) {
    return NextResponse.json({ error: "invalid_session_generation" }, { status: 400 });
  }
  if (!csvText.trim() || csvText.length > MAX_CSV_CHARS) {
    return NextResponse.json({ error: "invalid_csv" }, { status: 400 });
  }
  if (!validIsoDate(reportDate)) {
    return NextResponse.json({ error: "invalid_report_date" }, { status: 400 });
  }
  if (scorecardPeriodStart != null || scorecardPeriodEnd != null) {
    if (
      !scorecardPeriodStart || !scorecardPeriodEnd ||
      !validIsoDate(scorecardPeriodStart) || !validIsoDate(scorecardPeriodEnd)
    ) {
      return NextResponse.json({ error: "invalid_scorecard_coverage" }, { status: 400 });
    }
  }
  if (body?.gatewayWeekStart != null && (!weekStart || !validIsoDate(weekStart) || !scorecardPeriodStart)) {
    return NextResponse.json({ error: "invalid_scorecard_coverage" }, { status: 400 });
  }
  if (periodType === "wtd") {
    const noCoverageSupplied = scorecardPeriodStart == null && scorecardPeriodEnd == null;
    if (!noCoverageSupplied && (
      !Number.isInteger(weekOrdinal) || (weekOrdinal ?? 0) < 1 || (weekOrdinal ?? 0) > 8 ||
      typeof periodFinal !== "boolean"
    )) {
      return NextResponse.json({ error: "invalid_scorecard_coverage" }, { status: 400 });
    }
  } else if (hasWeekOrdinal || body?.gatewayPeriodFinal != null || body?.gatewayWeekStart != null) {
    return NextResponse.json({ error: "unexpected_gateway_week_metadata" }, { status: 400 });
  }

  try {
    const result = await runGatewayPersonalIssuedPremiumImport({
      jobId,
      sessionGeneration,
      claimToken,
      periodType,
      csvText,
      sourceFileName: text(body?.sourceFileName),
      reportDate,
      gatewayLabel: text(body?.gatewayLabel),
      scorecardCoverage: scorecardPeriodStart && scorecardPeriodEnd ? {
        periodStart: scorecardPeriodStart,
        periodEnd: scorecardPeriodEnd,
        ...(weekStart ? { weekStart } : {}),
        weekOrdinal: periodType === "wtd" ? weekOrdinal : null,
        periodFinal: periodType === "wtd" ? periodFinal as boolean : null,
      } : null,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const failure = gatewayReportImportFailure(error);
    if (failure.status === 500) {
      console.error("[gateway-report-jobs/import] Personal report import failed.", error);
    }
    return NextResponse.json({ error: failure.code }, { status: failure.status });
  }
}
