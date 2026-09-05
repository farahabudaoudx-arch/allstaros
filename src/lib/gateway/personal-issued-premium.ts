import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  normalizeNpn,
  parseGatewayIssuedPremiumCsv,
  type GatewayIssuedPremiumImportResult,
  type GatewayIssuedPremiumPeriod,
  type ParsedGatewayIssuedPremiumRow,
} from "./issued-premium";
import type { GatewayReportPullKind } from "./report-pulls";

type PullJobRow = {
  id: string;
  person_id: string;
  pull_kind: GatewayReportPullKind;
  business_date: string;
  status: string;
  session_generation: number | string;
  claim_token: string | null;
  lease_expires_at: string | null;
};

type PersonRow = {
  id: string;
  npn: string | null;
  npn_status: string | null;
};

type RpcImportResult = {
  status?: unknown;
  importId?: unknown;
};

export type GatewayPersonalIssuedPremiumImportArgs = {
  jobId: string;
  sessionGeneration: number;
  claimToken: string;
  periodType: GatewayIssuedPremiumPeriod;
  csvText: string;
  sourceFileName?: string | null;
  reportDate?: string | null;
  gatewayLabel?: string | null;
  scorecardCoverage?: {
    periodStart: string;
    periodEnd: string;
    weekOrdinal?: number | null;
    weekStart?: string | null;
    periodFinal?: boolean | null;
  } | null;
};

type ResolvedGatewayCoverage = {
  periodStart: string;
  periodEnd: string;
  weekOrdinal: number | null;
  weekStart?: string | null;
  periodFinal: boolean | null;
};

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function canonicalCoverageFromParsedPeriod(
  periodType: GatewayIssuedPremiumPeriod,
  parsedPeriodStart: string | null,
): ResolvedGatewayCoverage | null {
  if (!parsedPeriodStart || !/^\d{4}-\d{2}-\d{2}$/.test(parsedPeriodStart)) return null;
  const year = Number(parsedPeriodStart.slice(0, 4));
  const month = Number(parsedPeriodStart.slice(5, 7));
  if (periodType === "mtd") {
    return {
      periodStart: `${year}-${String(month).padStart(2, "0")}-01`,
      periodEnd: `${year}-${String(month).padStart(2, "0")}-${String(lastDayOfMonth(year, month)).padStart(2, "0")}`,
      weekOrdinal: null,
      periodFinal: null,
    };
  }
  if (periodType === "ytd") {
    return {
      periodStart: `${year}-01-01`,
      periodEnd: `${year}-12-31`,
      weekOrdinal: null,
      periodFinal: null,
    };
  }
  return null;
}

export function resolvePersonalGatewayCoverage(args: {
  periodType: GatewayIssuedPremiumPeriod;
  parsedPeriodStart: string | null;
  supplied?: GatewayPersonalIssuedPremiumImportArgs["scorecardCoverage"];
}): ResolvedGatewayCoverage | null {
  const supplied = args.supplied ?? null;
  if (supplied) {
    return {
      periodStart: supplied.periodStart,
      periodEnd: supplied.periodEnd,
      weekOrdinal: supplied.weekOrdinal ?? null,
      ...(supplied.weekStart ? { weekStart: supplied.weekStart } : {}),
      periodFinal: supplied.periodFinal ?? null,
    };
  }
  return canonicalCoverageFromParsedPeriod(args.periodType, args.parsedPeriodStart);
}

export function selectPersonalGatewayRow(
  rows: ParsedGatewayIssuedPremiumRow[],
  personNpn: string | null,
) {
  const targetNpn = normalizeNpn(personNpn);
  if (!targetNpn) {
    return { row: null, ambiguousCount: 0, ignoredCount: rows.length, reason: "person_npn_missing" };
  }
  const targetRows = rows.filter((row) => row.producerNpn === targetNpn);
  if (targetRows.length === 1) {
    return {
      row: targetRows[0],
      ambiguousCount: 0,
      ignoredCount: rows.length - 1,
      reason: null,
    };
  }
  if (targetRows.length > 1) {
    return {
      row: null,
      ambiguousCount: targetRows.length,
      ignoredCount: rows.length - targetRows.length,
      reason: "duplicate_target_npn_in_gateway_report",
    };
  }
  return {
    row: null,
    ambiguousCount: 0,
    ignoredCount: rows.length,
    reason: "target_npn_not_present",
  };
}

export function personalGatewayReportSkipReason(
  pullKind: GatewayReportPullKind,
  coveredPeriodStart: string | null,
): string | null {
  if (coveredPeriodStart != null && coveredPeriodStart < "2026-01-01") {
    return "covered_period_before_2026";
  }
  if (pullKind === "first_connect" && coveredPeriodStart == null) {
    return "first_connect_period_unknown";
  }
  return null;
}

export function validatePersonalGatewayReportDate(
  pullKind: GatewayReportPullKind,
  businessDate: string,
  reportDate: string,
): void {
  if (reportDate > businessDate) {
    throw new Error("Gateway report date is later than the pull business date.");
  }
  if ((pullKind === "monday" || pullKind === "reconnect") && reportDate !== businessDate) {
    throw new Error("Gateway current report date does not match the pull business date.");
  }
}

function resultStatus(value: unknown): "imported" | "no_new_report" | "skipped" {
  if (value === "imported" || value === "no_new_report" || value === "skipped") return value;
  throw new Error("Gateway personal import returned invalid status.");
}

export async function runGatewayPersonalIssuedPremiumImport(
  args: GatewayPersonalIssuedPremiumImportArgs,
): Promise<GatewayIssuedPremiumImportResult> {
  const service = createServiceRoleClient();
  const { data: jobData, error: jobError } = await service
    .from("gateway_report_pull_job")
    .select("id, person_id, pull_kind, business_date, status, session_generation, claim_token, lease_expires_at")
    .eq("id", args.jobId)
    .maybeSingle();
  if (jobError || !jobData) throw new Error("Gateway report pull job was not found.");
  const job = jobData as PullJobRow;
  if (
    job.status !== "running" ||
    Number(job.session_generation) !== args.sessionGeneration ||
    job.claim_token !== args.claimToken ||
    !job.lease_expires_at ||
    Date.parse(job.lease_expires_at) <= Date.now()
  ) {
    throw new Error("Gateway report pull job is no longer active.");
  }

  const { data: personData, error: personError } = await service
    .from("person")
    .select("id, npn, npn_status")
    .eq("id", job.person_id)
    .maybeSingle();
  if (personError || !personData) throw new Error("Gateway report pull person was not found.");
  const person = personData as PersonRow;

  const parsed = parseGatewayIssuedPremiumCsv(args.csvText, {
    periodType: args.periodType,
    sourceFileName: args.sourceFileName,
    reportDate: args.reportDate,
    gatewayLabel: args.gatewayLabel,
  });
  const match = selectPersonalGatewayRow(parsed.rows, person.npn);
  const targetUnmatchedCount = match.reason === "target_npn_not_present" ? 1 : 0;

  validatePersonalGatewayReportDate(job.pull_kind, job.business_date, parsed.reportDate);

  const coverage = resolvePersonalGatewayCoverage({
    periodType: parsed.periodType,
    parsedPeriodStart: parsed.periodStart,
    supplied: args.scorecardCoverage,
  });
  const skipReason = personalGatewayReportSkipReason(job.pull_kind, coverage?.periodStart ?? null);
  if (!coverage && !skipReason) {
    throw new Error("gateway_report_coverage_required");
  }
  if (parsed.periodType === "wtd" && coverage && (
    coverage.weekOrdinal == null || coverage.periodFinal == null
  )) {
    throw new Error("gateway_wtd_coverage_required");
  }
  const samples = {
    targetPersonId: person.id,
    targetNpn: normalizeNpn(person.npn) || null,
    ignoredRows: match.ignoredCount,
    matchReason: match.reason,
  };

  const { data, error } = await service.rpc("import_gateway_personal_issued_premium", {
    p_job_id: job.id,
    p_session_generation: args.sessionGeneration,
    p_claim_token: args.claimToken,
    p_period_type: parsed.periodType,
    p_report_date: parsed.reportDate,
    p_period_start: parsed.periodStart,
    p_gateway_label: parsed.gatewayLabel,
    p_source_file_name: parsed.sourceFileName,
    p_source_checksum: parsed.sourceChecksum,
    p_rows_seen: parsed.rows.length,
    p_unmatched_count: targetUnmatchedCount,
    p_ambiguous_count: match.ambiguousCount,
    p_row: skipReason ? null : match.row,
    p_summary: { samples, ...(coverage?.weekStart ? { gatewayWeekStart: coverage.weekStart } : {}) },
    p_skip_reason: skipReason,
    p_scorecard_period_start: coverage?.periodStart ?? null,
    p_scorecard_period_end: coverage?.periodEnd ?? null,
    p_gateway_week_ordinal: coverage?.weekOrdinal ?? null,
    p_gateway_period_final: coverage?.periodFinal ?? null,
  });
  if (error) throw new Error(`Unable to import personal Gateway report: ${error.message}`);
  const rpc = (data ?? {}) as RpcImportResult;
  const status = resultStatus(rpc.status);
  const importId = typeof rpc.importId === "string" ? rpc.importId : null;

  return {
    periodType: parsed.periodType,
    status,
    dryRun: false,
    importId,
    reportDate: parsed.reportDate,
    periodStart: parsed.periodStart,
    gatewayLabel: parsed.gatewayLabel,
    sourceFileName: parsed.sourceFileName,
    sourceChecksum: parsed.sourceChecksum,
    rowsSeen: parsed.rows.length,
    matchedCount: skipReason || status !== "imported" ? 0 : match.row ? 1 : 0,
    unmatchedCount: targetUnmatchedCount,
    ambiguousCount: match.ambiguousCount,
    skippedCount: parsed.rows.length - (skipReason || status !== "imported" ? 0 : match.row ? 1 : 0),
    verifiedSubmittedCount:
      status === "imported" && match.row && person.npn_status === "submitted" ? 1 : 0,
    message: skipReason === "covered_period_before_2026"
      ? "Gateway history before 2026 was intentionally skipped."
      : skipReason === "first_connect_period_unknown"
        ? "Gateway history without a verifiable covered period was intentionally skipped."
        : undefined,
    samples: {
      unmatched: match.reason === "target_npn_not_present"
        ? [{ npn: normalizeNpn(person.npn), producer: "connected_person" }]
        : [],
      ambiguous: match.reason === "duplicate_target_npn_in_gateway_report"
        ? [{ npn: normalizeNpn(person.npn), producer: "connected_person", reason: match.reason }]
        : [],
      matched: match.row
        ? [{ npn: match.row.producerNpn, producer: match.row.producer, personId: person.id }]
        : [],
    },
  };
}
