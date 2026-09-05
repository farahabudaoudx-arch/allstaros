import { approvedPhotoUrl } from "@/lib/headshots/photo";
import { countActiveDirects, gatewayActiveDirectWindow } from "./active-directs";
import {
  createBuilderAgencyPerformance,
  createBuilderAgencyValues,
  type BuilderAgencyPerformance,
  type BuilderAgencyValues,
} from "./builder-performance";
import { licensedRecruitPersonIds } from "./licensed-recruits";
import {
  comparisonForPeriod,
  periodFactor,
  previousEquivalentPeriod,
  scorecardPeriodFromStart,
  type ScorecardPeriod,
} from "./period";
import { verifyPreparedScorecardRun, verifyPublishedScorecardArtifacts } from "./verifier";
import {
  builderPublishedMetric,
  createPublishedBuilderSnapshotPayload,
  createPublishedProducerSnapshotPayload,
  parsePublishedScorecardSnapshotPayload,
} from "./published-snapshot";
import type { MonthlyProducerPreview, ProducerOverview } from "./lifecycle";

export type ScorecardPeriodKind = "monthly" | "quarterly" | "annual";

export type ScorecardRunPerson = {
  id: string;
  fullName: string;
  email: string;
  photoUrl: string | null;
  photoReviewStatus?: string | null;
  uplineId: string | null;
  activeAtPeriodEnd: boolean;
  producerAtPeriodEnd: boolean;
  builderAtPeriodEnd: boolean;
};

export type GatewayReport = {
  id: string;
  periodType: "wtd" | "mtd" | "ytd";
  reportDate: string;
  scorecardPeriodStart?: string | null;
  scorecardPeriodEnd?: string | null;
  gatewayWeekOrdinal?: number | null;
  gatewayWeekStart?: string | null;
  gatewayPeriodFinal?: boolean | null;
  status: "published" | "pending" | "failed";
  sourceChecksum: string;
  unmatchedCount: number;
  ambiguousCount: number;
  rows: Array<{
    personId: string;
    personalIpCents: number;
    teamIpCents: number;
    firstLegPercent: number | null;
  }>;
};

function gatewayReportIdentity(report: GatewayReport): string {
  if (
    report.periodType === "wtd" &&
    report.scorecardPeriodStart &&
    Number.isInteger(report.gatewayWeekOrdinal) &&
    (report.gatewayWeekOrdinal ?? 0) > 0
  ) {
    return `coverage:${report.scorecardPeriodStart}:w${report.gatewayWeekOrdinal}`;
  }
  return `date:${report.reportDate}`;
}

function gatewayReportSortKey(report: GatewayReport): string {
  if (report.scorecardPeriodStart && Number.isInteger(report.gatewayWeekOrdinal)) {
    return `${report.scorecardPeriodStart}:${String(report.gatewayWeekOrdinal).padStart(2, "0")}:${report.reportDate}`;
  }
  return `${report.reportDate}:legacy`;
}

function gatewayReportInPeriod(report: GatewayReport, period: Pick<ScorecardPeriod, "start" | "end">): boolean {
  if (report.scorecardPeriodStart) {
    const periodEnd = report.scorecardPeriodEnd ?? report.scorecardPeriodStart;
    return periodEnd >= period.start && report.scorecardPeriodStart <= period.end;
  }
  return report.reportDate >= period.start && report.reportDate <= period.end;
}

function gatewayReportAtOrBefore(report: GatewayReport, date: string): boolean {
  return (report.scorecardPeriodStart ?? report.reportDate) <= date;
}

function gatewayReportMonth(report: GatewayReport): string {
  return (report.scorecardPeriodStart ?? report.reportDate).slice(0, 7);
}

export type ScorecardRunTarget = {
  personId: string;
  cardType: "producer" | "builder";
};

export type BuilderProductionSupport = {
  personId: string;
  current: { dials: number; contacts: number; presentations: number; sales: number; apCents: number };
  prior: { dials: number; contacts: number; presentations: number; sales: number; apCents: number };
};

export type BuilderRankPopulationEntry = {
  personId: string;
  teamIpCents: number;
  representedInGateway: boolean;
  recruitsAdded: number;
};

export type ScorecardRunInput = {
  runId: string;
  revision: number;
  period: ScorecardPeriod;
  priorPeriod: ScorecardPeriod;
  generatedAt: string;
  /** Legacy/unscoped Gateway source requirements keyed by acquisition/File Date. */
  expectedReportDates: string[];
  /** Scoped personal-Gateway source requirements keyed by the canonical covered week. */
  expectedGatewayWeeks?: Array<{ periodStart: string; weekOrdinal: number }>;
  people: ScorecardRunPerson[];
  gatewayReports: GatewayReport[];
  recruits: Array<{
    id: string;
    personId: string;
    createdAt: string;
    removedAt: string | null;
    npn: string | null;
    npnStatus: string | null;
    npnVerifiedAt: string | null;
  }>;
  priorBuilderTeamIpCents: Record<string, number | null>;
  priorBuilderCoverage: Record<string, "complete" | "outside_retention" | "incomplete">;
  producerMetrics: Array<{ personId: string; payload: ProducerPeriodMetricPayload }>;
  producerVerificationMetrics: Array<{ personId: string; payload: ProducerPeriodMetricPayload }>;
  /** One-card generation scope. Omitted for the normal complete-population run. */
  target?: ScorecardRunTarget;
  /** Explicit automatic-publication subset. Omitted by manual/legacy callers,
   * which retain the canonical full frozen-period population behavior. */
  eligibleTargets?: ScorecardRunTarget[];
  /** Bounded Producer activity/AP facts used for a targeted Builder without generating Producer artifacts for its subtree. */
  builderProductionSupport?: BuilderProductionSupport[];
  /** Frozen same-period Builder peer values used only to preserve organization-wide ranks during one-card recovery/correction. */
  builderRankPopulation?: BuilderRankPopulationEntry[];
};

function expectedGatewayIdentity(periodStart: string, weekOrdinal: number): string {
  return `coverage:${periodStart}:w${weekOrdinal}`;
}

export type ProducerPeriodMetricPayload = {
  preview: MonthlyProducerPreview;
  overview: ProducerOverview;
};

function scorecardMember(person: ScorecardRunPerson) {
  return {
    fullName: person.fullName,
    photoUrl: approvedPhotoUrl({
      photo_url: person.photoUrl,
      photo_review_status: person.photoReviewStatus ?? null,
    }),
  };
}

function sanitizeProducerMetricPhoto(
  metric: ScorecardRunInput["producerMetrics"][number],
  peopleById: Map<string, ScorecardRunPerson>,
): ScorecardRunInput["producerMetrics"][number] {
  const person = peopleById.get(metric.personId);
  if (!person) return metric;
  const member = scorecardMember(person);
  return {
    ...metric,
    payload: {
      ...metric.payload,
      overview: {
        ...metric.payload.overview,
        producer: {
          ...metric.payload.overview.producer,
          photoUrl: member.photoUrl,
        },
      },
    },
  };
}

export type ScorecardRunProblem = {
  code:
    | "missing_gateway_report"
    | "duplicate_gateway_report"
    | "unmatched_gateway_people"
    | "ambiguous_gateway_people"
    | "missing_first_leg_percent"
    | "invalid_gateway_value"
    | "invalid_source_checksum"
    | "duplicate_gateway_person_row"
    | "impossible_gateway_identity"
    | "hierarchy_cycle"
    | "incomplete_active_writer_window"
    | "unresolved_active_direct_week"
    | "builder_without_producer_role"
    | "invalid_reporting_period"
    | "invalid_comparison_period"
    | "invalid_producer_period"
    | "incomplete_comparison_period"
    | "unverified_comparison_baseline"
    | "independent_verification_failed"
    | "missing_producer_metric"
    | "duplicate_producer_metric"
    | "extra_producer_metric"
    | "invalid_target"
    | "invalid_builder_rank_context";
  message: string;
  reportDate?: string;
  personId?: string;
  count?: number;
};

type Rank = { rank: number; population: number };

export type BuilderPeriodMetric = {
  runId: string;
  revision: number;
  personId: string;
  teamIpCents: number;
  teamRank: Rank | null;
  teamRankUnavailableReason: "not_represented_in_gateway" | null;
  activeWriters: number;
  firstLegPercent: number | null;
  averageMonthlyIpPerWriterCents: number | null;
  monthCount: 1 | 3 | 12;
  growth: {
    comparison: "mom" | "qoq" | "yoy";
    priorTeamIpCents: number | null;
    currentTeamIpCents: number;
    percentage: number | null;
  };
  recruitsAdded: number;
  recruitingRank: Rank;
  trend: Array<{ reportDate: string; label: string; teamIpCents: number; share: number }>;
  performance: BuilderAgencyPerformance;
  previousPerformance: BuilderAgencyValues;
  sourceReportIds: string[];
  sourceChecksums: string[];
};

export type PreparedScorecardRun = {
  status: "ready" | "blocked";
  producerMetrics: ScorecardRunInput["producerMetrics"];
  builderMetrics: BuilderPeriodMetric[];
  problems: ScorecardRunProblem[];
  summary: {
    eligibleProducers: number;
    eligibleBuilders: number;
    producerRows: number;
    builderRows: number;
    passed: number;
    failed: number;
    held: number;
  };
};

function growthPercentage(current: number, prior: number | null) {
  if (prior == null) return null;
  if (prior === 0) return current === 0 ? 0 : 100;
  if (current === 0) return -100;
  return Math.round(((current - prior) / prior) * 1_000) / 10;
}

function competitionRanks(values: Array<{ personId: string; value: number }>) {
  const sortedValues = [...values].map(({ value }) => value).sort((a, b) => b - a);
  return new Map(
    values.map(({ personId, value }) => [
      personId,
      { rank: sortedValues.indexOf(value) + 1, population: values.length },
    ]),
  );
}

function descendantIds(rootId: string, people: ScorecardRunPerson[]) {
  const descendants = new Set([rootId]);
  let foundAnother = true;

  while (foundAnother) {
    foundAnother = false;
    for (const person of people) {
      if (person.uplineId && descendants.has(person.uplineId) && !descendants.has(person.id)) {
        descendants.add(person.id);
        foundAnother = true;
      }
    }
  }

  return descendants;
}

function validateSources(input: ScorecardRunInput, eligibleProducerIds: Set<string>, eligibleBuilderIds: Set<string>) {
  const problems: ScorecardRunProblem[] = [];
  try {
    const canonicalPeriod = scorecardPeriodFromStart(input.period.kind, input.period.start);
    if (canonicalPeriod.end !== input.period.end || canonicalPeriod.label !== input.period.label) {
      problems.push({
        code: "invalid_reporting_period",
        message: "The Scorecard reporting period does not match its exact calendar period.",
      });
    }
    const expectedPrior = previousEquivalentPeriod(canonicalPeriod);
    if (
      input.priorPeriod.kind !== expectedPrior.kind ||
      input.priorPeriod.start !== expectedPrior.start ||
      input.priorPeriod.end !== expectedPrior.end ||
      input.priorPeriod.label !== expectedPrior.label
    ) {
      problems.push({
        code: "invalid_comparison_period",
        message: `The ${input.period.kind} Scorecard must compare against ${expectedPrior.label}.`,
      });
    }
  } catch (error) {
    problems.push({
      code: "invalid_reporting_period",
      message: error instanceof Error ? error.message : "The Scorecard reporting period is invalid.",
    });
  }
  const peopleIds = new Set(input.people.map((person) => person.id));
  const publishedReports = input.gatewayReports.filter(
    (report) => report.status === "published" && report.periodType === "wtd",
  );
  const publishedByIdentity = new Map<string, GatewayReport[]>();
  for (const report of publishedReports) {
    const identity = gatewayReportIdentity(report);
    publishedByIdentity.set(identity, [...(publishedByIdentity.get(identity) ?? []), report]);
  }

  const scopedExpectedIdentities = input.expectedGatewayWeeks
    ? new Set(input.expectedGatewayWeeks.map((week) => expectedGatewayIdentity(week.periodStart, week.weekOrdinal)))
    : null;
  if (scopedExpectedIdentities) {
    for (const identity of scopedExpectedIdentities) {
      if (!publishedByIdentity.has(identity)) {
        problems.push({
          code: "missing_gateway_report",
          message: `The published Gateway report for canonical week ${identity} is missing.`,
        });
      }
    }
  } else {
    for (const reportDate of input.expectedReportDates) {
      if (!publishedReports.some((report) => report.reportDate === reportDate)) {
        problems.push({
          code: "missing_gateway_report",
          reportDate,
          message: `The published Gateway report for ${reportDate} is missing.`,
        });
      }
    }
  }

  const canonicalPublishedReports = [...publishedByIdentity.values()]
    .map((reports) => reports[0]!)
    .sort((left, right) => gatewayReportSortKey(right).localeCompare(gatewayReportSortKey(left)));
  const activeWriterReports = eligibleBuilderIds.size > 0
    ? canonicalPublishedReports
        .filter((report) => gatewayReportAtOrBefore(report, input.period.end))
        .slice(0, 6)
    : [];
  if (eligibleBuilderIds.size > 0 && activeWriterReports.length < 6) {
    problems.push({
      code: "incomplete_active_writer_window",
      count: activeWriterReports.length,
      message: `Active Writers requires six published organization WTD Gateway weeks; found ${activeWriterReports.length}.`,
    });
  }
  const relevantIdentities = new Set([
    ...activeWriterReports.map(gatewayReportIdentity),
    ...(scopedExpectedIdentities
      ? publishedReports
          .filter((report) => gatewayReportInPeriod(report, input.period))
          .map(gatewayReportIdentity)
      : publishedReports
          .filter((report) => input.expectedReportDates.includes(report.reportDate))
          .map(gatewayReportIdentity)),
    ...(scopedExpectedIdentities ?? []),
  ]);
  for (const [identity, reports] of publishedByIdentity) {
    if (relevantIdentities.has(identity) && reports.length > 1) {
      const reportDate = reports[0]!.reportDate;
      problems.push({
        code: "duplicate_gateway_report",
        reportDate,
        count: reports.length,
        message: `${reports.length} published Gateway reports exist for canonical identity ${identity}.`,
      });
    }
  }

  for (const report of input.gatewayReports) {
    if (
      report.status !== "published" || report.periodType !== "wtd" ||
      !relevantIdentities.has(gatewayReportIdentity(report))
    ) continue;
    if (!report.sourceChecksum.trim()) {
      problems.push({
        code: "invalid_source_checksum",
        reportDate: report.reportDate,
        message: `Gateway report ${report.id} has no source checksum.`,
      });
    }
    if (report.unmatchedCount > 0) {
      problems.push({
        code: "unmatched_gateway_people",
        reportDate: report.reportDate,
        count: report.unmatchedCount,
        message: `${report.unmatchedCount} Gateway rows are not matched to a person.`,
      });
    }
    if (report.ambiguousCount > 0) {
      problems.push({
        code: "ambiguous_gateway_people",
        reportDate: report.reportDate,
        count: report.ambiguousCount,
        message: `${report.ambiguousCount} Gateway rows have ambiguous person matches.`,
      });
    }
    const rowCounts = new Map<string, number>();
    for (const row of report.rows) {
      rowCounts.set(row.personId, (rowCounts.get(row.personId) ?? 0) + 1);
      if (!peopleIds.has(row.personId)) {
        problems.push({
          code: "impossible_gateway_identity",
          reportDate: report.reportDate,
          personId: row.personId,
          message: `Gateway row references unknown person ${row.personId}.`,
        });
      }
      const validateBuilderFields = eligibleBuilderIds.has(row.personId);
      if (
        !Number.isFinite(row.personalIpCents) || !Number.isInteger(row.personalIpCents) || row.personalIpCents < 0 ||
        (validateBuilderFields && (
          !Number.isFinite(row.teamIpCents) || !Number.isInteger(row.teamIpCents) || row.teamIpCents < 0 ||
          (row.firstLegPercent != null && (!Number.isFinite(row.firstLegPercent) || row.firstLegPercent < 0 || row.firstLegPercent > 100))
        ))
      ) {
        problems.push({
          code: "invalid_gateway_value",
          reportDate: report.reportDate,
          personId: row.personId,
          message: `Gateway row for ${row.personId} contains an invalid numeric value.`,
        });
      }
      if (validateBuilderFields && row.teamIpCents > 0 && row.firstLegPercent == null) {
        problems.push({
          code: "missing_first_leg_percent",
          reportDate: report.reportDate,
          personId: row.personId,
          message: `Gateway First Leg percentage is missing for positive Team IP on ${report.reportDate}.`,
        });
      }
    }
    for (const [personId, count] of rowCounts) {
      if (count > 1) {
        problems.push({
          code: "duplicate_gateway_person_row",
          reportDate: report.reportDate,
          personId,
          count,
          message: `${count} Gateway rows exist for ${personId} on ${report.reportDate}.`,
        });
      }
    }
  }

  const peopleById = new Map(input.people.map((person) => [person.id, person]));
  for (const person of input.people) {
    if (eligibleBuilderIds.has(person.id) && !person.producerAtPeriodEnd) {
      problems.push({
        code: "builder_without_producer_role",
        personId: person.id,
        message: `Builder ${person.id} must also be frozen as a Producer.`,
      });
    }
    const ancestors = new Set<string>();
    let current: ScorecardRunPerson | undefined = person;
    while (current?.uplineId) {
      if (ancestors.has(current.uplineId) || current.uplineId === person.id) {
        problems.push({
          code: "hierarchy_cycle",
          personId: person.id,
          message: `The frozen hierarchy contains a cycle involving ${person.id}.`,
        });
        break;
      }
      ancestors.add(current.uplineId);
      current = peopleById.get(current.uplineId);
    }
  }

  for (const person of input.people.filter((candidate) => eligibleBuilderIds.has(candidate.id))) {
    const coverage = input.priorBuilderCoverage[person.id];
    const prior = input.priorBuilderTeamIpCents[person.id] ?? null;
    if (coverage === "incomplete") {
      problems.push({
        code: "incomplete_comparison_period",
        personId: person.id,
        message: `The retained comparison period is incomplete for Builder ${person.id}.`,
      });
    } else if (coverage !== "complete" && coverage !== "outside_retention") {
      problems.push({
        code: "unverified_comparison_baseline",
        personId: person.id,
        message: `Comparison coverage is not established for Builder ${person.id}.`,
      });
    } else if (coverage === "complete" && prior == null) {
      problems.push({
        code: "unverified_comparison_baseline",
        personId: person.id,
        message: `A retained comparison period has no Team IP total for Builder ${person.id}.`,
      });
    } else if (coverage === "outside_retention" && prior != null) {
      problems.push({
        code: "unverified_comparison_baseline",
        personId: person.id,
        message: `Builder ${person.id} cannot have a comparison total outside retained history.`,
      });
    }
  }

  for (const personId of eligibleProducerIds) {
    const producerRows = input.producerMetrics.filter((metric) => metric.personId === personId);
    const count = producerRows.length;
    if (count === 0) {
      problems.push({
        code: "missing_producer_metric",
        personId,
        message: `Producer ${personId} has no validated metric row.`,
      });
    } else if (count > 1) {
      problems.push({
        code: "duplicate_producer_metric",
        personId,
        count,
        message: `Producer ${personId} has ${count} metric rows.`,
      });
    }

    const verificationRows = input.producerVerificationMetrics.filter((metric) => metric.personId === personId);
    const previewRows = [...producerRows, ...verificationRows].map((metric) => metric.payload.preview);
    if (previewRows.some((preview) =>
      !preview ||
      preview.periodKind !== input.period.kind ||
      preview.periodStart !== input.period.start ||
      preview.periodEnd !== input.period.end ||
      preview.periodLabel !== input.period.label
    )) {
      problems.push({
        code: "invalid_producer_period",
        personId,
        message: `Producer ${personId} metrics do not match the frozen ${input.period.label} reporting period.`,
      });
    }
  }
  for (const metric of input.producerMetrics) {
    if (!eligibleProducerIds.has(metric.personId)) {
      problems.push({
        code: "extra_producer_metric",
        personId: metric.personId,
        message: `Producer metric ${metric.personId} is outside the frozen eligible population.`,
      });
    }
  }

  const knownWriters = new Set<string>();
  const unresolvedWriters = new Set<string>();
  for (const report of input.gatewayReports) {
    if (report.status !== "published" || report.periodType !== "wtd") continue;
    const membership = gatewayActiveDirectWindow(report, input.period.end);
    for (const row of report.rows) {
      if (row.personalIpCents <= 0) continue;
      if (membership === true) knownWriters.add(row.personId);
      if (membership === null) unresolvedWriters.add(row.personId);
    }
  }
  for (const person of input.people) {
    if (person.activeAtPeriodEnd && person.uplineId && eligibleBuilderIds.has(person.uplineId) &&
        person.id !== person.uplineId && unresolvedWriters.has(person.id) && !knownWriters.has(person.id)) {
      problems.push({ code: "unresolved_active_direct_week", personId: person.id,
        message: `Active Direct ${person.id} needs a provider-sourced week date to resolve the six-week boundary.` });
    }
  }

  return problems;
}

export function prepareScorecardRun(input: ScorecardRunInput): PreparedScorecardRun {
  const explicitEligibility = input.eligibleTargets
    ? new Set(input.eligibleTargets.map((target) => `${target.cardType}:${target.personId}`))
    : null;
  const eligibleProducers = input.people.filter(
    (person) => person.activeAtPeriodEnd && person.producerAtPeriodEnd
      && (!input.target || (input.target.cardType === "producer" && input.target.personId === person.id))
      && (!explicitEligibility || explicitEligibility.has(`producer:${person.id}`)),
  );
  const eligibleBuilders = input.people.filter(
    (person) => person.activeAtPeriodEnd && person.builderAtPeriodEnd
      && (!input.target || (input.target.cardType === "builder" && input.target.personId === person.id))
      && (!explicitEligibility || explicitEligibility.has(`builder:${person.id}`)),
  );
  const eligibleProducerIds = new Set(eligibleProducers.map(({ id }) => id));
  const eligibleBuilderIds = new Set(eligibleBuilders.map(({ id }) => id));
  const targetPerson = input.target
    ? input.people.find((person) => person.id === input.target!.personId)
    : null;
  const targetApplicable = !input.target || Boolean(
    targetPerson?.activeAtPeriodEnd && (
      input.target.cardType === "producer"
        ? targetPerson.producerAtPeriodEnd
        : targetPerson.builderAtPeriodEnd
    ),
  );
  const targetProblems: ScorecardRunProblem[] = input.target && !targetApplicable
    ? [{
        code: "invalid_target",
        personId: input.target.personId,
        message: `The requested ${input.target.cardType} Scorecard is not applicable to ${input.target.personId} at period end.`,
      }]
    : [];
  const rankPopulation = input.target?.cardType === "builder" ? input.builderRankPopulation : undefined;
  const rankContextProblems: ScorecardRunProblem[] = [];
  if (rankPopulation) {
    const seen = new Set<string>();
    for (const entry of rankPopulation) {
      const invalid = !entry.personId || seen.has(entry.personId) ||
        !Number.isFinite(entry.teamIpCents) || entry.teamIpCents < 0 ||
        !Number.isInteger(entry.recruitsAdded) || entry.recruitsAdded < 0;
      if (invalid) {
        rankContextProblems.push({
          code: "invalid_builder_rank_context",
          personId: entry.personId || input.target?.personId,
          message: "Builder rank context must contain unique people with non-negative canonical Team IP and recruiting values.",
        });
      }
      seen.add(entry.personId);
    }
    if (!input.target || !seen.has(input.target.personId)) {
      rankContextProblems.push({
        code: "invalid_builder_rank_context",
        personId: input.target?.personId,
        message: "Builder rank context must include the targeted Builder.",
      });
    }
  }
  const problems = [...targetProblems, ...rankContextProblems, ...validateSources(input, eligibleProducerIds, eligibleBuilderIds)];

  if (problems.length > 0) {
    return {
      status: "blocked",
      producerMetrics: [],
      builderMetrics: [],
      problems,
      summary: {
        eligibleProducers: eligibleProducers.length,
        eligibleBuilders: eligibleBuilders.length,
        producerRows: 0,
        builderRows: 0,
        passed: 0,
        failed: problems.length,
        held: eligibleProducers.length + eligibleBuilders.length,
      },
    };
  }

  const peopleById = new Map(input.people.map((person) => [person.id, person]));
  const producerMetrics = input.producerMetrics.map((metric) =>
    sanitizeProducerMetricPhoto(metric, peopleById),
  );

  const periodReports = input.gatewayReports.filter(
    (report) =>
      report.status === "published" && report.periodType === "wtd" &&
      gatewayReportInPeriod(report, input.period),
  ).sort((left, right) => gatewayReportSortKey(left).localeCompare(gatewayReportSortKey(right)));
  const activeWriterReports = input.gatewayReports
    .filter((report) => report.status === "published" && report.periodType === "wtd" && gatewayReportAtOrBefore(report, input.period.end))
    .sort((a, b) => gatewayReportSortKey(b).localeCompare(gatewayReportSortKey(a)))
    .slice(0, 6);
  const periodRowsByBuilder = new Map(
    eligibleBuilders.map((builder) => [
      builder.id,
      periodReports.flatMap((report) =>
        report.rows
          .filter((row) => row.personId === builder.id)
          .map((row) => ({ ...row, reportId: report.id, sourceChecksum: report.sourceChecksum })),
      ),
    ]),
  );
  const teamRanks = competitionRanks(
    rankPopulation
      ? rankPopulation
          .filter((entry) => entry.representedInGateway)
          .map((entry) => ({ personId: entry.personId, value: entry.teamIpCents }))
      : eligibleBuilders.flatMap((builder) => {
          const rows = periodRowsByBuilder.get(builder.id) ?? [];
          return rows.length > 0
            ? [{ personId: builder.id, value: rows.reduce((sum, row) => sum + row.teamIpCents, 0) }]
            : [];
        }),
  );
  const licensedRecruitIds = licensedRecruitPersonIds(
    input.recruits.map((recruit) => ({
      personId: recruit.personId,
      npn: recruit.npn,
      npnStatus: recruit.npnStatus,
      npnVerifiedAt: recruit.npnVerifiedAt,
    })),
    input.period,
  );
  const recruitCounts = eligibleBuilders.map((builder) => {
    const team = descendantIds(builder.id, input.people);
    team.delete(builder.id);
    return {
      personId: builder.id,
      value: [...licensedRecruitIds].filter((personId) => team.has(personId)).length,
    };
  });
  const recruitingRanks = competitionRanks(
    rankPopulation
      ? rankPopulation.map((entry) => ({ personId: entry.personId, value: entry.recruitsAdded }))
      : recruitCounts,
  );
  const months = periodFactor(input.period.kind);
  const activePersonIds = input.people.filter((person) => person.activeAtPeriodEnd).map((person) => person.id);
  const agencyWriterIds = new Set(
    activeWriterReports.flatMap((report) =>
      report.rows
        .filter((row) => row.personalIpCents > 0)
        .map((row) => row.personId),
    ),
  );
  const activeDirectWriterIds = new Set(
    input.gatewayReports
      .filter((report) =>
        report.status === "published" &&
        report.periodType === "wtd" &&
        gatewayActiveDirectWindow(report, input.period.end) === true,
      )
      .flatMap((report) => report.rows
        .filter((row) => row.personalIpCents > 0)
        .map((row) => row.personId)),
  );
  const performancePeople = input.people.map((person) => ({ id: person.id, uplineId: person.uplineId }));
  const producerProduction = input.builderProductionSupport?.map(({ personId, current }) => ({
    personId,
    ...current,
  })) ?? producerMetrics.map(({ personId, payload }) => {
    const totals = payload.overview.activity.totals;
    return {
      personId,
      dials: totals?.dials ?? 0,
      contacts: totals?.contacts ?? 0,
      presentations: totals?.presentations ?? 0,
      sales: totals?.sales ?? 0,
      apCents: payload.overview.submittedApCents ?? 0,
    };
  });
  const priorProducerProduction = input.builderProductionSupport?.map(({ personId, prior }) => ({
    personId,
    ...prior,
  })) ?? producerMetrics.map(({ personId, payload }) => {
    const totals = payload.overview.priorActivityTotals;
    return {
      personId,
      dials: totals?.dials ?? 0,
      contacts: totals?.contacts ?? 0,
      presentations: totals?.presentations ?? 0,
      sales: totals?.sales ?? 0,
      apCents: payload.overview.priorSubmittedApCents ?? 0,
    };
  });
  const performanceGatewayRows = eligibleBuilders.map((builder) => {
    const rows = periodRowsByBuilder.get(builder.id) ?? [];
    const teamIpCents = rows.reduce((sum, row) => sum + row.teamIpCents, 0);
    const weightedFirstLegTotal = rows.reduce(
      (sum, row) => sum + row.teamIpCents * (row.firstLegPercent ?? 0),
      0,
    );
    return {
      builderId: builder.id,
      teamIpCents,
      firstLegPercent: teamIpCents > 0 ? weightedFirstLegTotal / teamIpCents : null,
    };
  });
  const builderPerformance = createBuilderAgencyPerformance({
    people: performancePeople,
    eligibleBuilderIds: eligibleBuilders.map((builder) => builder.id),
    gatewayRows: performanceGatewayRows,
    activeWriterIds: [...agencyWriterIds],
    activeDirectWriterIds: [...activeDirectWriterIds],
    activePersonIds,
    personProduction: producerProduction,
    licensedRecruitPersonIds: [...licensedRecruitIds],
  });
  const priorLicensedRecruitIds = licensedRecruitPersonIds(
    input.recruits.map((recruit) => ({
      personId: recruit.personId,
      npn: recruit.npn,
      npnStatus: recruit.npnStatus,
      npnVerifiedAt: recruit.npnVerifiedAt,
    })),
    input.priorPeriod,
  );
  const priorBuilderValues = createBuilderAgencyValues({
    people: performancePeople,
    eligibleBuilderIds: eligibleBuilders.map((builder) => builder.id),
    gatewayRows: eligibleBuilders.map((builder) => ({
      builderId: builder.id,
      teamIpCents: input.priorBuilderTeamIpCents[builder.id] ?? 0,
      firstLegPercent: null,
    })),
    activeWriterIds: [],
    activeDirectWriterIds: [],
    activePersonIds: [],
    personProduction: priorProducerProduction,
    licensedRecruitPersonIds: [...priorLicensedRecruitIds],
  });

  const builderMetrics = eligibleBuilders.map<BuilderPeriodMetric>((builder) => {
    const team = descendantIds(builder.id, input.people);
    const periodRows = periodRowsByBuilder.get(builder.id) ?? [];
    const teamIpCents = periodRows.reduce((sum, row) => sum + row.teamIpCents, 0);
    const agencyActiveWriters = [...team].filter((personId) => agencyWriterIds.has(personId)).length;
    const activeWriters = countActiveDirects({
      builderId: builder.id,
      people: input.people,
      activePersonIds,
      recentWriterIds: activeDirectWriterIds,
    });
    const weightedFirstLegTotal = periodRows.reduce(
      (sum, row) => sum + row.teamIpCents * (row.firstLegPercent ?? 0),
      0,
    );
    const priorTeamIpCents = input.priorBuilderTeamIpCents[builder.id] ?? null;
    const recruitsAdded = recruitCounts.find(({ personId }) => personId === builder.id)?.value ?? 0;
    const rawTrend = input.period.kind === "monthly"
      ? periodRows.map((row, index) => ({
          reportDate: periodReports.find((report) => report.id === row.reportId)!.reportDate,
          label: `Week ${index + 1}`,
          teamIpCents: row.teamIpCents,
        }))
      : [...periodRows.reduce((monthsByDate, row) => {
          const report = periodReports.find((candidate) => candidate.id === row.reportId)!;
          const month = gatewayReportMonth(report);
          const current = monthsByDate.get(month) ?? 0;
          monthsByDate.set(month, current + row.teamIpCents);
          return monthsByDate;
        }, new Map<string, number>())].map(([month, value]) => ({
          reportDate: `${month}-01`,
          label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
            .format(new Date(`${month}-01T00:00:00Z`)),
          teamIpCents: value,
        }));
    const trendMaximum = Math.max(...rawTrend.map(({ teamIpCents: value }) => value), 0);
    const averageMonthlyIpPerWriterCents =
      agencyActiveWriters > 0 ? Math.round(teamIpCents / months / agencyActiveWriters) : null;
    const performance = builderPerformance.get(builder.id);
    const previousPerformance = priorBuilderValues.get(builder.id);
    if (!performance || !previousPerformance) {
      throw new Error(`Unable to freeze Builder performance for ${builder.id}.`);
    }
    const frozenPerformance: BuilderAgencyPerformance = {
      ...performance,
      averageIpPerWriter: {
        ...performance.averageIpPerWriter,
        value: averageMonthlyIpPerWriterCents,
      },
    };
    const frozenPreviousPerformance: BuilderAgencyValues = {
      ...previousPerformance,
      activeWriters: null,
      teamIp: input.priorBuilderTeamIpCents[builder.id] ?? null,
      firstLegPercent: null,
      averageIpPerWriter: null,
    };

    return {
      runId: input.runId,
      revision: input.revision,
      personId: builder.id,
      teamIpCents,
      teamRank: teamRanks.get(builder.id) ?? null,
      teamRankUnavailableReason: teamRanks.has(builder.id) ? null : "not_represented_in_gateway",
      activeWriters,
      firstLegPercent: teamIpCents > 0 ? weightedFirstLegTotal / teamIpCents : null,
      averageMonthlyIpPerWriterCents,
      monthCount: months,
      growth: {
        comparison: comparisonForPeriod(input.period.kind),
        priorTeamIpCents,
        currentTeamIpCents: teamIpCents,
        percentage: growthPercentage(teamIpCents, priorTeamIpCents),
      },
      recruitsAdded,
      recruitingRank: recruitingRanks.get(builder.id)!,
      trend: rawTrend.map((bucket) => ({
        ...bucket,
        share: trendMaximum > 0 ? Math.round((bucket.teamIpCents / trendMaximum) * 100) : 0,
      })),
      performance: frozenPerformance,
      previousPerformance: frozenPreviousPerformance,
      sourceReportIds: periodRows.map(({ reportId }) => reportId),
      sourceChecksums: periodRows.map(({ sourceChecksum }) => sourceChecksum),
    };
  });

  const ready: PreparedScorecardRun = {
    status: "ready",
    producerMetrics,
    builderMetrics,
    problems: [],
    summary: {
      eligibleProducers: eligibleProducers.length,
      eligibleBuilders: eligibleBuilders.length,
      producerRows: producerMetrics.length,
      builderRows: builderMetrics.length,
      passed: producerMetrics.length + builderMetrics.length,
      failed: 0,
      held: 0,
    },
  };
  const verification = verifyPreparedScorecardRun(input, ready);
  if (!verification.valid) {
    return {
      ...ready,
      status: "blocked",
      producerMetrics: [],
      builderMetrics: [],
      problems: verification.problems.map((problem) => ({
        code: "independent_verification_failed",
        personId: problem.personId,
        message: `${problem.cardType} ${problem.field} did not match independent verification (expected ${JSON.stringify(problem.expected)}, received ${JSON.stringify(problem.actual)}).`,
      })),
      summary: {
        ...ready.summary,
        producerRows: 0,
        builderRows: 0,
        passed: 0,
        failed: verification.problems.length,
        held: ready.summary.eligibleProducers + ready.summary.eligibleBuilders,
      },
    };
  }
  return ready;
}

export type ScorecardArtifact = {
  id: string;
  runId: string;
  revision: number;
  personId: string;
  cardType: "producer" | "builder";
  lifecycleStatus: "final" | "corrected";
  period: ScorecardRunInput["period"];
  title: string;
  visiblePayload: Record<string, unknown>;
  priorSnapshotId: string | null;
};

export type ScorecardDeliveryIntent = {
  snapshotId: string;
  personId: string;
  deliveryType: "producer_email" | "builder_email";
  recipientEmail: string | null;
  status: "pending" | "missing_recipient";
  idempotencyKey: string;
};

function canonicalCorrectionMetric(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalCorrectionMetric).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([key]) => key !== "generatedAt")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalCorrectionMetric(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createScorecardArtifacts({
  prepared,
  input,
  priorSnapshots = [],
}: {
  prepared: PreparedScorecardRun;
  input: ScorecardRunInput;
  priorSnapshots?: ScorecardArtifact[];
}): { snapshots: ScorecardArtifact[]; deliveries: ScorecardDeliveryIntent[] } {
  if (prepared.status !== "ready") {
    throw new Error("Artifacts require a fully validated Scorecard run.");
  }

  const peopleById = new Map(input.people.map((person) => [person.id, person]));
  const candidates: Array<{
    personId: string;
    cardType: "producer" | "builder";
    metricPayload: Record<string, unknown>;
    visiblePayload: Record<string, unknown>;
  }> = [
    ...prepared.producerMetrics.map((metric) => {
      const person = peopleById.get(metric.personId);
      if (!person) throw new Error(`Producer ${metric.personId} is missing from the frozen run population.`);
      const member = scorecardMember(person);
      return {
        personId: metric.personId,
        cardType: "producer" as const,
        metricPayload: metric.payload as unknown as Record<string, unknown>,
        visiblePayload: createPublishedProducerSnapshotPayload({
          metricPayload: metric.payload,
          member,
          period: input.period,
        }) as unknown as Record<string, unknown>,
      };
    }),
    ...prepared.builderMetrics.map((metric) => {
      const person = peopleById.get(metric.personId);
      if (!person) throw new Error(`Builder ${metric.personId} is missing from the frozen run population.`);
      const member = scorecardMember(person);
      return {
        personId: metric.personId,
        cardType: "builder" as const,
        metricPayload: builderPublishedMetric(metric) as unknown as Record<string, unknown>,
        visiblePayload: createPublishedBuilderSnapshotPayload({
          metric,
          member,
          period: input.period,
        }) as unknown as Record<string, unknown>,
      };
    }),
  ];

  const snapshots = candidates.flatMap<ScorecardArtifact>((candidate) => {
    const prior = priorSnapshots.find(
      (snapshot) => snapshot.personId === candidate.personId && snapshot.cardType === candidate.cardType,
    );
    if (input.revision > 1 && !prior) {
      throw new Error(`Correction requires the prior ${candidate.cardType} artifact for ${candidate.personId}.`);
    }
    if (
      prior && input.revision > 1 &&
      (prior.period.kind !== input.period.kind || prior.period.start !== input.period.start || prior.period.end !== input.period.end)
    ) {
      throw new Error(`Correction lineage does not match the reporting period for ${candidate.personId}.`);
    }
    if (input.revision > 1 && prior) {
      const priorPublished = parsePublishedScorecardSnapshotPayload(prior.visiblePayload);
      const priorMetricPayload = priorPublished
        ? priorPublished.metricPayload as unknown as Record<string, unknown>
        : prior.visiblePayload;
      if (canonicalCorrectionMetric(priorMetricPayload) === canonicalCorrectionMetric(candidate.metricPayload)) return [];
    }

    const id = `${input.runId}:${candidate.cardType}:${candidate.personId}`;
    return [{
      id,
      runId: input.runId,
      revision: input.revision,
      personId: candidate.personId,
      cardType: candidate.cardType,
      lifecycleStatus: input.revision === 1 ? "final" : "corrected",
      period: input.period,
      title: `${input.period.label}${input.period.kind === "annual" ? " Annual" : ""} ${candidate.cardType === "producer" ? "Producer" : "Builder"} Scorecard`,
      visiblePayload: candidate.visiblePayload,
      priorSnapshotId: prior?.id ?? null,
    }];
  });

  const artifactVerification = verifyPublishedScorecardArtifacts(input, prepared, snapshots);
  if (!artifactVerification.valid) {
    const first = artifactVerification.problems[0];
    throw new Error(
      `Published Scorecard artifact failed independent verification for ${first.cardType} ${first.personId} (${first.field}).`,
    );
  }

  const deliveries = snapshots.map<ScorecardDeliveryIntent>((snapshot) => {
    const recipientEmail = peopleById.get(snapshot.personId)?.email.trim() || null;
    const deliveryType = snapshot.cardType === "producer" ? "producer_email" : "builder_email";
    return {
      snapshotId: snapshot.id,
      personId: snapshot.personId,
      deliveryType,
      recipientEmail,
      status: recipientEmail ? "pending" : "missing_recipient",
      idempotencyKey: `${snapshot.id}:${deliveryType}`,
    };
  });

  return { snapshots, deliveries };
}
