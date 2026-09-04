import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  aggregatePersonalGatewayReports,
  chicagoDateOfInstant,
  requiredGatewayMondays,
  summarizePersonalGatewayEvidence,
  type PersonalGatewayImportEvidence,
  type PersonalGatewayPremiumRow,
} from "./gateway-completeness";
import { createProducerPeriodPreview, createScorecardScheduleFacts } from "./lifecycle";
import {
  previousEquivalentPeriod,
  scorecardPeriodFromStart,
  type ScorecardPeriod,
} from "./period";
import { builderPublishedMetric } from "./published-snapshot";
import {
  createScorecardArtifacts,
  prepareScorecardRun,
  type BuilderPeriodMetric,
  type ProducerPeriodMetricPayload,
  type ScorecardRunInput,
  type ScorecardRunPerson,
} from "./run";
import {
  loadManualProducerOverviewForPeriod,
  loadProducerSourceForPeriod,
} from "./source";

type PopulationContextRow = {
  person_id: string;
  full_name: string;
  email: string | null;
  photo_url: string | null;
  photo_review_status: string | null;
  npn: string | null;
  npn_status: string | null;
  npn_verified_at: string | null;
  recruit_id: string | null;
  recruit_created_at: string | null;
  recruit_removed_at: string | null;
  upline_id: string | null;
  active_at_period_end: boolean;
  producer_at_period_end: boolean;
  builder_at_period_end: boolean;
};

type ConnectionRow = {
  person_id: string;
  first_connected_at: string | null;
};

type ExistingRunRow = {
  id: string;
  status: string;
};

type ExistingSnapshotRow = {
  id: string;
};

type PopulationPublishRow = {
  run_id: string;
  snapshot_count: number | string;
  existing: boolean;
};

export type AutoPublishPeriodResult = {
  period: ScorecardPeriod;
  status: "published" | "existing" | "incomplete" | "blocked" | "no_population";
  runId?: string;
  snapshotCount?: number;
  reason?: string;
};

export type AutoPublishResult = {
  evaluated: number;
  published: number;
  existing: number;
  skipped: number;
  periods: AutoPublishPeriodResult[];
};

const PAGE_SIZE = 1000;
const PRODUCER_CAPTURE_CONCURRENCY = 4;

function isoDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

function sixWeekStart(periodEnd: string): string {
  const date = new Date(`${periodEnd}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 41);
  return date.toISOString().slice(0, 10);
}

function earlierDate(left: string, right: string) {
  return left < right ? left : right;
}

/**
 * Automatic publication only considers periods that closed in the immediately
 * preceding Chicago calendar month. This deliberately prevents first-connect
 * historical backfill from minting old Scorecards.
 */
export function candidateClosedPeriods(now: Date | string): ScorecardPeriod[] {
  const instant = typeof now === "string" ? now : now.toISOString();
  const today = chicagoDateOfInstant(instant);
  if (!today) throw new Error("Unable to derive the Chicago business date for Scorecard publishing.");
  const current = new Date(`${today}T00:00:00.000Z`);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  const previousMonthStart = isoDate(year, month - 1, 1);
  const monthly = scorecardPeriodFromStart("monthly", previousMonthStart);
  const result: ScorecardPeriod[] = [monthly];
  const monthIndex = new Date(`${monthly.start}T00:00:00.000Z`).getUTCMonth();
  if (monthIndex % 3 === 2) {
    result.push(scorecardPeriodFromStart("quarterly", isoDate(
      Number(monthly.start.slice(0, 4)),
      monthIndex - 2,
      1,
    )));
  }
  if (monthIndex === 11) {
    result.push(scorecardPeriodFromStart("annual", `${monthly.start.slice(0, 4)}-01-01`));
  }
  return result;
}

async function loadAllPages<T>(
  loadPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await loadPage(from, from + PAGE_SIZE - 1);
    if (result.error) throw new Error(`Unable to load ${label}: ${result.error.message}`);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function loadPopulationContext(
  service: SupabaseClient,
  periodEnd: string,
): Promise<PopulationContextRow[]> {
  const { data, error } = await service.rpc("scorecard_population_context", {
    p_period_end: periodEnd,
  });
  if (error) throw new Error(`Unable to load frozen Scorecard population: ${error.message}`);
  return (data ?? []) as PopulationContextRow[];
}

async function loadConnections(service: SupabaseClient): Promise<ConnectionRow[]> {
  return loadAllPages<ConnectionRow>(async (from, to) => {
    const result = await service
      .from("gateway_connection")
      .select("person_id, first_connected_at")
      .order("person_id", { ascending: true })
      .range(from, to);
    return result as { data: ConnectionRow[] | null; error: { message: string } | null };
  }, "Gateway connection history");
}

async function loadGatewayEvidence(
  service: SupabaseClient,
  start: string,
  end: string,
): Promise<{ imports: PersonalGatewayImportEvidence[]; premiumRows: PersonalGatewayPremiumRow[] }> {
  const [imports, premiumRows] = await Promise.all([
    loadAllPages<PersonalGatewayImportEvidence>(async (from, to) => {
      const result = await service
        .from("gateway_issued_premium_import")
        .select("id, person_id, period_type, status, report_date, gateway_label, source_checksum, matched_count, unmatched_count, ambiguous_count, summary, created_at")
        .not("person_id", "is", null)
        .eq("period_type", "wtd")
        .gte("report_date", start)
        .lte("report_date", end)
        .order("person_id", { ascending: true })
        .order("report_date", { ascending: true })
        .order("created_at", { ascending: true })
        .range(from, to);
      return result as { data: PersonalGatewayImportEvidence[] | null; error: { message: string } | null };
    }, "personal Gateway imports"),
    loadAllPages<PersonalGatewayPremiumRow>(async (from, to) => {
      const result = await service
        .from("producer_issued_premium")
        .select("id, import_id, person_id, report_date, personal_ip_cents, team_ip_cents, first_leg_percent")
        .eq("period_type", "wtd")
        .gte("report_date", start)
        .lte("report_date", end)
        .order("person_id", { ascending: true })
        .order("report_date", { ascending: true })
        .range(from, to);
      return result as { data: PersonalGatewayPremiumRow[] | null; error: { message: string } | null };
    }, "personal Gateway premium rows"),
  ]);
  return { imports, premiumRows };
}

function toRunPeople(context: PopulationContextRow[]): ScorecardRunPerson[] {
  return context.map((person) => ({
    id: person.person_id,
    fullName: person.full_name,
    email: person.email ?? "",
    photoUrl: person.photo_url,
    photoReviewStatus: person.photo_review_status,
    uplineId: person.upline_id,
    activeAtPeriodEnd: person.active_at_period_end,
    producerAtPeriodEnd: person.producer_at_period_end,
    builderAtPeriodEnd: person.builder_at_period_end,
  }));
}

function toRunRecruits(context: PopulationContextRow[]): ScorecardRunInput["recruits"] {
  return context.flatMap((person) => person.recruit_id ? [{
    id: person.recruit_id,
    personId: person.person_id,
    createdAt: person.recruit_created_at ?? "1970-01-01T00:00:00.000Z",
    removedAt: person.recruit_removed_at,
    npn: person.npn,
    npnStatus: person.npn_status,
    npnVerifiedAt: person.npn_verified_at,
  }] : []);
}

async function captureProducerMetric(
  service: SupabaseClient,
  person: PopulationContextRow,
  period: ScorecardPeriod,
  generatedAt: Date,
): Promise<ProducerPeriodMetricPayload> {
  const prior = previousEquivalentPeriod(period);
  const [currentSource, priorSource] = await Promise.all([
    loadProducerSourceForPeriod(service, person.person_id, period, generatedAt),
    loadProducerSourceForPeriod(service, person.person_id, prior, generatedAt),
  ]);
  const preview = createProducerPeriodPreview(currentSource, period.kind);
  const priorPreview = createProducerPeriodPreview(priorSource, period.kind);
  const overview = await loadManualProducerOverviewForPeriod(
    service,
    {
      id: person.person_id,
      full_name: person.full_name,
      photo_url: person.photo_url,
      photo_review_status: person.photo_review_status,
    },
    preview.totalIssuedIpCents,
    priorPreview.totalIssuedIpCents,
    period,
  );
  return { preview, overview };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
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

function builderSourceCoverage(metric: BuilderPeriodMetric, activeWriterReportDates: string[]) {
  return {
    generationScope: "population",
    trigger: "gateway_complete",
    reportIds: metric.sourceReportIds,
    sourceChecksums: metric.sourceChecksums,
    activeWriterReportDates,
  };
}

async function existingPopulationRun(
  service: SupabaseClient,
  period: ScorecardPeriod,
): Promise<ExistingRunRow | null> {
  const { data, error } = await service
    .from("scorecard_metric_run")
    .select("id, status")
    .eq("generation_scope", "population")
    .eq("period_kind", period.kind)
    .eq("period_start", period.start)
    .eq("revision", 1)
    .maybeSingle();
  if (error) throw new Error(`Unable to inspect existing Scorecard run: ${error.message}`);
  return data as ExistingRunRow | null;
}

async function existingRevisionOneSnapshot(
  service: SupabaseClient,
  period: ScorecardPeriod,
): Promise<ExistingSnapshotRow | null> {
  const { data, error } = await service
    .from("scorecard_snapshot")
    .select("id")
    .eq("period_kind", period.kind)
    .eq("period_start", period.start)
    .eq("period_end", period.end)
    .eq("revision", 1)
    .in("lifecycle_status", ["final", "corrected"])
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Unable to inspect existing Scorecard artifacts: ${error.message}`);
  return data as ExistingSnapshotRow | null;
}

async function processPeriod(
  service: SupabaseClient,
  period: ScorecardPeriod,
  now: Date,
): Promise<AutoPublishPeriodResult> {
  const existingRun = await existingPopulationRun(service, period);
  if (existingRun && (existingRun.status === "published" || existingRun.status === "delivery_errors")) {
    return { period, status: "existing", runId: existingRun.id };
  }
  if (existingRun) {
    return {
      period,
      status: "blocked",
      runId: existingRun.id,
      reason: `Existing population run is ${existingRun.status}; automatic publisher will not overwrite it.`,
    };
  }
  const existingSnapshot = await existingRevisionOneSnapshot(service, period);
  if (existingSnapshot) {
    return {
      period,
      status: "blocked",
      reason: "Revision-one Scorecard artifacts already exist outside a population run; automatic publication will not merge partial manual history.",
    };
  }

  const context = await loadPopulationContext(service, period.end);
  const people = toRunPeople(context);
  const eligiblePeople = context.filter((person) =>
    person.active_at_period_end && (person.producer_at_period_end || person.builder_at_period_end));
  const eligiblePersonIds = [...new Set(eligiblePeople.map((person) => person.person_id))];
  const eligibleProducers = context.filter((person) => person.active_at_period_end && person.producer_at_period_end);
  const eligibleBuilders = context.filter((person) => person.active_at_period_end && person.builder_at_period_end);
  if (eligibleProducers.length + eligibleBuilders.length === 0) {
    return { period, status: "no_population" };
  }

  const reportStart = eligibleBuilders.length > 0
    ? earlierDate(period.start, sixWeekStart(period.end))
    : period.start;
  const [{ imports, premiumRows }, connections] = await Promise.all([
    loadGatewayEvidence(service, reportStart, period.end),
    loadConnections(service),
  ]);
  const connectionsByPerson = new Map(connections.map((row) => [row.person_id, row.first_connected_at]));
  const requiredDates = requiredGatewayMondays(period);
  const periodEvidence = summarizePersonalGatewayEvidence({
    personIds: eligiblePersonIds,
    requiredDates,
    imports,
    premiumRows,
  });
  for (const personId of eligiblePersonIds) {
    const firstConnectedDate = chicagoDateOfInstant(connectionsByPerson.get(personId));
    const evidence = periodEvidence.byPerson.get(personId);
    if (
      !firstConnectedDate ||
      firstConnectedDate > period.end ||
      !evidence?.complete ||
      !evidence.finalWeekReady
    ) {
      return {
        period,
        status: "incomplete",
        reason: `Gateway evidence is incomplete for ${personId}.`,
      };
    }
  }

  // Builders need a complete six-WTD active-writer source window as well as
  // the exact period Mondays. A partial older week would undercount writers.
  if (eligibleBuilders.length > 0) {
    const metricWindowDates = requiredGatewayMondays({ start: reportStart, end: period.end });
    const metricWindow = summarizePersonalGatewayEvidence({
      personIds: eligiblePersonIds,
      requiredDates: metricWindowDates,
      imports,
      premiumRows,
    });
    if (eligiblePersonIds.some((personId) => !metricWindow.byPerson.get(personId)?.complete)) {
      return {
        period,
        status: "incomplete",
        reason: "The complete six-WTD Builder active-writer source window is not available.",
      };
    }
  }

  const gatewayReports = aggregatePersonalGatewayReports({
    imports,
    premiumRows,
    personIds: eligiblePersonIds,
    start: reportStart,
    end: period.end,
  });
  const prior = previousEquivalentPeriod(period);
  const priorBuilderTeamIpCents: Record<string, number | null> = {};
  const priorBuilderCoverage: ScorecardRunInput["priorBuilderCoverage"] = {};
  if (eligibleBuilders.length > 0) {
    if (prior.end < "2026-01-01") {
      for (const builder of eligibleBuilders) {
        priorBuilderCoverage[builder.person_id] = "outside_retention";
        priorBuilderTeamIpCents[builder.person_id] = null;
      }
    } else {
      const priorEvidenceRows = await loadGatewayEvidence(service, prior.start, prior.end);
      const builderIds = eligibleBuilders.map((builder) => builder.person_id);
      const priorRequiredDates = requiredGatewayMondays(prior);
      const priorEvidence = summarizePersonalGatewayEvidence({
        personIds: builderIds,
        requiredDates: priorRequiredDates,
        imports: priorEvidenceRows.imports,
        premiumRows: priorEvidenceRows.premiumRows,
      });
      const priorReports = aggregatePersonalGatewayReports({
        imports: priorEvidenceRows.imports,
        premiumRows: priorEvidenceRows.premiumRows,
        personIds: builderIds,
        start: prior.start,
        end: prior.end,
      });
      for (const builder of eligibleBuilders) {
        if (!priorEvidence.byPerson.get(builder.person_id)?.complete) {
          priorBuilderCoverage[builder.person_id] = "incomplete";
          priorBuilderTeamIpCents[builder.person_id] = null;
          continue;
        }
        priorBuilderCoverage[builder.person_id] = "complete";
        priorBuilderTeamIpCents[builder.person_id] = priorReports
          .flatMap((report) => report.rows)
          .filter((row) => row.personId === builder.person_id)
          .reduce((sum, row) => sum + row.teamIpCents, 0);
      }
    }
  }

  const generatedAt = now;
  const captured = await mapWithConcurrency(
    eligibleProducers,
    PRODUCER_CAPTURE_CONCURRENCY,
    async (person) => {
      const [metric, verification] = await Promise.all([
        captureProducerMetric(service, person, period, generatedAt),
        captureProducerMetric(service, person, period, generatedAt),
      ]);
      return { personId: person.person_id, metric, verification };
    },
  );
  const runId = randomUUID();
  const input: ScorecardRunInput = {
    runId,
    revision: 1,
    period,
    priorPeriod: prior,
    generatedAt: generatedAt.toISOString(),
    expectedReportDates: requiredDates,
    people,
    gatewayReports,
    recruits: toRunRecruits(context),
    priorBuilderTeamIpCents,
    priorBuilderCoverage,
    producerMetrics: captured.map((row) => ({ personId: row.personId, payload: row.metric })),
    producerVerificationMetrics: captured.map((row) => ({ personId: row.personId, payload: row.verification })),
  };
  const prepared = prepareScorecardRun(input);
  if (prepared.status !== "ready") {
    return {
      period,
      status: "blocked",
      reason: prepared.problems[0]?.message ?? "Canonical Scorecard population validation did not pass.",
    };
  }
  const artifacts = createScorecardArtifacts({ prepared, input });
  const expectedArtifacts = prepared.summary.eligibleProducers + prepared.summary.eligibleBuilders;
  if (artifacts.snapshots.length !== expectedArtifacts) {
    return {
      period,
      status: "blocked",
      reason: "Canonical artifact generation did not produce the complete frozen population.",
    };
  }

  const producerMetricIds = new Map(prepared.producerMetrics.map((metric) => [metric.personId, randomUUID()]));
  const builderMetricIds = new Map(prepared.builderMetrics.map((metric) => [metric.personId, randomUUID()]));
  const periodReports = gatewayReports.filter((report) => report.reportDate >= period.start && report.reportDate <= period.end);
  const activeWriterReportDates = [...new Set(gatewayReports.map((report) => report.reportDate))]
    .sort((left, right) => right.localeCompare(left))
    .slice(0, 6);
  const producerCoverageByPerson = new Map(prepared.producerMetrics.map((metric) => [metric.personId, {
    generationScope: "population",
    trigger: "gateway_complete",
    source: "gateway",
    reportCount: metric.payload.preview.sourceCoverage.reportCount,
    completeThrough: metric.payload.preview.sourceCoverage.completeThrough,
    reportIds: periodReports.map((report) => report.id),
    sourceChecksums: periodReports.map((report) => report.sourceChecksum),
  }]));
  const builderCoverageByPerson = new Map(prepared.builderMetrics.map((metric) => [
    metric.personId,
    builderSourceCoverage(metric, activeWriterReportDates),
  ]));
  const snapshots = artifacts.snapshots.map((artifact) => {
    const metricId = artifact.cardType === "producer"
      ? producerMetricIds.get(artifact.personId)
      : builderMetricIds.get(artifact.personId);
    if (!metricId) throw new Error(`Metric id missing for ${artifact.cardType} ${artifact.personId}.`);
    const producerMetric = artifact.cardType === "producer"
      ? prepared.producerMetrics.find((metric) => metric.personId === artifact.personId)
      : null;
    return {
      personId: artifact.personId,
      cardType: artifact.cardType,
      metricId,
      priorSnapshotId: artifact.priorSnapshotId,
      sourceCoverage: artifact.cardType === "producer"
        ? producerCoverageByPerson.get(artifact.personId)
        : builderCoverageByPerson.get(artifact.personId),
      visiblePayload: artifact.visiblePayload,
      rankContext: null,
      scheduleFacts: producerMetric ? producerScheduleFacts(producerMetric.payload) : [],
    };
  });
  const sourceManifest = {
    trigger: "gateway_complete",
    generationScope: "population",
    requiredGatewayMondays: requiredDates,
    finalRequiredDate: periodEvidence.finalRequiredDate,
    gatewayReportIds: periodReports.map((report) => report.id),
    generatedAt: generatedAt.toISOString(),
  };
  const { data, error } = await service.rpc("publish_gateway_complete_scorecard_population", {
    p_run_id: runId,
    p_period_kind: period.kind,
    p_period_start: period.start,
    p_period_end: period.end,
    p_period_label: period.label,
    p_producer_metrics: prepared.producerMetrics.map((metric) => ({
      metricId: producerMetricIds.get(metric.personId),
      personId: metric.personId,
      visiblePayload: metric.payload,
      sourceCoverage: producerCoverageByPerson.get(metric.personId),
    })),
    p_builder_metrics: prepared.builderMetrics.map((metric) => ({
      metricId: builderMetricIds.get(metric.personId),
      personId: metric.personId,
      visiblePayload: builderPublishedMetric(metric),
      sourceCoverage: builderCoverageByPerson.get(metric.personId),
    })),
    p_snapshots: snapshots,
    p_source_manifest: sourceManifest,
  });
  if (error) throw new Error(`Atomic Scorecard population publication failed: ${error.message}`);
  const published = ((data ?? []) as PopulationPublishRow[])[0];
  if (!published?.run_id) throw new Error("Atomic Scorecard population publisher returned no run.");
  return {
    period,
    status: published.existing ? "existing" : "published",
    runId: published.run_id,
    snapshotCount: Number(published.snapshot_count ?? 0),
  };
}

export async function processCompletedScorecardPeriods({
  now = new Date(),
  limit,
}: {
  now?: Date | string;
  limit?: number;
} = {}): Promise<AutoPublishResult> {
  const instant = typeof now === "string" ? new Date(now) : now;
  if (Number.isNaN(instant.getTime())) throw new Error("Scorecard publishing requires a valid current instant.");
  const candidates = candidateClosedPeriods(instant);
  const bounded = limit == null
    ? candidates
    : candidates.slice(0, Math.max(0, Math.trunc(limit)));
  const service = createServiceRoleClient();
  const periods: AutoPublishPeriodResult[] = [];
  for (const period of bounded) {
    periods.push(await processPeriod(service, period, instant));
  }
  return {
    evaluated: periods.length,
    published: periods.filter((entry) => entry.status === "published").length,
    existing: periods.filter((entry) => entry.status === "existing").length,
    skipped: periods.filter((entry) => entry.status !== "published" && entry.status !== "existing").length,
    periods,
  };
}
