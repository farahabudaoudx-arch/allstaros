import type {
  BuilderPeriodMetric,
  PreparedScorecardRun,
  ScorecardRunInput,
} from "./run";

export type IndependentVerificationProblem = {
  cardType: "producer" | "builder";
  personId: string;
  field: string;
  expected: unknown;
  actual: unknown;
};

function descendantsOf(rootId: string, input: ScorecardRunInput) {
  const result = new Set([rootId]);
  const pending = [rootId];
  while (pending.length > 0) {
    const parentId = pending.shift()!;
    for (const person of input.people) {
      if (person.uplineId === parentId && !result.has(person.id)) {
        result.add(person.id);
        pending.push(person.id);
      }
    }
  }
  return result;
}

function localDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const valueOf = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value;
  return `${valueOf("year")}-${valueOf("month")}-${valueOf("day")}`;
}

function expectedGrowth(current: number, prior: number | null) {
  if (prior == null) return null;
  if (prior === 0) return current > 0 ? 100 : 0;
  if (current === 0) return -100;
  return Math.round(((current - prior) / prior) * 1_000) / 10;
}

function equals(left: unknown, right: unknown) {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
          .map(([key, entry]) => [key, normalize(entry)]),
      );
    }
    return value;
  };
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function trendFor(
  input: ScorecardRunInput,
  rows: Array<{ reportDate: string; teamIpCents: number }>,
): BuilderPeriodMetric["trend"] {
  const buckets = input.period.kind === "monthly"
    ? rows.map((row, index) => ({ reportDate: row.reportDate, teamIpCents: row.teamIpCents, label: `Week ${index + 1}` }))
    : [...rows.reduce((grouped, row) => {
        const month = row.reportDate.slice(0, 7);
        grouped.set(month, (grouped.get(month) ?? 0) + row.teamIpCents);
        return grouped;
      }, new Map<string, number>())].map(([month, teamIpCents]) => ({
        reportDate: `${month}-01`,
        label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
          .format(new Date(`${month}-01T00:00:00Z`)),
        teamIpCents,
      }));
  const maximum = buckets.reduce((highest, bucket) => Math.max(highest, bucket.teamIpCents), 0);
  return buckets.map((bucket) => ({
    ...bucket,
    share: maximum === 0 ? 0 : Math.round((bucket.teamIpCents / maximum) * 100),
  }));
}

export function verifyPreparedScorecardRun(
  input: ScorecardRunInput,
  prepared: PreparedScorecardRun,
): { valid: boolean; problems: IndependentVerificationProblem[] } {
  const problems: IndependentVerificationProblem[] = [];
  const builders = input.people.filter((person) => person.activeAtPeriodEnd && person.builderAtPeriodEnd);
  const periodReports = input.gatewayReports.filter((report) =>
    report.status === "published" && report.periodType === "wtd" &&
    report.reportDate >= input.period.start &&
    report.reportDate <= input.period.end,
  );
  const sixReportWindow = [...input.gatewayReports]
    .filter((report) => report.status === "published" && report.periodType === "wtd" && report.reportDate <= input.period.end)
    .sort((left, right) => right.reportDate.localeCompare(left.reportDate))
    .slice(0, 6);
  const totals = new Map<string, number>();
  const represented = new Set<string>();
  for (const builder of builders) {
    let total = 0;
    for (const report of periodReports) {
      const rows = report.rows.filter((row) => row.personId === builder.id);
      if (rows.length > 0) represented.add(builder.id);
      for (const row of rows) total += row.teamIpCents;
    }
    totals.set(builder.id, total);
  }
  const recruitTotals = new Map<string, number>();
  for (const builder of builders) {
    const team = descendantsOf(builder.id, input);
    team.delete(builder.id);
    let count = 0;
    for (const recruit of input.recruits) {
      const date = localDate(recruit.createdAt);
      if (team.has(recruit.personId) && date >= input.period.start && date <= input.period.end) count += 1;
    }
    recruitTotals.set(builder.id, count);
  }

  for (const builder of builders) {
    const actual = prepared.builderMetrics.find((metric) => metric.personId === builder.id);
    if (!actual) {
      problems.push({ cardType: "builder", personId: builder.id, field: "row", expected: "one row", actual: null });
      continue;
    }
    const team = descendantsOf(builder.id, input);
    const reportRows = periodReports.flatMap((report) => report.rows
      .filter((row) => row.personId === builder.id)
      .map((row) => ({ reportDate: report.reportDate, ...row })));
    const total = totals.get(builder.id)!;
    const positiveWriterIds = new Set<string>();
    for (const report of sixReportWindow) {
      for (const row of report.rows) {
        if (team.has(row.personId) && row.personalIpCents > 0) positiveWriterIds.add(row.personId);
      }
    }
    let weighted = 0;
    for (const row of reportRows) weighted += row.teamIpCents * (row.firstLegPercent ?? 0);
    const activeWriters = positiveWriterIds.size;
    const monthCount: 1 | 3 | 12 = input.period.kind === "annual" ? 12 : input.period.kind === "quarterly" ? 3 : 1;
    const prior = input.priorBuilderTeamIpCents[builder.id] ?? null;
    const expected = {
      teamIpCents: total,
      teamRank: represented.has(builder.id)
        ? { rank: 1 + [...totals].filter(([id, value]) => represented.has(id) && value > total).length, population: represented.size }
        : null,
      teamRankUnavailableReason: represented.has(builder.id) ? null : "not_represented_in_gateway",
      activeWriters,
      firstLegPercent: total === 0 ? null : weighted / total,
      averageMonthlyIpPerWriterCents: activeWriters === 0 ? null : Math.round(total / monthCount / activeWriters),
      monthCount,
      growth: {
        comparison: input.period.kind === "annual" ? "yoy" : input.period.kind === "quarterly" ? "qoq" : "mom",
        priorTeamIpCents: prior,
        currentTeamIpCents: total,
        percentage: expectedGrowth(total, prior),
      },
      recruitsAdded: recruitTotals.get(builder.id)!,
      recruitingRank: {
        rank: 1 + [...recruitTotals.values()].filter((value) => value > recruitTotals.get(builder.id)!).length,
        population: builders.length,
      },
      trend: trendFor(input, reportRows),
    };

    for (const [field, expectedValue] of Object.entries(expected)) {
      const actualValue = actual[field as keyof BuilderPeriodMetric];
      if (!equals(expectedValue, actualValue)) {
        problems.push({ cardType: "builder", personId: builder.id, field, expected: expectedValue, actual: actualValue });
      }
    }
  }

  const eligibleProducerIds = new Set(input.people
    .filter((person) => person.activeAtPeriodEnd && person.producerAtPeriodEnd)
    .map((person) => person.id));
  for (const personId of eligibleProducerIds) {
    const actualRows = prepared.producerMetrics.filter((metric) => metric.personId === personId);
    const expectedRows = input.producerVerificationMetrics.filter((metric) => metric.personId === personId);
    if (actualRows.length !== 1 || expectedRows.length !== 1) {
      problems.push({ cardType: "producer", personId, field: "row", expected: expectedRows.length, actual: actualRows.length });
    } else if (!equals(expectedRows[0].payload, actualRows[0].payload)) {
      problems.push({ cardType: "producer", personId, field: "visiblePayload", expected: expectedRows[0].payload, actual: actualRows[0].payload });
    }
  }

  return { valid: problems.length === 0, problems };
}
