import { verifyPreparedScorecardRun } from "./verifier";
import type { MonthlyProducerPreview, ProducerOverview } from "./lifecycle";

export type ScorecardPeriodKind = "monthly" | "quarterly" | "annual";

export type ScorecardRunPerson = {
  id: string;
  fullName: string;
  email: string;
  photoUrl: string | null;
  uplineId: string | null;
  activeAtPeriodEnd: boolean;
  producerAtPeriodEnd: boolean;
  builderAtPeriodEnd: boolean;
};

export type GatewayReport = {
  id: string;
  periodType: "wtd" | "mtd" | "ytd";
  reportDate: string;
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

export type ScorecardRunInput = {
  runId: string;
  revision: number;
  period: {
    kind: ScorecardPeriodKind;
    start: string;
    end: string;
    label: string;
  };
  generatedAt: string;
  expectedReportDates: string[];
  people: ScorecardRunPerson[];
  gatewayReports: GatewayReport[];
  recruits: Array<{
    id: string;
    personId: string;
    createdAt: string;
    removedAt: string | null;
  }>;
  priorBuilderTeamIpCents: Record<string, number | null>;
  priorBuilderCoverage: Record<string, "complete" | "outside_retention" | "incomplete">;
  producerMetrics: Array<{ personId: string; payload: ProducerPeriodMetricPayload }>;
  producerVerificationMetrics: Array<{ personId: string; payload: ProducerPeriodMetricPayload }>;
};

export type ProducerPeriodMetricPayload = {
  preview: MonthlyProducerPreview;
  overview: ProducerOverview;
};

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
    | "builder_without_producer_role"
    | "incomplete_comparison_period"
    | "unverified_comparison_baseline"
    | "independent_verification_failed"
    | "missing_producer_metric"
    | "duplicate_producer_metric"
    | "extra_producer_metric";
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

function chicagoDate(instant: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

function comparisonFor(kind: ScorecardPeriodKind) {
  if (kind === "quarterly") return "qoq" as const;
  if (kind === "annual") return "yoy" as const;
  return "mom" as const;
}

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

function validateSources(input: ScorecardRunInput, eligibleProducerIds: Set<string>) {
  const problems: ScorecardRunProblem[] = [];
  const peopleIds = new Set(input.people.map((person) => person.id));
  const publishedByDate = new Map<string, GatewayReport[]>();
  for (const report of input.gatewayReports) {
    if (report.status !== "published" || report.periodType !== "wtd") continue;
    publishedByDate.set(report.reportDate, [...(publishedByDate.get(report.reportDate) ?? []), report]);
  }

  for (const reportDate of input.expectedReportDates) {
    const reports = publishedByDate.get(reportDate) ?? [];
    if (reports.length === 0) {
      problems.push({
        code: "missing_gateway_report",
        reportDate,
        message: `The published Gateway report for ${reportDate} is missing.`,
      });
    }
  }

  const activeWriterDates = [...new Set(input.gatewayReports
    .filter((report) => report.status === "published" && report.periodType === "wtd" && report.reportDate <= input.period.end)
    .map((report) => report.reportDate))]
    .sort((left, right) => right.localeCompare(left))
    .slice(0, 6);
  if (activeWriterDates.length < 6) {
    problems.push({
      code: "incomplete_active_writer_window",
      count: activeWriterDates.length,
      message: `Active Writers requires six published organization WTD report dates; found ${activeWriterDates.length}.`,
    });
  }
  const relevantDates = new Set([...input.expectedReportDates, ...activeWriterDates]);
  for (const [reportDate, reports] of publishedByDate) {
    if (relevantDates.has(reportDate) && reports.length > 1) {
      problems.push({
        code: "duplicate_gateway_report",
        reportDate,
        count: reports.length,
        message: `${reports.length} published Gateway reports exist for ${reportDate}.`,
      });
    }
  }

  for (const report of input.gatewayReports) {
    if (report.status !== "published" || report.periodType !== "wtd" || !relevantDates.has(report.reportDate)) continue;
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
      if (
        !Number.isFinite(row.personalIpCents) || !Number.isInteger(row.personalIpCents) || row.personalIpCents < 0 ||
        !Number.isFinite(row.teamIpCents) || !Number.isInteger(row.teamIpCents) || row.teamIpCents < 0 ||
        (row.firstLegPercent != null && (!Number.isFinite(row.firstLegPercent) || row.firstLegPercent < 0 || row.firstLegPercent > 100))
      ) {
        problems.push({
          code: "invalid_gateway_value",
          reportDate: report.reportDate,
          personId: row.personId,
          message: `Gateway row for ${row.personId} contains an invalid numeric value.`,
        });
      }
      if (row.teamIpCents > 0 && row.firstLegPercent == null) {
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
    if (person.activeAtPeriodEnd && person.builderAtPeriodEnd && !person.producerAtPeriodEnd) {
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

  for (const person of input.people.filter((candidate) => candidate.activeAtPeriodEnd && candidate.builderAtPeriodEnd)) {
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
    const count = input.producerMetrics.filter((metric) => metric.personId === personId).length;
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

  return problems;
}

export function prepareScorecardRun(input: ScorecardRunInput): PreparedScorecardRun {
  const eligibleProducers = input.people.filter(
    (person) => person.activeAtPeriodEnd && person.producerAtPeriodEnd,
  );
  const eligibleBuilders = input.people.filter(
    (person) => person.activeAtPeriodEnd && person.builderAtPeriodEnd,
  );
  const problems = validateSources(input, new Set(eligibleProducers.map(({ id }) => id)));

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

  const periodReports = input.gatewayReports.filter(
    (report) =>
      report.status === "published" && report.periodType === "wtd" &&
      report.reportDate >= input.period.start &&
      report.reportDate <= input.period.end,
  );
  const activeWriterReports = input.gatewayReports
    .filter((report) => report.status === "published" && report.periodType === "wtd" && report.reportDate <= input.period.end)
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate))
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
    eligibleBuilders.flatMap((builder) => {
      const rows = periodRowsByBuilder.get(builder.id) ?? [];
      return rows.length > 0
        ? [{ personId: builder.id, value: rows.reduce((sum, row) => sum + row.teamIpCents, 0) }]
        : [];
    }),
  );
  // #014 keeps the authoritative recruitment source (`recruit`) wired into the run.
  // #016 owns the later definition of "Recruits Licensed"; until then this remains
  // the existing in-period recruit-created count and must not invent licensing-state rules.
  const recruitCounts = eligibleBuilders.map((builder) => {
    const team = descendantIds(builder.id, input.people);
    team.delete(builder.id);
    return {
      personId: builder.id,
      value: input.recruits.filter(
        (recruit) =>
          team.has(recruit.personId) &&
          chicagoDate(recruit.createdAt) >= input.period.start &&
          chicagoDate(recruit.createdAt) <= input.period.end,
      ).length,
    };
  });
  const recruitingRanks = competitionRanks(recruitCounts);
  const months: 1 | 3 | 12 = input.period.kind === "annual" ? 12 : input.period.kind === "quarterly" ? 3 : 1;

  const builderMetrics = eligibleBuilders.map<BuilderPeriodMetric>((builder) => {
    const team = descendantIds(builder.id, input.people);
    const periodRows = periodRowsByBuilder.get(builder.id) ?? [];
    const teamIpCents = periodRows.reduce((sum, row) => sum + row.teamIpCents, 0);
    // #014 keeps `person` hierarchy + Gateway personal-IP activity as the source path.
    // #015 owns narrowing this provisional full-agency writer count to direct-upline,
    // active writers only; do not pull that filtering behavior into this ticket.
    const activeWriters = new Set(
      activeWriterReports.flatMap((report) =>
        report.rows
          .filter((row) => team.has(row.personId) && row.personalIpCents > 0)
          .map((row) => row.personId),
      ),
    ).size;
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
          const reportDate = periodReports.find((report) => report.id === row.reportId)!.reportDate;
          const month = reportDate.slice(0, 7);
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

    return {
      runId: input.runId,
      revision: input.revision,
      personId: builder.id,
      teamIpCents,
      teamRank: teamRanks.get(builder.id) ?? null,
      teamRankUnavailableReason: teamRanks.has(builder.id) ? null : "not_represented_in_gateway",
      activeWriters,
      firstLegPercent: teamIpCents > 0 ? weightedFirstLegTotal / teamIpCents : null,
      averageMonthlyIpPerWriterCents:
        activeWriters > 0 ? Math.round(teamIpCents / months / activeWriters) : null,
      monthCount: months,
      growth: {
        comparison: comparisonFor(input.period.kind),
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
      sourceReportIds: periodRows.map(({ reportId }) => reportId),
      sourceChecksums: periodRows.map(({ sourceChecksum }) => sourceChecksum),
    };
  });

  const ready: PreparedScorecardRun = {
    status: "ready",
    producerMetrics: input.producerMetrics,
    builderMetrics,
    problems: [],
    summary: {
      eligibleProducers: eligibleProducers.length,
      eligibleBuilders: eligibleBuilders.length,
      producerRows: input.producerMetrics.length,
      builderRows: builderMetrics.length,
      passed: input.producerMetrics.length + builderMetrics.length,
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

function builderVisiblePayload(metric: BuilderPeriodMetric) {
  return {
    teamIpCents: metric.teamIpCents,
    teamRank: metric.teamRank,
    teamRankUnavailableReason: metric.teamRankUnavailableReason,
    activeWriters: metric.activeWriters,
    firstLegPercent: metric.firstLegPercent,
    averageMonthlyIpPerWriterCents: metric.averageMonthlyIpPerWriterCents,
    monthCount: metric.monthCount,
    growth: metric.growth,
    recruitsAdded: metric.recruitsAdded,
    recruitingRank: metric.recruitingRank,
    trend: metric.trend,
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
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
    visiblePayload: Record<string, unknown>;
  }> = [
    ...prepared.producerMetrics.map((metric) => ({
      personId: metric.personId,
      cardType: "producer" as const,
      visiblePayload: metric.payload as unknown as Record<string, unknown>,
    })),
    ...prepared.builderMetrics.map((metric) => ({
      personId: metric.personId,
      cardType: "builder" as const,
      visiblePayload: builderVisiblePayload(metric),
    })),
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
    if (input.revision > 1 && prior && canonical(prior.visiblePayload) === canonical(candidate.visiblePayload)) {
      return [];
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
