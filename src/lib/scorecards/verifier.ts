import type {
  BuilderPeriodMetric,
  PreparedScorecardRun,
  ScorecardArtifact,
  ScorecardRunInput,
} from "./run";
import { parsePublishedScorecardSnapshotPayload } from "./published-snapshot";

export type IndependentVerificationProblem = {
  cardType: "producer" | "builder";
  personId: string;
  field: string;
  expected: unknown;
  actual: unknown;
};

function eligibleCardKeys(input: ScorecardRunInput): Set<string> | null {
  return input.eligibleTargets
    ? new Set(input.eligibleTargets.map((target) => `${target.cardType}:${target.personId}`))
    : null;
}

function cardEligible(
  input: ScorecardRunInput,
  explicitEligibility: Set<string> | null,
  personId: string,
  cardType: "producer" | "builder",
): boolean {
  if (input.target && (input.target.cardType !== cardType || input.target.personId !== personId)) return false;
  return !explicitEligibility || explicitEligibility.has(`${cardType}:${personId}`);
}

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

function localDate(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? null;
  const year = valueOf("year");
  const month = valueOf("month");
  const day = valueOf("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function sixWeekStart(periodEnd: string) {
  const end = new Date(`${periodEnd}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() - 41);
  return end.toISOString().slice(0, 10);
}

function gatewayIdentity(report: ScorecardRunInput["gatewayReports"][number]): string {
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

function gatewaySortKey(report: ScorecardRunInput["gatewayReports"][number]): string {
  if (report.scorecardPeriodStart && Number.isInteger(report.gatewayWeekOrdinal)) {
    return `${report.scorecardPeriodStart}:${String(report.gatewayWeekOrdinal).padStart(2, "0")}:${report.reportDate}`;
  }
  return `${report.reportDate}:legacy`;
}

function gatewayInPeriod(
  report: ScorecardRunInput["gatewayReports"][number],
  period: ScorecardRunInput["period"],
): boolean {
  if (report.scorecardPeriodStart) {
    const periodEnd = report.scorecardPeriodEnd ?? report.scorecardPeriodStart;
    return periodEnd >= period.start && report.scorecardPeriodStart <= period.end;
  }
  return report.reportDate >= period.start && report.reportDate <= period.end;
}

function gatewayMonth(report: ScorecardRunInput["gatewayReports"][number]): string {
  return (report.scorecardPeriodStart ?? report.reportDate).slice(0, 7);
}

function gatewayAtOrBefore(report: ScorecardRunInput["gatewayReports"][number], date: string): boolean {
  return (report.scorecardPeriodStart ?? report.reportDate) <= date;
}

function activeDirectWindow(report: ScorecardRunInput["gatewayReports"][number], end: string): boolean | null {
  const start = sixWeekStart(end);
  if (!report.scorecardPeriodStart) return report.reportDate >= start && report.reportDate <= end;
  if (report.gatewayWeekStart != null) {
    const value = report.gatewayWeekStart;
    const date = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value) return null;
    return value >= start && value <= end;
  }
  if (!report.scorecardPeriodEnd) return null;
  if (report.scorecardPeriodEnd < start || report.scorecardPeriodStart > end) return false;
  if (report.scorecardPeriodStart >= start && report.scorecardPeriodEnd <= end) return true;
  return null;
}

function isoDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

function expectedPriorPeriod(input: ScorecardRunInput): ScorecardRunInput["priorPeriod"] | null {
  const current = new Date(`${input.period.start}T00:00:00.000Z`);
  if (Number.isNaN(current.getTime()) || current.toISOString().slice(0, 10) !== input.period.start) return null;
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  if (current.getUTCDate() !== 1) return null;

  if (input.period.kind === "monthly") {
    const priorStart = new Date(Date.UTC(year, month - 1, 1));
    const priorYear = priorStart.getUTCFullYear();
    const priorMonth = priorStart.getUTCMonth();
    return {
      kind: "monthly",
      start: isoDate(priorYear, priorMonth, 1),
      end: isoDate(priorYear, priorMonth + 1, 0),
      label: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(priorStart),
    };
  }
  if (input.period.kind === "quarterly") {
    if (month % 3 !== 0) return null;
    const priorStart = new Date(Date.UTC(year, month - 3, 1));
    const priorYear = priorStart.getUTCFullYear();
    const priorMonth = priorStart.getUTCMonth();
    return {
      kind: "quarterly",
      start: isoDate(priorYear, priorMonth, 1),
      end: isoDate(priorYear, priorMonth + 3, 0),
      label: `Q${priorMonth / 3 + 1} ${priorYear}`,
    };
  }
  if (input.period.kind === "annual") {
    if (month !== 0) return null;
    return { kind: "annual", start: `${year - 1}-01-01`, end: `${year - 1}-12-31`, label: String(year - 1) };
  }
  return null;
}

function expectedGrowth(current: number, prior: number | null) {
  if (prior == null) return null;
  if (prior === 0) return current > 0 ? 100 : 0;
  if (current === 0) return -100;
  return ((current - prior) / prior) * 100;
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

function independentlyApprovedPhotoUrl(person: ScorecardRunInput["people"][number]): string | null {
  if (!person.photoUrl || person.photoReviewStatus !== "approved") return null;
  return person.photoUrl;
}

function producerPayloadForVerification(
  input: ScorecardRunInput,
  metric: ScorecardRunInput["producerVerificationMetrics"][number],
) {
  const person = input.people.find((candidate) => candidate.id === metric.personId);
  if (!person) return metric.payload;
  return {
    ...metric.payload,
    overview: {
      ...metric.payload.overview,
      producer: {
        ...metric.payload.overview.producer,
        photoUrl: independentlyApprovedPhotoUrl(person),
      },
    },
  };
}

function trendFor(
  input: ScorecardRunInput,
  rows: Array<{ reportDate: string; reportMonth?: string; teamIpCents: number }>,
): BuilderPeriodMetric["trend"] {
  const buckets = input.period.kind === "monthly"
    ? rows.map((row, index) => ({ reportDate: row.reportDate, teamIpCents: row.teamIpCents, label: `Week ${index + 1}` }))
    : [...rows.reduce((grouped, row) => {
        const month = row.reportMonth ?? row.reportDate.slice(0, 7);
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
  const expectedPrior = expectedPriorPeriod(input);
  if (!expectedPrior || !equals(expectedPrior, input.priorPeriod)) {
    problems.push({
      cardType: "builder",
      personId: "period",
      field: "priorPeriod",
      expected: expectedPrior,
      actual: input.priorPeriod,
    });
  }
  const explicitEligibility = eligibleCardKeys(input);
  const builders = input.people.filter((person) =>
    person.activeAtPeriodEnd &&
    person.builderAtPeriodEnd &&
    cardEligible(input, explicitEligibility, person.id, "builder"),
  );
  const periodReports = input.gatewayReports.filter((report) =>
    report.status === "published" && report.periodType === "wtd" &&
    gatewayInPeriod(report, input.period),
  ).sort((left, right) => gatewaySortKey(left).localeCompare(gatewaySortKey(right)));
  const uniqueReports = new Map<string, ScorecardRunInput["gatewayReports"][number]>();
  for (const report of input.gatewayReports) {
    if (report.status !== "published" || report.periodType !== "wtd") continue;
    uniqueReports.set(gatewayIdentity(report), report);
  }
  const sixReportWindow = [...uniqueReports.values()]
    .filter((report) => gatewayAtOrBefore(report, input.period.end))
    .sort((left, right) => gatewaySortKey(right).localeCompare(gatewaySortKey(left)))
    .slice(0, 6);
  const activeDirectWriterIds = new Set<string>();
  const unresolvedWriterIds = new Set<string>();
  for (const report of input.gatewayReports) {
    if (report.status !== "published" || report.periodType !== "wtd") continue;
    const membership = activeDirectWindow(report, input.period.end);
    for (const row of report.rows) {
      if (row.personalIpCents <= 0) continue;
      if (membership === true) activeDirectWriterIds.add(row.personId);
      if (membership === null) unresolvedWriterIds.add(row.personId);
    }
  }
  for (const builder of builders) {
    for (const person of input.people) {
      if (person.activeAtPeriodEnd && person.uplineId === builder.id && person.id !== builder.id &&
          unresolvedWriterIds.has(person.id) && !activeDirectWriterIds.has(person.id)) {
        problems.push({ cardType: "builder", personId: builder.id, field: "activeDirectCoverage",
          expected: "provider-sourced week date", actual: person.id });
      }
    }
  }
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
  const licensedRecruitIds = new Set<string>();
  for (const recruit of input.recruits) {
    if (recruit.npnStatus !== "verified") continue;
    if (typeof recruit.npn !== "string" || !/^\d{1,10}$/.test(recruit.npn.trim())) continue;
    const verifiedDate = localDate(recruit.npnVerifiedAt);
    if (!verifiedDate || verifiedDate < input.period.start || verifiedDate > input.period.end) continue;
    licensedRecruitIds.add(recruit.personId);
  }
  const recruitTotals = new Map<string, number>();
  for (const builder of builders) {
    const team = descendantsOf(builder.id, input);
    team.delete(builder.id);
    recruitTotals.set(builder.id, [...licensedRecruitIds].filter((personId) => team.has(personId)).length);
  }
  const rankPopulation = input.target?.cardType === "builder" && input.builderRankPopulation
    ? input.builderRankPopulation
    : builders.map((builder) => ({
        personId: builder.id,
        teamIpCents: totals.get(builder.id) ?? 0,
        representedInGateway: represented.has(builder.id),
        recruitsAdded: recruitTotals.get(builder.id) ?? 0,
      }));
  const representedRankPopulation = rankPopulation.filter((entry) => entry.representedInGateway);

  const eligibleBuilderIds = new Set(builders.map((builder) => builder.id));
  for (const actual of prepared.builderMetrics) {
    if (!eligibleBuilderIds.has(actual.personId)) {
      problems.push({ cardType: "builder", personId: actual.personId, field: "row", expected: 0, actual: 1 });
    }
  }
  for (const builder of builders) {
    const actualRows = prepared.builderMetrics.filter((metric) => metric.personId === builder.id);
    if (actualRows.length !== 1) {
      problems.push({ cardType: "builder", personId: builder.id, field: "row", expected: 1, actual: actualRows.length });
      continue;
    }
    const actual = actualRows[0];
    const team = descendantsOf(builder.id, input);
    const reportRows = periodReports.flatMap((report) => report.rows
      .filter((row) => row.personId === builder.id)
      .map((row) => ({ reportDate: report.reportDate, reportMonth: gatewayMonth(report), ...row })));
    const total = totals.get(builder.id)!;
    const agencyWriterIds = new Set<string>();
    for (const report of sixReportWindow) {
      for (const row of report.rows) {
        if (row.personalIpCents > 0 && team.has(row.personId)) agencyWriterIds.add(row.personId);
      }
    }
    const activeDirectIds = new Set(
      input.people
        .filter((person) =>
          person.id !== builder.id &&
          person.uplineId === builder.id &&
          person.activeAtPeriodEnd &&
          activeDirectWriterIds.has(person.id),
        )
        .map((person) => person.id),
    );
    let weighted = 0;
    for (const row of reportRows) weighted += row.teamIpCents * (row.firstLegPercent ?? 0);
    const activeWriters = activeDirectIds.size;
    const monthCount: 1 | 3 | 12 = input.period.kind === "annual" ? 12 : input.period.kind === "quarterly" ? 3 : 1;
    const prior = input.priorBuilderTeamIpCents[builder.id] ?? null;
    const recruitsAdded = recruitTotals.get(builder.id)!;
    const rankFact = rankPopulation.find((entry) => entry.personId === builder.id);
    if (input.builderRankPopulation && (
      !rankFact ||
      rankFact.teamIpCents !== total ||
      rankFact.representedInGateway !== represented.has(builder.id) ||
      rankFact.recruitsAdded !== recruitsAdded
    )) {
      problems.push({
        cardType: "builder",
        personId: builder.id,
        field: "builderRankPopulation",
        expected: {
          personId: builder.id,
          teamIpCents: total,
          representedInGateway: represented.has(builder.id),
          recruitsAdded,
        },
        actual: rankFact ?? null,
      });
    }
    const expected = {
      teamIpCents: total,
      teamRank: represented.has(builder.id)
        ? {
            rank: 1 + representedRankPopulation.filter((entry) => entry.teamIpCents > total).length,
            population: representedRankPopulation.length,
          }
        : null,
      teamRankUnavailableReason: represented.has(builder.id) ? null : "not_represented_in_gateway",
      activeWriters,
      firstLegPercent: total === 0 ? null : weighted / total,
      averageMonthlyIpPerWriterCents: agencyWriterIds.size === 0 ? null : Math.round(total / monthCount / agencyWriterIds.size),
      monthCount,
      growth: {
        comparison: input.period.kind === "annual" ? "yoy" : input.period.kind === "quarterly" ? "qoq" : "mom",
        priorTeamIpCents: prior,
        currentTeamIpCents: total,
        percentage: expectedGrowth(total, prior),
      },
      recruitsAdded,
      recruitingRank: {
        rank: 1 + rankPopulation.filter((entry) => entry.recruitsAdded > recruitsAdded).length,
        population: rankPopulation.length,
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
    .filter((person) =>
      person.activeAtPeriodEnd &&
      person.producerAtPeriodEnd &&
      cardEligible(input, explicitEligibility, person.id, "producer"),
    )
    .map((person) => person.id));
  for (const actual of prepared.producerMetrics) {
    if (!eligibleProducerIds.has(actual.personId)) {
      problems.push({ cardType: "producer", personId: actual.personId, field: "row", expected: 0, actual: 1 });
    }
  }
  for (const personId of eligibleProducerIds) {
    const actualRows = prepared.producerMetrics.filter((metric) => metric.personId === personId);
    const expectedRows = input.producerVerificationMetrics.filter((metric) => metric.personId === personId);
    if (actualRows.length !== 1 || expectedRows.length !== 1) {
      problems.push({ cardType: "producer", personId, field: "row", expected: expectedRows.length, actual: actualRows.length });
    } else {
      const expectedPayload = producerPayloadForVerification(input, expectedRows[0]);
      if (!equals(expectedPayload, actualRows[0].payload)) {
        problems.push({ cardType: "producer", personId, field: "visiblePayload", expected: expectedPayload, actual: actualRows[0].payload });
      }
    }
  }

  return { valid: problems.length === 0, problems };
}

function independentPeriodFactor(kind: ScorecardRunInput["period"]["kind"]): 1 | 3 | 12 {
  return kind === "annual" ? 12 : kind === "quarterly" ? 3 : 1;
}

function independentProducerIpStars(value: unknown, factor: 1 | 3 | 12) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  if (value < 500_000 * factor) return 0;
  if (value < 1_500_000 * factor) return 1;
  if (value < 2_000_000 * factor) return 2;
  if (value < 3_000_000 * factor) return 3;
  if (value < 4_000_000 * factor) return 4;
  return 5;
}

function independentTrackingDays(loggedDates: unknown): number {
  if (!Array.isArray(loggedDates)) return 0;
  const counted = new Set<string>();
  for (const value of loggedDates) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getUTCDay() === 0) continue;
    counted.add(value);
  }
  return counted.size;
}

function independentProducerTrackingStars(value: number, factor: 1 | 3 | 12) {
  if (!Number.isInteger(value) || value < 8 * factor) return 0;
  if (value < 12 * factor) return 1;
  if (value < 16 * factor) return 2;
  if (value < 20 * factor) return 3;
  if (value < 24 * factor) return 4;
  return 5;
}

function independentProducerLeadSpendStars(value: unknown, factor: 1 | 3 | 12) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  if (value < 200_000 * factor) return 0;
  if (value < 400_000 * factor) return 1;
  if (value < 600_000 * factor) return 2;
  if (value < 800_000 * factor) return 3;
  if (value < 1_000_000 * factor) return 4;
  return 5;
}

function independentBuilderGrowthStars(value: unknown, prior: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (typeof prior !== "number" || !Number.isFinite(prior) || prior <= 0 || value < 0) return 0;
  if (value < 4) return 1;
  if (value < 8) return 2;
  if (value < 12) return 3;
  if (value < 16) return 4;
  return 5;
}

function independentBuilderFirstLegStars(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) return 0;
  if (value < 10) return 5;
  if (value < 20) return 4;
  if (value < 30) return 3;
  if (value < 40) return 2;
  if (value < 50) return 1;
  return 0;
}

function independentBuilderActiveDirectsStars(value: unknown, teamIp: number, factor: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || !Number.isFinite(teamIp) || teamIp < 0) return 0;
  const monthly = teamIp / factor;
  const thresholds = [15_000_000, 30_000_000, 60_000_000, 100_000_000, 150_000_000];
  const tier = thresholds.filter(limit => monthly > limit).length;
  return Math.max(0, Math.min(5, value - tier * 4));
}

function independentBuilderRecruitsStars(value: unknown, factor: 1 | 3 | 12) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 * factor) return 0;
  if (value < 2 * factor) return 1;
  if (value < 3 * factor) return 2;
  if (value < 4 * factor) return 3;
  if (value < 6 * factor) return 4;
  return 5;
}

export function verifyPublishedScorecardArtifacts(
  input: ScorecardRunInput,
  prepared: PreparedScorecardRun,
  artifacts: ScorecardArtifact[],
): { valid: boolean; problems: IndependentVerificationProblem[] } {
  const problems: IndependentVerificationProblem[] = [];
  const expectedPrior = expectedPriorPeriod(input);
  const factor = independentPeriodFactor(input.period.kind);

  for (const artifact of artifacts) {
    const published = parsePublishedScorecardSnapshotPayload(artifact.visiblePayload);
    if (!published) {
      problems.push({
        cardType: artifact.cardType,
        personId: artifact.personId,
        field: "publishedSnapshot",
        expected: "complete frozen published payload",
        actual: artifact.visiblePayload,
      });
      continue;
    }

    const person = input.people.find((candidate) => candidate.id === artifact.personId);
    const expectedMember = person ? {
      fullName: person.fullName,
      photoUrl: independentlyApprovedPhotoUrl(person),
    } : null;
    if (!expectedMember || !equals(expectedMember, published.member)) {
      problems.push({
        cardType: artifact.cardType,
        personId: artifact.personId,
        field: "member",
        expected: expectedMember,
        actual: published.member,
      });
    }
    if (
      published.cardType !== artifact.cardType
      || !equals({ ...input.period, previous: expectedPrior }, published.period)
    ) {
      problems.push({
        cardType: artifact.cardType,
        personId: artifact.personId,
        field: "period",
        expected: { ...input.period, previous: expectedPrior },
        actual: published.period,
      });
    }

    if (published.cardType === "producer") {
      const source = prepared.producerMetrics.find((metric) => metric.personId === artifact.personId)?.payload ?? null;
      if (!source || !equals(source, published.metricPayload)) {
        problems.push({
          cardType: "producer",
          personId: artifact.personId,
          field: "metricPayload",
          expected: source,
          actual: published.metricPayload,
        });
        continue;
      }
      const trackingDays = independentTrackingDays(source.overview.activity.loggedDates);
      const ratings = {
        issuedIp: independentProducerIpStars(source.preview.totalIssuedIpCents, factor),
        trackingConsistency: independentProducerTrackingStars(trackingDays, factor),
        leadSpend: independentProducerLeadSpendStars(source.overview.activity.leadSpendCents, factor),
      };
      const expectedScore = {
        ratings,
        overall: 0.5 * ratings.issuedIp + 0.25 * ratings.trackingConsistency + 0.25 * ratings.leadSpend,
      };
      if (!equals(expectedScore, published.score)) {
        problems.push({ cardType: "producer", personId: artifact.personId, field: "score", expected: expectedScore, actual: published.score });
      }
      continue;
    }

    const source = prepared.builderMetrics.find((metric) => metric.personId === artifact.personId) ?? null;
    if (!source) {
      problems.push({ cardType: "builder", personId: artifact.personId, field: "metricPayload", expected: "one Builder metric", actual: null });
      continue;
    }
    const expectedMetricPayload = {
      teamIpCents: source.teamIpCents,
      teamRank: source.teamRank,
      teamRankUnavailableReason: source.teamRankUnavailableReason,
      activeWriters: source.activeWriters,
      firstLegPercent: source.firstLegPercent,
      averageMonthlyIpPerWriterCents: source.averageMonthlyIpPerWriterCents,
      monthCount: source.monthCount,
      growth: source.growth,
      recruitsAdded: source.recruitsAdded,
      recruitingRank: source.recruitingRank,
      trend: source.trend,
      performance: source.performance,
      previousPerformance: source.previousPerformance,
    };
    if (!equals(expectedMetricPayload, published.metricPayload)) {
      problems.push({ cardType: "builder", personId: artifact.personId, field: "metricPayload", expected: expectedMetricPayload, actual: published.metricPayload });
      continue;
    }
    const ratings = {
      growth: independentBuilderGrowthStars(source.growth.percentage, source.growth.priorTeamIpCents),
      firstLegPercent: independentBuilderFirstLegStars(source.firstLegPercent),
      activeDirects: independentBuilderActiveDirectsStars(source.activeWriters, source.teamIpCents, factor),
      averageIpPerActiveWriter: independentProducerIpStars(source.averageMonthlyIpPerWriterCents, 1),
      recruitsLicensed: independentBuilderRecruitsStars(source.recruitsAdded, factor),
    };
    const total = Object.values(ratings).reduce((sum, rating) => sum + rating, 0);
    const expectedScore = { ratings, total, average: total / 5 };
    if (!equals(expectedScore, published.score)) {
      problems.push({ cardType: "builder", personId: artifact.personId, field: "score", expected: expectedScore, actual: published.score });
    }
  }

  return { valid: problems.length === 0, problems };
}
