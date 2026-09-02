import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createProducerPeriodPreview, createScorecardScheduleFacts } from "./lifecycle";
import { previousEquivalentPeriod, scorecardPeriodFromStart, type ScorecardPeriod } from "./period";
import { builderPublishedMetric } from "./published-snapshot";
import {
  createScorecardArtifacts,
  prepareScorecardRun,
  type BuilderProductionSupport,
  type GatewayReport,
  type ProducerPeriodMetricPayload,
  type ScorecardRunInput,
  type ScorecardRunPerson,
  type ScorecardRunTarget,
} from "./run";
import {
  loadManualProducerOverviewForPeriod,
  loadProducerSourceForPeriod,
} from "./source";

export type ManualScorecardCardType = ScorecardRunTarget["cardType"];

export type ManualTargetContext = {
  personId: string;
  fullName: string;
  email: string;
  photoUrl: string | null;
  photoReviewStatus: string | null;
  npn: string | null;
  npnStatus: string | null;
  npnVerifiedAt: string | null;
  recruitId: string | null;
  recruitCreatedAt: string | null;
  recruitRemovedAt: string | null;
  uplineId: string | null;
  activeAtPeriodEnd: boolean;
  producerAtPeriodEnd: boolean;
  builderAtPeriodEnd: boolean;
  depth: number;
};

export type ManualScorecardResult =
  | { status: "success" | "existing"; snapshotId: string; runId: string | null; deliveryId: string | null }
  | { status: "unauthorized" | "person_not_found" | "card_not_applicable" | "invalid_period" | "generation_failure"; message: string };

type ManualGenerationRequest = {
  initiatedBy: string;
  personId: string;
  cardType: ManualScorecardCardType;
  period: ScorecardPeriod;
};

type GatewayImportRow = {
  id: string;
  report_date: string | null;
  source_checksum: string | null;
  unmatched_count: number | null;
  ambiguous_count: number | null;
};

type ManualGatewayRow = {
  id: string;
  import_id: string | null;
  person_id: string;
  report_date: string;
  personal_ip_cents: number | string;
  team_ip_cents: number | string;
  first_leg_percent: number | string | null;
};

type BuilderSupportRow = {
  person_id: string;
  current_dials: number | string;
  current_contacts: number | string;
  current_presentations: number | string;
  current_sales: number | string;
  current_ap_cents: number | string;
  prior_dials: number | string;
  prior_contacts: number | string;
  prior_presentations: number | string;
  prior_sales: number | string;
  prior_ap_cents: number | string;
};

type PublishManualRow = {
  snapshot_id: string;
  run_id: string | null;
  delivery_id: string | null;
  existing: boolean;
};

function numeric(value: number | string | null | undefined): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function sixWeekStart(periodEnd: string): string {
  const date = new Date(`${periodEnd}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 41);
  return date.toISOString().slice(0, 10);
}

function earlierDate(left: string, right: string): string {
  return left < right ? left : right;
}

function contextRow(row: Record<string, unknown>): ManualTargetContext {
  return {
    personId: String(row.person_id),
    fullName: String(row.full_name ?? ""),
    email: String(row.email ?? ""),
    photoUrl: typeof row.photo_url === "string" && row.photo_url ? row.photo_url : null,
    photoReviewStatus: typeof row.photo_review_status === "string" ? row.photo_review_status : null,
    npn: typeof row.npn === "string" ? row.npn : null,
    npnStatus: typeof row.npn_status === "string" ? row.npn_status : null,
    npnVerifiedAt: typeof row.npn_verified_at === "string" ? row.npn_verified_at : null,
    recruitId: typeof row.recruit_id === "string" ? row.recruit_id : null,
    recruitCreatedAt: typeof row.recruit_created_at === "string" ? row.recruit_created_at : null,
    recruitRemovedAt: typeof row.recruit_removed_at === "string" ? row.recruit_removed_at : null,
    uplineId: typeof row.upline_id === "string" ? row.upline_id : null,
    activeAtPeriodEnd: row.active_at_period_end === true,
    producerAtPeriodEnd: row.producer_at_period_end === true,
    builderAtPeriodEnd: row.builder_at_period_end === true,
    depth: numeric(row.depth as number | string),
  };
}

export async function loadManualTargetContext(
  service: SupabaseClient,
  personId: string,
  periodEnd: string,
  includeSubtree: boolean,
): Promise<ManualTargetContext[]> {
  const { data, error } = await service.rpc("scorecard_manual_target_context", {
    p_person_id: personId,
    p_period_end: periodEnd,
    p_include_subtree: includeSubtree,
  });
  if (error) throw new Error(`Unable to load manual Scorecard target context: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map(contextRow);
}

async function loadGatewayImports(
  service: SupabaseClient,
  start: string,
  end: string,
): Promise<GatewayImportRow[]> {
  const { data, error } = await service
    .from("gateway_issued_premium_import")
    .select("id, report_date, source_checksum, unmatched_count, ambiguous_count")
    .eq("period_type", "wtd")
    .eq("status", "imported")
    .not("report_date", "is", null)
    .gte("report_date", start)
    .lte("report_date", end)
    .order("report_date", { ascending: true });
  if (error) throw new Error(`Unable to load manual Scorecard Gateway coverage: ${error.message}`);
  return (data ?? []) as GatewayImportRow[];
}

async function loadGatewayRows(
  service: SupabaseClient,
  personId: string,
  periodEnd: string,
  start: string,
  end: string,
  includeSubtree: boolean,
): Promise<ManualGatewayRow[]> {
  const { data, error } = await service.rpc("scorecard_manual_gateway_rows", {
    p_person_id: personId,
    p_period_end: periodEnd,
    p_report_start: start,
    p_report_end: end,
    p_include_subtree: includeSubtree,
  });
  if (error) throw new Error(`Unable to load manual Scorecard Gateway rows: ${error.message}`);
  return (data ?? []) as ManualGatewayRow[];
}

function gatewayReports(
  imports: GatewayImportRow[],
  rows: ManualGatewayRow[],
): GatewayReport[] {
  const rowsByDate = new Map<string, GatewayReport["rows"]>();
  for (const row of rows) {
    const reportRows = rowsByDate.get(row.report_date) ?? [];
    reportRows.push({
      personId: row.person_id,
      personalIpCents: numeric(row.personal_ip_cents),
      teamIpCents: numeric(row.team_ip_cents),
      firstLegPercent: row.first_leg_percent == null ? null : numeric(row.first_leg_percent),
    });
    rowsByDate.set(row.report_date, reportRows);
  }

  return imports.flatMap<GatewayReport>((report) => report.report_date ? [{
    id: report.id,
    periodType: "wtd",
    reportDate: report.report_date,
    status: "published",
    sourceChecksum: report.source_checksum ?? "",
    unmatchedCount: numeric(report.unmatched_count),
    ambiguousCount: numeric(report.ambiguous_count),
    rows: rowsByDate.get(report.report_date) ?? [],
  }] : []);
}

async function captureProducerMetric(
  service: SupabaseClient,
  target: ManualTargetContext,
  period: ScorecardPeriod,
  generatedAt: Date,
): Promise<ProducerPeriodMetricPayload> {
  const prior = previousEquivalentPeriod(period);
  const [currentSource, priorSource] = await Promise.all([
    loadProducerSourceForPeriod(service, target.personId, period, generatedAt),
    loadProducerSourceForPeriod(service, target.personId, prior, generatedAt),
  ]);
  const preview = createProducerPeriodPreview(currentSource, period.kind);
  const priorPreview = createProducerPeriodPreview(priorSource, period.kind);
  const overview = await loadManualProducerOverviewForPeriod(
    service,
    {
      id: target.personId,
      full_name: target.fullName,
      photo_url: target.photoUrl,
      photo_review_status: target.photoReviewStatus,
    },
    preview.totalIssuedIpCents,
    priorPreview.totalIssuedIpCents,
    period,
  );
  return { preview, overview };
}

async function loadBuilderSupport(
  service: SupabaseClient,
  builderId: string,
  period: ScorecardPeriod,
): Promise<BuilderProductionSupport[]> {
  const prior = previousEquivalentPeriod(period);
  const { data, error } = await service.rpc("scorecard_manual_builder_production_support", {
    p_builder_id: builderId,
    p_period_end: period.end,
    p_current_start: period.start,
    p_current_end: period.end,
    p_prior_start: prior.start,
    p_prior_end: prior.end,
  });
  if (error) throw new Error(`Unable to load manual Builder support: ${error.message}`);
  return ((data ?? []) as BuilderSupportRow[]).map((row) => ({
    personId: row.person_id,
    current: {
      dials: numeric(row.current_dials),
      contacts: numeric(row.current_contacts),
      presentations: numeric(row.current_presentations),
      sales: numeric(row.current_sales),
      apCents: numeric(row.current_ap_cents),
    },
    prior: {
      dials: numeric(row.prior_dials),
      contacts: numeric(row.prior_contacts),
      presentations: numeric(row.prior_presentations),
      sales: numeric(row.prior_sales),
      apCents: numeric(row.prior_ap_cents),
    },
  }));
}

function runPeople(context: ManualTargetContext[]): ScorecardRunPerson[] {
  return context.map((person) => ({
    id: person.personId,
    fullName: person.fullName,
    email: person.email,
    photoUrl: person.photoUrl,
    photoReviewStatus: person.photoReviewStatus,
    uplineId: person.uplineId,
    activeAtPeriodEnd: person.activeAtPeriodEnd,
    producerAtPeriodEnd: person.producerAtPeriodEnd,
    builderAtPeriodEnd: person.builderAtPeriodEnd,
  }));
}

function runRecruits(context: ManualTargetContext[]): ScorecardRunInput["recruits"] {
  return context.flatMap((person) => person.recruitId ? [{
    id: person.recruitId,
    personId: person.personId,
    createdAt: person.recruitCreatedAt ?? "1970-01-01T00:00:00.000Z",
    removedAt: person.recruitRemovedAt,
    npn: person.npn,
    npnStatus: person.npnStatus,
    npnVerifiedAt: person.npnVerifiedAt,
  }] : []);
}

function producerScheduleFacts(payload: ProducerPeriodMetricPayload) {
  if (payload.preview.periodKind !== "monthly") return [];
  return createScorecardScheduleFacts({
    periodStart: payload.preview.periodStart,
    periodEnd: payload.preview.periodEnd,
    expectedWorkingDates: payload.overview.activity.expectedDates ?? [],
    activityRows: payload.overview.activity.loggedDates.map((entryDate) => ({
      entryDate,
      leads: null,
      dials: null,
      contacts: null,
      appointments: null,
      presentations: null,
      sales: null,
    })),
  });
}

function canonicalPeriod(period: ScorecardPeriod): boolean {
  try {
    const expected = scorecardPeriodFromStart(period.kind, period.start);
    return expected.end === period.end && expected.label === period.label;
  } catch {
    return false;
  }
}

export async function generateManualScorecardWithClient(
  service: SupabaseClient,
  request: ManualGenerationRequest,
): Promise<ManualScorecardResult> {
  if (!canonicalPeriod(request.period)) {
    return { status: "invalid_period", message: "Choose a valid calendar Scorecard period." };
  }

  const [{ data: admin, error: adminError }, { data: person, error: personError }] = await Promise.all([
    service.from("person").select("id, is_admin, is_super_admin").eq("id", request.initiatedBy).maybeSingle(),
    service.from("person").select("id").eq("id", request.personId).maybeSingle(),
  ]);
  if (adminError || !admin || (!admin.is_admin && !admin.is_super_admin)) {
    return { status: "unauthorized", message: "You are not authorized to generate Scorecards." };
  }
  if (personError || !person) {
    return { status: "person_not_found", message: "The selected person could not be found." };
  }

  try {
    const includeSubtree = request.cardType === "builder";
    const context = await loadManualTargetContext(service, request.personId, request.period.end, includeSubtree);
    const target = context.find((row) => row.personId === request.personId && row.depth === 0);
    if (!target || !target.activeAtPeriodEnd || (
      request.cardType === "producer" ? !target.producerAtPeriodEnd : !target.builderAtPeriodEnd
    )) {
      return { status: "card_not_applicable", message: "That Scorecard type was not applicable to this person at period end." };
    }

    const prior = previousEquivalentPeriod(request.period);
    const reportStart = request.cardType === "builder"
      ? earlierDate(request.period.start, sixWeekStart(request.period.end))
      : request.period.start;
    const [imports, priorImports, rows] = await Promise.all([
      loadGatewayImports(service, reportStart, request.period.end),
      request.cardType === "builder" ? loadGatewayImports(service, prior.start, prior.end) : Promise.resolve([]),
      loadGatewayRows(service, request.personId, request.period.end, reportStart, request.period.end, includeSubtree),
    ]);
    const reports = gatewayReports(imports, rows);
    const expectedReportDates = [...new Set(imports
      .map((row) => row.report_date)
      .filter((date): date is string => Boolean(date) && date! >= request.period.start && date! <= request.period.end))]
      .sort();
    if (expectedReportDates.length === 0) {
      return { status: "generation_failure", message: "No published Gateway WTD coverage exists for the selected period." };
    }

    const generatedAt = new Date();
    let producerMetrics: ScorecardRunInput["producerMetrics"] = [];
    let producerVerificationMetrics: ScorecardRunInput["producerVerificationMetrics"] = [];
    let builderProductionSupport: BuilderProductionSupport[] | undefined;
    const priorBuilderTeamIpCents: Record<string, number | null> = {};
    const priorBuilderCoverage: ScorecardRunInput["priorBuilderCoverage"] = {};

    if (request.cardType === "producer") {
      const [metricPayload, verificationPayload] = await Promise.all([
        captureProducerMetric(service, target, request.period, generatedAt),
        captureProducerMetric(service, target, request.period, generatedAt),
      ]);
      producerMetrics = [{ personId: target.personId, payload: metricPayload }];
      producerVerificationMetrics = [{ personId: target.personId, payload: verificationPayload }];
    } else {
      const [support, priorRows] = await Promise.all([
        loadBuilderSupport(service, target.personId, request.period),
        loadGatewayRows(service, target.personId, request.period.end, prior.start, prior.end, false),
      ]);
      builderProductionSupport = support;
      const priorDates = new Set(priorImports
        .map((row) => row.report_date)
        .filter((date): date is string => Boolean(date)));
      if (priorDates.size === 0) {
        priorBuilderCoverage[target.personId] = "outside_retention";
        priorBuilderTeamIpCents[target.personId] = null;
      } else {
        priorBuilderCoverage[target.personId] = "complete";
        priorBuilderTeamIpCents[target.personId] = priorRows
          .filter((row) => priorDates.has(row.report_date))
          .reduce((sum, row) => sum + numeric(row.team_ip_cents), 0);
      }
    }

    const runInput: ScorecardRunInput = {
      runId: randomUUID(),
      revision: 1,
      period: request.period,
      priorPeriod: prior,
      generatedAt: generatedAt.toISOString(),
      expectedReportDates,
      people: runPeople(context),
      gatewayReports: reports,
      recruits: runRecruits(context),
      priorBuilderTeamIpCents,
      priorBuilderCoverage,
      producerMetrics,
      producerVerificationMetrics,
      target: { personId: request.personId, cardType: request.cardType },
      builderProductionSupport,
    };

    const prepared = prepareScorecardRun(runInput);
    if (prepared.status !== "ready") {
      return { status: "generation_failure", message: "Scorecard source validation did not pass for the selected person and period." };
    }
    const artifacts = createScorecardArtifacts({ prepared, input: runInput });
    if (artifacts.snapshots.length !== 1) {
      return { status: "generation_failure", message: "Manual Scorecard generation did not produce exactly one card." };
    }

    const snapshot = artifacts.snapshots[0];
    const metricPayload = request.cardType === "producer"
      ? prepared.producerMetrics[0].payload
      : builderPublishedMetric(prepared.builderMetrics[0]);
    const activeWriterReportDates = request.cardType === "builder"
      ? [...new Set(reports.map((report) => report.reportDate))]
          .sort((left, right) => right.localeCompare(left))
          .slice(0, 6)
      : [];
    const sourceCoverage = request.cardType === "producer"
      ? {
          generationScope: "manual_person",
          targetPersonId: request.personId,
          source: "gateway",
          reportCount: prepared.producerMetrics[0].payload.preview.sourceCoverage.reportCount,
          completeThrough: prepared.producerMetrics[0].payload.preview.sourceCoverage.completeThrough,
          reportIds: reports.map((report) => report.id),
          sourceChecksums: reports.map((report) => report.sourceChecksum),
        }
      : {
          generationScope: "manual_person",
          targetPersonId: request.personId,
          reportIds: prepared.builderMetrics[0].sourceReportIds,
          sourceChecksums: prepared.builderMetrics[0].sourceChecksums,
          activeWriterReportDates,
        };
    const scheduleFacts = request.cardType === "producer"
      ? producerScheduleFacts(prepared.producerMetrics[0].payload)
      : [];

    const { data: publishData, error: publishError } = await service.rpc("publish_manual_scorecard", {
      p_initiated_by: request.initiatedBy,
      p_person_id: request.personId,
      p_card_type: request.cardType,
      p_period_kind: request.period.kind,
      p_period_start: request.period.start,
      p_period_end: request.period.end,
      p_period_label: request.period.label,
      p_revision: 1,
      p_metric_payload: metricPayload,
      p_published_payload: snapshot.visiblePayload,
      p_source_coverage: sourceCoverage,
      p_schedule_facts: scheduleFacts,
    });
    if (publishError) {
      console.error("publish_manual_scorecard failed", {
        message: publishError.message,
        code: publishError.code,
        details: publishError.details,
        hint: publishError.hint,
      });
      return { status: "generation_failure", message: "The Scorecard could not be published. No partial manual publication was kept." };
    }
    const published = ((publishData ?? []) as PublishManualRow[])[0];
    if (!published?.snapshot_id) {
      return { status: "generation_failure", message: "The Scorecard publisher did not return a published artifact." };
    }
    return {
      status: published.existing ? "existing" : "success",
      snapshotId: published.snapshot_id,
      runId: published.run_id,
      deliveryId: published.delivery_id,
    };
  } catch {
    return { status: "generation_failure", message: "The Scorecard could not be generated from the selected historical sources." };
  }
}

export async function generateManualScorecard(
  request: ManualGenerationRequest,
): Promise<ManualScorecardResult> {
  return generateManualScorecardWithClient(createServiceRoleClient(), request);
}