import "server-only";

import { randomUUID } from "node:crypto";
import { gatewayActiveDirectWindow } from "./active-directs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  aggregatePersonalGatewayReports,
  canonicalGatewayReportIdentity,
  chicagoDateOfInstant,
  gatewayReportInScorecardPeriod,
  gatewayPeriodRequirements,
  latestCanonicalGatewayReports,
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

type AutoPublishLedgerRow = {
  period_kind: ScorecardPeriod["kind"];
  period_start: string;
  period_end: string;
  period_label: string;
  status: "waiting" | "published" | "blocked" | "failed";
  run_id: string | null;
};

type MemberDecision = {
  personId: string;
  cardType: "producer" | "builder";
  status: "eligible" | "excluded";
  reason?: string;
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
  status: "published" | "existing" | "incomplete" | "blocked" | "failed" | "no_population";
  runId?: string;
  snapshotCount?: number;
  reason?: string;
  memberDecisions?: MemberDecision[];
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

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function periodFromLedger(row: AutoPublishLedgerRow): ScorecardPeriod {
  return {
    kind: row.period_kind,
    start: row.period_start,
    end: row.period_end,
    label: row.period_label,
  };
}

/**
 * Natural-close hints. These are persisted to the automatic-publish ledger;
 * unresolved rows remain due after the calendar moves on. Actual publication
 * still waits for explicit Gateway final-week evidence.
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
  return loadAllPages<PopulationContextRow>(async (from, to) => {
    const result = await service
      .rpc("scorecard_population_context", {
        p_period_end: periodEnd,
      })
      .order("person_id", { ascending: true })
      .range(from, to);
    return result as {
      data: PopulationContextRow[] | null;
      error: { message: string } | null;
    };
  }, "frozen Scorecard population");
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
        .select("id, person_id, source_kind, pull_kind, period_type, status, report_date, period_start, gateway_label, source_checksum, scorecard_period_start, scorecard_period_end, gateway_week_ordinal, gateway_period_final, matched_count, unmatched_count, ambiguous_count, summary, created_at")
        .not("person_id", "is", null)
        .eq("source_kind", "personal_gateway")
        .eq("period_type", "wtd")
        .gte("scorecard_period_start", monthStart(start))
        .lte("scorecard_period_start", end)
        .order("person_id", { ascending: true })
        .order("scorecard_period_start", { ascending: true })
        .order("gateway_week_ordinal", { ascending: true })
        .order("created_at", { ascending: true })
        .range(from, to);
      return result as { data: PersonalGatewayImportEvidence[] | null; error: { message: string } | null };
    }, "personal Gateway imports"),
    loadAllPages<PersonalGatewayPremiumRow>(async (from, to) => {
      const result = await service
        .from("producer_issued_premium")
        .select("id, import_id, person_id, source_kind, report_date, period_start, scorecard_period_start, scorecard_period_end, gateway_week_ordinal, gateway_period_final, personal_ip_cents, team_ip_cents, first_leg_percent")
        .eq("source_kind", "personal_gateway")
        .eq("period_type", "wtd")
        .gte("scorecard_period_start", monthStart(start))
        .lte("scorecard_period_start", end)
        .order("person_id", { ascending: true })
        .order("scorecard_period_start", { ascending: true })
        .order("gateway_week_ordinal", { ascending: true })
        .range(from, to);
      return result as { data: PersonalGatewayPremiumRow[] | null; error: { message: string } | null };
    }, "personal Gateway premium rows"),
  ]);
  return { imports, premiumRows };
}

async function ensureAutoPublishLedgerCandidates(
  service: SupabaseClient,
  periods: ScorecardPeriod[],
) {
  if (periods.length === 0) return;
  const rows = periods.map((period) => ({
    period_kind: period.kind,
    period_start: period.start,
    period_end: period.end,
    period_label: period.label,
    status: "waiting",
  }));
  const { error } = await service
    .from("scorecard_auto_publish_period")
    .upsert(rows, { onConflict: "period_kind,period_start", ignoreDuplicates: true });
  if (error) throw new Error(`Unable to persist automatic Scorecard due periods: ${error.message}`);
}

async function loadDueAutoPublishPeriods(service: SupabaseClient): Promise<AutoPublishLedgerRow[]> {
  const { data, error } = await service
    .from("scorecard_auto_publish_period")
    .select("period_kind, period_start, period_end, period_label, status, run_id")
    .in("status", ["waiting", "failed"])
    .order("period_start", { ascending: true })
    .order("period_kind", { ascending: true });
  if (error) throw new Error(`Unable to load automatic Scorecard due periods: ${error.message}`);
  return (data ?? []) as AutoPublishLedgerRow[];
}

async function updateAutoPublishLedger(
  service: SupabaseClient,
  result: AutoPublishPeriodResult,
) {
  const status = result.status === "published" || result.status === "existing"
    ? "published"
    : result.status === "blocked"
      ? "blocked"
      : "waiting";
  const payload: Record<string, unknown> = {
    status,
    last_evaluated_at: new Date().toISOString(),
    last_reason: result.reason ?? null,
    member_decisions: result.memberDecisions ?? [],
    run_id: result.runId ?? null,
    updated_at: new Date().toISOString(),
  };
  if (status === "published") payload.published_at = new Date().toISOString();
  const { error } = await service
    .from("scorecard_auto_publish_period")
    .update(payload)
    .eq("period_kind", result.period.kind)
    .eq("period_start", result.period.start);
  if (error) throw new Error(`Unable to update automatic Scorecard ledger: ${error.message}`);
}

async function markAutoPublishFailure(
  service: SupabaseClient,
  period: ScorecardPeriod,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : "Automatic Scorecard processing failed.";
  const { error: updateError } = await service
    .from("scorecard_auto_publish_period")
    .update({
      status: "failed",
      last_evaluated_at: new Date().toISOString(),
      last_reason: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("period_kind", period.kind)
    .eq("period_start", period.start);
  if (updateError) throw new Error(`Unable to record automatic Scorecard failure: ${updateError.message}`);
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

function builderSourceCoverage(
  metric: BuilderPeriodMetric,
  activeWriterReports: ScorecardRunInput["gatewayReports"],
) {
  return {
    generationScope: "population",
    trigger: "gateway_complete",
    reportIds: metric.sourceReportIds,
    sourceChecksums: metric.sourceChecksums,
    activeWriterReportKeys: activeWriterReports.map(canonicalGatewayReportIdentity),
    activeWriterReportIds: activeWriterReports.map((report) => report.id),
    activeWriterSourceChecksums: activeWriterReports.map((report) => report.sourceChecksum),
    activeWriterReportDates: activeWriterReports.map((report) => report.reportDate),
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
  const frozenProducers = context.filter((person) => person.active_at_period_end && person.producer_at_period_end);
  const frozenBuilders = context.filter((person) => person.active_at_period_end && person.builder_at_period_end);
  if (frozenProducers.length + frozenBuilders.length === 0) {
    return { period, status: "no_population" };
  }

  const reportStart = frozenBuilders.length > 0
    ? earlierDate(period.start, sixWeekStart(period.end))
    : period.start;
  const { imports, premiumRows } = await loadGatewayEvidence(service, reportStart, period.end);
  const requirements = gatewayPeriodRequirements(imports, period, { ongoingOnly: true });
  if (!requirements.ready) {
    return {
      period,
      status: "incomplete",
      reason: requirements.missingMonthStarts.length
        ? `Waiting for Gateway final-week evidence for ${requirements.missingMonthStarts.join(", ")}.`
        : "Waiting for Gateway final-week evidence.",
    };
  }

  const frozenPersonIds = [...new Set(
    context
      .filter((person) => person.active_at_period_end && (person.producer_at_period_end || person.builder_at_period_end))
      .map((person) => person.person_id),
  )];
  const decisions: MemberDecision[] = [];
  for (const producer of frozenProducers) {
    decisions.push({
      personId: producer.person_id,
      cardType: "producer",
      status: "eligible",
    });
  }
  for (const builder of frozenBuilders) {
    decisions.push({
      personId: builder.person_id,
      cardType: "builder",
      status: "eligible",
    });
  }

  const gatewayReports = aggregatePersonalGatewayReports({
    imports,
    premiumRows,
    personIds: frozenPersonIds,
    start: reportStart,
    end: period.end,
  });
  const knownDirects = new Set<string>();
  const unresolvedDirects = new Set<string>();
  for (const report of gatewayReports) {
    const membership = gatewayActiveDirectWindow(report, period.end);
    for (const row of report.rows) {
      if (row.personalIpCents <= 0) continue;
      if (membership === true) knownDirects.add(row.personId);
      if (membership === null) unresolvedDirects.add(row.personId);
    }
  }
  for (const decision of decisions) {
    if (decision.cardType !== "builder" || decision.status !== "eligible") continue;
    if (people.some((person) => person.activeAtPeriodEnd && person.uplineId === decision.personId &&
        person.id !== decision.personId && unresolvedDirects.has(person.id) && !knownDirects.has(person.id))) {
      decision.status = "excluded";
      decision.reason = "Active Direct coverage needs a provider-sourced week date at the six-week boundary.";
    }
  }
  const activeWriterReports = latestCanonicalGatewayReports(gatewayReports, period.end, 6);
  if (activeWriterReports.length < 6) {
    for (const decision of decisions) {
      if (decision.cardType === "builder" && decision.status === "eligible") {
        decision.status = "excluded";
        decision.reason = "Six distinct Gateway WTD source buckets are not available for Active Writers.";
      }
    }
  }

  const prior = previousEquivalentPeriod(period);
  const priorBuilderTeamIpCents: Record<string, number | null> = {};
  const priorBuilderCoverage: ScorecardRunInput["priorBuilderCoverage"] = {};
  let eligibleBuilderIds = decisions
    .filter((decision) => decision.cardType === "builder" && decision.status === "eligible")
    .map((decision) => decision.personId);
  if (eligibleBuilderIds.length > 0) {
    if (prior.end < "2026-01-01") {
      for (const builderId of eligibleBuilderIds) {
        priorBuilderCoverage[builderId] = "outside_retention";
        priorBuilderTeamIpCents[builderId] = null;
      }
    } else {
      const priorEvidenceRows = await loadGatewayEvidence(service, prior.start, prior.end);
      const priorRequirements = gatewayPeriodRequirements(priorEvidenceRows.imports, prior);
      const priorEvidence = summarizePersonalGatewayEvidence({
        personIds: eligibleBuilderIds,
        requiredWeeks: priorRequirements.requiredWeeks,
        imports: priorEvidenceRows.imports,
        premiumRows: priorEvidenceRows.premiumRows,
      });
      const priorReports = aggregatePersonalGatewayReports({
        imports: priorEvidenceRows.imports,
        premiumRows: priorEvidenceRows.premiumRows,
        personIds: eligibleBuilderIds,
        start: prior.start,
        end: prior.end,
      });
      for (const builderId of eligibleBuilderIds) {
        if (!priorRequirements.ready || !priorEvidence.byPerson.get(builderId)?.complete) {
          const decision = decisions.find((entry) => entry.cardType === "builder" && entry.personId === builderId)!;
          decision.status = "excluded";
          decision.reason = "The Builder comparison period does not have verifiable final Gateway coverage.";
          priorBuilderCoverage[builderId] = "incomplete";
          priorBuilderTeamIpCents[builderId] = null;
          continue;
        }
        priorBuilderCoverage[builderId] = "complete";
        priorBuilderTeamIpCents[builderId] = priorReports
          .flatMap((report) => report.rows)
          .filter((row) => row.personId === builderId)
          .reduce((sum, row) => sum + row.teamIpCents, 0);
      }
    }
  }

  const eligibleProducerIds = decisions
    .filter((decision) => decision.cardType === "producer" && decision.status === "eligible")
    .map((decision) => decision.personId);
  eligibleBuilderIds = decisions
    .filter((decision) => decision.cardType === "builder" && decision.status === "eligible")
    .map((decision) => decision.personId);
  if (eligibleProducerIds.length + eligibleBuilderIds.length === 0) {
    return {
      period,
      status: "incomplete",
      reason: "No frozen Scorecard card is currently eligible for publication.",
      memberDecisions: decisions,
    };
  }

  const generatedAt = now;
  const supportPeople = eligibleBuilderIds.length > 0
    ? frozenProducers
    : frozenProducers.filter((person) => eligibleProducerIds.includes(person.person_id));
  const supportCaptured = await mapWithConcurrency(
    supportPeople,
    PRODUCER_CAPTURE_CONCURRENCY,
    async (person) => {
      const metric = await captureProducerMetric(service, person, period, generatedAt);
      return { personId: person.person_id, metric };
    },
  );
  const metricsByPerson = new Map(supportCaptured.map((row) => [row.personId, row.metric]));
  const verificationCaptured = await mapWithConcurrency(
    frozenProducers.filter((person) => eligibleProducerIds.includes(person.person_id)),
    PRODUCER_CAPTURE_CONCURRENCY,
    async (person) => ({
      personId: person.person_id,
      verification: await captureProducerMetric(service, person, period, generatedAt),
    }),
  );
  const builderProductionSupport = eligibleBuilderIds.length > 0
    ? supportCaptured.map(({ personId, metric }) => {
        const current = metric.overview.activity.totals;
        const priorActivity = metric.overview.priorActivityTotals;
        return {
          personId,
          current: {
            dials: current?.dials ?? 0,
            contacts: current?.contacts ?? 0,
            presentations: current?.presentations ?? 0,
            sales: current?.sales ?? 0,
            apCents: metric.overview.submittedApCents ?? 0,
          },
          prior: {
            dials: priorActivity?.dials ?? 0,
            contacts: priorActivity?.contacts ?? 0,
            presentations: priorActivity?.presentations ?? 0,
            sales: priorActivity?.sales ?? 0,
            apCents: metric.overview.priorSubmittedApCents ?? 0,
          },
        };
      })
    : undefined;
  const periodReports = gatewayReports
    .filter((report) => gatewayReportInScorecardPeriod(report, period));
  const runId = randomUUID();
  const input: ScorecardRunInput = {
    runId,
    revision: 1,
    period,
    priorPeriod: prior,
    generatedAt: generatedAt.toISOString(),
    expectedReportDates: [],
    expectedGatewayWeeks: requirements.finalWeeks.map((week) => ({
      periodStart: week.periodStart,
      weekOrdinal: week.weekOrdinal,
    })),
    people,
    gatewayReports,
    recruits: toRunRecruits(context),
    priorBuilderTeamIpCents,
    priorBuilderCoverage,
    producerMetrics: eligibleProducerIds.map((personId) => ({
      personId,
      payload: metricsByPerson.get(personId)!,
    })),
    producerVerificationMetrics: verificationCaptured.map((row) => ({
      personId: row.personId,
      payload: row.verification,
    })),
    eligibleTargets: [
      ...eligibleProducerIds.map((personId) => ({ personId, cardType: "producer" as const })),
      ...eligibleBuilderIds.map((personId) => ({ personId, cardType: "builder" as const })),
    ],
    builderProductionSupport,
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
    builderSourceCoverage(metric, activeWriterReports),
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
    requiredGatewayWeeks: requirements.requiredWeeks,
    finalGatewayWeeks: requirements.finalWeeks,
    memberDecisions: decisions,
    gatewayReportIds: periodReports.map((report) => report.id),
    generatedAt: generatedAt.toISOString(),
  };
  const { data, error } = await service.rpc("publish_gateway_eligible_scorecard_population", {
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
    memberDecisions: decisions,
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
  const service = createServiceRoleClient();
  await ensureAutoPublishLedgerCandidates(service, candidateClosedPeriods(instant));
  const dueRows = await loadDueAutoPublishPeriods(service);
  const due = dueRows.map(periodFromLedger);
  const bounded = limit == null
    ? due
    : due.slice(0, Math.max(0, Math.trunc(limit)));
  const periods: AutoPublishPeriodResult[] = [];
  for (const period of bounded) {
    try {
      const result = await processPeriod(service, period, instant);
      await updateAutoPublishLedger(service, result);
      periods.push(result);
    } catch (error) {
      await markAutoPublishFailure(service, period, error);
      periods.push({
        period,
        status: "failed",
        reason: error instanceof Error ? error.message : "Automatic Scorecard processing failed.",
      });
    }
  }
  return {
    evaluated: periods.length,
    published: periods.filter((entry) => entry.status === "published").length,
    existing: periods.filter((entry) => entry.status === "existing").length,
    skipped: periods.filter((entry) => entry.status !== "published" && entry.status !== "existing").length,
    periods,
  };
}
