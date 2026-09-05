import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createProducerPeriodPreview, createScorecardScheduleFacts } from "./lifecycle";
import {
  aggregatePersonalGatewayReports,
  canonicalGatewayReportIdentity,
  gatewayReportInScorecardPeriod,
  gatewayPeriodRequirements,
  latestCanonicalGatewayReports,
  requiredGatewayMondays,
  summarizePersonalGatewayEvidence,
  type PersonalGatewayImportEvidence,
} from "./gateway-completeness";
import { previousEquivalentPeriod, scorecardPeriodFromStart, type ScorecardPeriod } from "./period";
import { builderPublishedMetric, parsePublishedScorecardSnapshotPayload } from "./published-snapshot";
import {
  createScorecardArtifacts,
  prepareScorecardRun,
  type BuilderPeriodMetric,
  type BuilderProductionSupport,
  type BuilderRankPopulationEntry,
  type GatewayReport,
  type ProducerPeriodMetricPayload,
  type ScorecardArtifact,
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
  | { status: "unauthorized" | "person_not_found" | "card_not_applicable" | "invalid_period" | "generation_failure" | "snapshot_not_found" | "stale_revision" | "invalid_correction" | "no_changes"; message: string };

type ManualGenerationRequest = {
  initiatedBy: string;
  personId: string;
  cardType: ManualScorecardCardType;
  period: ScorecardPeriod;
  revision?: number;
  priorSnapshot?: ScorecardArtifact;
  correctionReason?: string;
};

type ManualGatewayRow = {
  id: string;
  import_id: string | null;
  person_id: string;
  source_kind?: string | null;
  report_date: string;
  period_start?: string | null;
  scorecard_period_start?: string | null;
  scorecard_period_end?: string | null;
  gateway_week_ordinal?: number | string | null;
  gateway_period_final?: boolean | null;
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

type BuilderRankSnapshotRow = {
  id: string;
  person_id: string;
  revision: number | string;
  finalized_at: string;
  kpi_results: unknown;
};

type BuilderRankPopulationContext = {
  entries: BuilderRankPopulationEntry[];
  snapshotIds: string[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function rankShape(value: unknown): value is { rank: number; population: number } {
  return isRecord(value) &&
    typeof value.rank === "number" && Number.isInteger(value.rank) && value.rank > 0 &&
    typeof value.population === "number" && Number.isInteger(value.population) && value.population > 0 &&
    value.rank <= value.population;
}

function builderRankSnapshotFact(row: BuilderRankSnapshotRow): {
  entry: BuilderRankPopulationEntry;
  teamPopulation: number | null;
  recruitingPopulation: number;
  snapshotId: string;
} | null {
  if (!isRecord(row.kpi_results) || row.kpi_results.schemaVersion !== "scorecard-published-v1" || row.kpi_results.cardType !== "builder") return null;
  const metric = row.kpi_results.metricPayload;
  if (!isRecord(metric)) return null;
  const teamIpCents = metric.teamIpCents;
  const recruitsAdded = metric.recruitsAdded;
  const teamRank = metric.teamRank;
  const recruitingRank = metric.recruitingRank;
  const unavailableReason = metric.teamRankUnavailableReason;
  if (typeof teamIpCents !== "number" || !Number.isFinite(teamIpCents) || teamIpCents < 0) return null;
  if (typeof recruitsAdded !== "number" || !Number.isInteger(recruitsAdded) || recruitsAdded < 0) return null;
  if (!rankShape(recruitingRank)) return null;
  const representedInGateway = teamRank != null;
  if (representedInGateway) {
    if (!rankShape(teamRank) || unavailableReason != null) return null;
  } else if (unavailableReason !== "not_represented_in_gateway") {
    return null;
  }
  return {
    entry: { personId: row.person_id, teamIpCents, representedInGateway, recruitsAdded },
    teamPopulation: representedInGateway ? (teamRank as { rank: number; population: number }).population : null,
    recruitingPopulation: recruitingRank.population,
    snapshotId: row.id,
  };
}

async function loadBuilderRankPopulationContext(
  service: SupabaseClient,
  period: ScorecardPeriod,
  targetPersonId: string,
  targetMetric: BuilderPeriodMetric,
): Promise<BuilderRankPopulationContext | null> {
  const { data, error } = await service
    .from("scorecard_snapshot")
    .select("id, person_id, revision, finalized_at, kpi_results")
    .eq("card_type", "builder")
    .eq("period_kind", period.kind)
    .eq("period_start", period.start)
    .eq("period_end", period.end)
    .in("lifecycle_status", ["final", "corrected"])
    .not("finalized_at", "is", null)
    .order("revision", { ascending: false })
    .order("finalized_at", { ascending: false });
  if (error) throw new Error(`Unable to load Builder rank context: ${error.message}`);

  const rows = ((data ?? []) as BuilderRankSnapshotRow[])
    .sort((left, right) => {
      const revisionOrder = numeric(right.revision) - numeric(left.revision);
      return revisionOrder !== 0 ? revisionOrder : right.finalized_at.localeCompare(left.finalized_at);
    });
  const latestByPerson = new Map<string, BuilderRankSnapshotRow>();
  for (const row of rows) {
    if (!latestByPerson.has(row.person_id)) latestByPerson.set(row.person_id, row);
  }
  const facts = [...latestByPerson.values()].map(builderRankSnapshotFact);
  if (facts.length === 0 || facts.some((fact) => fact == null)) return null;
  const validFacts = facts.filter((fact): fact is NonNullable<typeof fact> => fact != null);
  const expectedPopulations = new Set(validFacts.map((fact) => fact.recruitingPopulation));
  if (expectedPopulations.size !== 1) return null;
  const expectedPopulation = validFacts[0].recruitingPopulation;
  const representedTeamPopulations = new Set(validFacts.flatMap((fact) =>
    fact.teamPopulation == null ? [] : [fact.teamPopulation]));
  if (representedTeamPopulations.size > 1) return null;

  const entries = validFacts
    .filter((fact) => fact.entry.personId !== targetPersonId)
    .map((fact) => fact.entry);
  entries.push({
    personId: targetPersonId,
    teamIpCents: targetMetric.teamIpCents,
    representedInGateway: targetMetric.teamRankUnavailableReason == null,
    recruitsAdded: targetMetric.recruitsAdded,
  });
  if (entries.length !== expectedPopulation || new Set(entries.map((entry) => entry.personId)).size !== entries.length) return null;
  const expectedTeamPopulation = [...representedTeamPopulations][0];
  const representedEntryCount = entries.filter((entry) => entry.representedInGateway).length;
  if (expectedTeamPopulation != null && representedEntryCount !== expectedTeamPopulation) return null;

  return {
    entries,
    snapshotIds: validFacts.map((fact) => fact.snapshotId),
  };
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
  personIds: string[],
  start: string,
  end: string,
): Promise<PersonalGatewayImportEvidence[]> {
  if (personIds.length === 0) return [];
  const { data, error } = await service
    .from("gateway_issued_premium_import")
    .select("id, person_id, source_kind, pull_kind, period_type, status, report_date, period_start, gateway_label, source_checksum, scorecard_period_start, scorecard_period_end, gateway_week_ordinal, gateway_period_final, matched_count, unmatched_count, ambiguous_count, summary, created_at")
    .in("person_id", personIds)
    .eq("source_kind", "personal_gateway")
    .eq("period_type", "wtd")
    .or(`and(scorecard_period_start.gte.${start.slice(0, 7)}-01,scorecard_period_start.lte.${end}),and(scorecard_period_start.is.null,report_date.gte.${start},report_date.lte.${end})`)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Unable to load manual Scorecard Gateway coverage: ${error.message}`);
  return (data ?? []) as PersonalGatewayImportEvidence[];
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
  imports: PersonalGatewayImportEvidence[],
  rows: ManualGatewayRow[],
  personIds: Iterable<string>,
  start: string,
  end: string,
): GatewayReport[] {
  return aggregatePersonalGatewayReports({
    imports,
    premiumRows: rows,
    personIds,
    start,
    end,
  });
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

  const revision = request.revision ?? 1;
  const correctionReason = request.correctionReason?.trim() ?? "";
  if (!Number.isInteger(revision) || revision < 1) {
    return { status: "invalid_correction", message: "Scorecard revisions must be positive whole numbers." };
  }
  if (revision > 1) {
    const priorSnapshot = request.priorSnapshot;
    if (!priorSnapshot || priorSnapshot.revision !== revision - 1) {
      return { status: "invalid_correction", message: "A correction must continue from the immediately prior published revision." };
    }
    if (
      priorSnapshot.personId !== request.personId ||
      priorSnapshot.cardType !== request.cardType ||
      priorSnapshot.period.kind !== request.period.kind ||
      priorSnapshot.period.start !== request.period.start ||
      priorSnapshot.period.end !== request.period.end
    ) {
      return { status: "invalid_correction", message: "Correction lineage does not match the selected Scorecard." };
    }
    if (correctionReason.length < 5 || correctionReason.length > 500) {
      return { status: "invalid_correction", message: "Correction reason must be between 5 and 500 characters." };
    }
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
    const evidencePersonIds = context
      .filter((person) => person.activeAtPeriodEnd && person.producerAtPeriodEnd)
      .map((person) => person.personId);
    const [imports, priorImports, rows] = await Promise.all([
      loadGatewayImports(service, evidencePersonIds, reportStart, request.period.end),
      request.cardType === "builder" ? loadGatewayImports(service, [target.personId], prior.start, prior.end) : Promise.resolve([]),
      loadGatewayRows(service, request.personId, request.period.end, reportStart, request.period.end, includeSubtree),
    ]);
    const scopedCurrentEvidence = imports.some((row) => row.scorecard_period_start != null);
    const periodRequirements = gatewayPeriodRequirements(imports, request.period);
    const legacyEvidenceRequiredDates = requiredGatewayMondays({ start: reportStart, end: request.period.end });
    const evidenceCoverage = periodRequirements.ready
      ? summarizePersonalGatewayEvidence({
          personIds: evidencePersonIds,
          requiredWeeks: periodRequirements.requiredWeeks,
          imports,
          premiumRows: rows,
        })
      : summarizePersonalGatewayEvidence({
          personIds: evidencePersonIds,
          requiredDates: scopedCurrentEvidence ? [] : legacyEvidenceRequiredDates,
          imports,
          premiumRows: rows,
        });
    if (scopedCurrentEvidence && !periodRequirements.ready) {
      return { status: "generation_failure", message: "Personal Gateway final-week coverage is incomplete for the selected Scorecard period." };
    }
    const unresolvedCurrentEvidence = evidencePersonIds.some((personId) => {
      const personEvidence = evidenceCoverage.byPerson.get(personId);
      return scopedCurrentEvidence ? !personEvidence?.finalWeekReady : !personEvidence?.complete;
    });
    if (unresolvedCurrentEvidence) {
      return {
        status: "generation_failure",
        message: scopedCurrentEvidence
          ? "Personal Gateway final-week evidence is unresolved for the selected Scorecard scope."
          : "Personal Gateway WTD coverage is incomplete for the selected Scorecard scope.",
      };
    }
    const reports = gatewayReports(imports, rows, evidencePersonIds, reportStart, request.period.end);
    const periodReports = reports.filter((report) => gatewayReportInScorecardPeriod(report, request.period));
    const expectedReportDates = [...new Set(periodReports.map((report) => report.reportDate))].sort();
    const expectedGatewayWeeks = scopedCurrentEvidence && periodRequirements.ready
      ? periodRequirements.finalWeeks.map((week) => ({
          periodStart: week.periodStart,
          weekOrdinal: week.weekOrdinal,
        }))
      : undefined;

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
      if (priorImports.length === 0) {
        priorBuilderCoverage[target.personId] = "outside_retention";
        priorBuilderTeamIpCents[target.personId] = null;
      } else {
        const priorRequirements = gatewayPeriodRequirements(priorImports, prior);
        const priorHasScoped = priorImports.some((row) => row.scorecard_period_start != null);
        const priorCoverage = (priorRequirements.ready
          ? summarizePersonalGatewayEvidence({
              personIds: [target.personId],
              requiredWeeks: priorRequirements.requiredWeeks,
              imports: priorImports,
              premiumRows: priorRows,
            })
          : summarizePersonalGatewayEvidence({
              personIds: [target.personId],
              requiredDates: priorHasScoped ? [] : requiredGatewayMondays(prior),
              imports: priorImports,
              premiumRows: priorRows,
            })).byPerson.get(target.personId);
        if (!priorCoverage?.complete) {
          priorBuilderCoverage[target.personId] = "incomplete";
          priorBuilderTeamIpCents[target.personId] = null;
        } else {
          const priorReports = gatewayReports(priorImports, priorRows, [target.personId], prior.start, prior.end);
          priorBuilderCoverage[target.personId] = "complete";
          priorBuilderTeamIpCents[target.personId] = priorReports
            .flatMap((report) => report.rows)
            .filter((row) => row.personId === target.personId)
            .reduce((sum, row) => sum + row.teamIpCents, 0);
        }
      }
    }

    const runInput: ScorecardRunInput = {
      runId: randomUUID(),
      revision,
      period: request.period,
      priorPeriod: prior,
      generatedAt: generatedAt.toISOString(),
      expectedReportDates: expectedGatewayWeeks ? [] : expectedReportDates,
      expectedGatewayWeeks,
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

    let prepared = prepareScorecardRun(runInput);
    if (prepared.status !== "ready") {
      return { status: "generation_failure", message: "Scorecard source validation did not pass for the selected person and period." };
    }
    let builderRankContext: BuilderRankPopulationContext | null = null;
    if (request.cardType === "builder") {
      const targetMetric = prepared.builderMetrics[0];
      if (!targetMetric) {
        return { status: "generation_failure", message: "Targeted Builder generation did not produce a validated metric row." };
      }
      builderRankContext = await loadBuilderRankPopulationContext(service, request.period, request.personId, targetMetric);
      if (!builderRankContext) {
        if (revision > 1) {
          return { status: "generation_failure", message: "The complete frozen Builder rank population could not be established for this period." };
        }
      } else {
        runInput.builderRankPopulation = builderRankContext.entries;
        prepared = prepareScorecardRun(runInput);
        if (prepared.status !== "ready") {
          return { status: "generation_failure", message: "Builder rank-context verification did not pass for the selected person and period." };
        }
      }
    }
    const artifacts = createScorecardArtifacts({
      prepared,
      input: runInput,
      priorSnapshots: request.priorSnapshot ? [request.priorSnapshot] : [],
    });
    if (revision > 1 && artifacts.snapshots.length === 0) {
      return { status: "no_changes", message: "No published Scorecard values changed, so no correction revision was created." };
    }
    if (artifacts.snapshots.length !== 1) {
      return { status: "generation_failure", message: "Targeted Scorecard generation did not produce exactly one card." };
    }

    const snapshot = artifacts.snapshots[0];
    const metricPayload = request.cardType === "producer"
      ? prepared.producerMetrics[0].payload
      : builderPublishedMetric(prepared.builderMetrics[0]);
    const activeWriterReports = request.cardType === "builder"
      ? latestCanonicalGatewayReports(reports, request.period.end, 6)
      : [];
    const sourceCoverage = request.cardType === "producer"
      ? {
          generationScope: "manual_person",
          targetPersonId: request.personId,
          source: "gateway",
          reportCount: prepared.producerMetrics[0].payload.preview.sourceCoverage.reportCount,
          completeThrough: prepared.producerMetrics[0].payload.preview.sourceCoverage.completeThrough,
          reportIds: periodReports.map((report) => report.id),
          sourceChecksums: periodReports.map((report) => report.sourceChecksum),
          ...(request.priorSnapshot ? { priorSnapshotId: request.priorSnapshot.id } : {}),
        }
      : {
          generationScope: "manual_person",
          targetPersonId: request.personId,
          reportIds: prepared.builderMetrics[0].sourceReportIds,
          sourceChecksums: prepared.builderMetrics[0].sourceChecksums,
          activeWriterReportKeys: activeWriterReports.map(canonicalGatewayReportIdentity),
          activeWriterReportIds: activeWriterReports.map((report) => report.id),
          activeWriterSourceChecksums: activeWriterReports.map((report) => report.sourceChecksum),
          activeWriterReportDates: activeWriterReports.map((report) => report.reportDate),
          rankContextSource: "published_builder_peers",
          rankContextSnapshotIds: builderRankContext?.snapshotIds ?? [],
          rankPopulation: prepared.builderMetrics[0].recruitingRank.population,
          ...(request.priorSnapshot ? { priorSnapshotId: request.priorSnapshot.id } : {}),
        };
    const scheduleFacts = request.cardType === "producer"
      ? producerScheduleFacts(prepared.producerMetrics[0].payload)
      : [];

    const publication = revision === 1
      ? await service.rpc("publish_manual_scorecard", {
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
        })
      : await service.rpc("publish_manual_scorecard_correction", {
          p_initiated_by: request.initiatedBy,
          p_prior_snapshot_id: request.priorSnapshot!.id,
          p_correction_reason: correctionReason,
          p_metric_payload: metricPayload,
          p_published_payload: snapshot.visiblePayload,
          p_source_coverage: sourceCoverage,
          p_schedule_facts: scheduleFacts,
        });
    const { data: publishData, error: publishError } = publication;
    if (publishError) {
      console.error("Scorecard publication RPC failed", {
        operation: revision === 1 ? "publish_manual_scorecard" : "publish_manual_scorecard_correction",
        message: publishError.message,
        code: publishError.code,
        details: publishError.details,
        hint: publishError.hint,
      });
      if (revision > 1 && publishError.message.includes("A newer Scorecard revision already exists")) {
        return { status: "stale_revision", message: "A newer revision already exists. Correct the latest published Scorecard instead." };
      }
      if (revision > 1 && publishError.message.includes("Correction did not change published Scorecard values")) {
        return { status: "no_changes", message: "No published Scorecard values changed, so no correction revision was created." };
      }
      return {
        status: "generation_failure",
        message: revision === 1
          ? "The Scorecard could not be published. No partial manual publication was kept."
          : "The corrected Scorecard could not be published. No partial correction was kept.",
      };
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

export async function generateScorecardCorrectionWithClient(
  service: SupabaseClient,
  request: { initiatedBy: string; snapshotId: string; correctionReason: string },
): Promise<ManualScorecardResult> {
  const correctionReason = request.correctionReason.trim();
  if (correctionReason.length < 5 || correctionReason.length > 500) {
    return { status: "invalid_correction", message: "Correction reason must be between 5 and 500 characters." };
  }

  const { data: admin, error: adminError } = await service
    .from("person")
    .select("id, is_admin, is_super_admin")
    .eq("id", request.initiatedBy)
    .maybeSingle();
  if (adminError || !admin || (!admin.is_admin && !admin.is_super_admin)) {
    return { status: "unauthorized", message: "You are not authorized to correct Scorecards." };
  }

  const { data: selected, error: selectedError } = await service
    .from("scorecard_snapshot")
    .select("id, person_id, card_type, period_kind, period_start, period_end, lifecycle_status, revision, prior_revision_id, finalized_at, metric_run_id, kpi_results")
    .eq("id", request.snapshotId)
    .maybeSingle();
  if (selectedError || !selected) {
    return { status: "snapshot_not_found", message: "The published Scorecard selected for correction could not be found." };
  }
  if (
    (selected.card_type !== "producer" && selected.card_type !== "builder") ||
    !["monthly", "quarterly", "annual"].includes(String(selected.period_kind)) ||
    (selected.lifecycle_status !== "final" && selected.lifecycle_status !== "corrected") ||
    !selected.finalized_at ||
    !selected.metric_run_id ||
    !Number.isInteger(Number(selected.revision)) ||
    Number(selected.revision) < 1
  ) {
    return { status: "invalid_correction", message: "Only a finalized Scorecard backed by a validated run can be corrected." };
  }

  let period: ScorecardPeriod;
  try {
    period = scorecardPeriodFromStart(selected.period_kind as ScorecardPeriod["kind"], String(selected.period_start));
    if (period.end !== String(selected.period_end)) throw new Error("mismatched period end");
  } catch {
    return { status: "invalid_period", message: "The published Scorecard does not have a canonical calendar period." };
  }

  const publishedPayload = parsePublishedScorecardSnapshotPayload(selected.kpi_results);
  if (!publishedPayload || publishedPayload.cardType !== selected.card_type) {
    return { status: "generation_failure", message: "The selected published Scorecard payload could not be verified." };
  }

  const { data: latest, error: latestError } = await service
    .from("scorecard_snapshot")
    .select("id, revision")
    .eq("person_id", selected.person_id)
    .eq("card_type", selected.card_type)
    .eq("period_kind", selected.period_kind)
    .eq("period_start", selected.period_start)
    .eq("period_end", selected.period_end)
    .in("lifecycle_status", ["final", "corrected"])
    .not("finalized_at", "is", null)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError || !latest) {
    return { status: "generation_failure", message: "Unable to confirm the latest published Scorecard revision." };
  }
  if (String(latest.id) !== String(selected.id)) {
    return { status: "stale_revision", message: "A newer revision already exists. Correct the latest published Scorecard instead." };
  }

  const priorSnapshot: ScorecardArtifact = {
    id: String(selected.id),
    runId: String(selected.metric_run_id),
    revision: Number(selected.revision),
    personId: String(selected.person_id),
    cardType: selected.card_type,
    lifecycleStatus: selected.lifecycle_status,
    period,
    title: `${period.label} ${selected.card_type === "producer" ? "Producer" : "Builder"} Scorecard`,
    visiblePayload: selected.kpi_results as Record<string, unknown>,
    priorSnapshotId: selected.prior_revision_id ? String(selected.prior_revision_id) : null,
  };

  return generateManualScorecardWithClient(service, {
    initiatedBy: request.initiatedBy,
    personId: priorSnapshot.personId,
    cardType: priorSnapshot.cardType,
    period,
    revision: priorSnapshot.revision + 1,
    priorSnapshot,
    correctionReason,
  });
}

export async function generateScorecardCorrection(
  request: { initiatedBy: string; snapshotId: string; correctionReason: string },
): Promise<ManualScorecardResult> {
  return generateScorecardCorrectionWithClient(createServiceRoleClient(), request);
}

export async function generateManualScorecard(
  request: ManualGenerationRequest,
): Promise<ManualScorecardResult> {
  return generateManualScorecardWithClient(createServiceRoleClient(), request);
}
