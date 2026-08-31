import type { ProducerPeriodMetricPayload, BuilderPeriodMetric } from "./run";
import { BUILDER_PERFORMANCE_KEYS } from "./builder-performance";
import type { ScorecardPeriod } from "./period";
import { previousEquivalentPeriod } from "./period";
import {
  countProducerTrackingDays,
  createBuilderStarSummary,
  createProducerStarSummary,
  type BuilderStarSummary,
  type ProducerStarSummary,
  type StarRating,
} from "./ratings";

export const PUBLISHED_SCORECARD_SCHEMA_VERSION = "scorecard-published-v1" as const;

export type PublishedScorecardMember = {
  fullName: string;
  photoUrl: string | null;
};

export type PublishedScorecardPeriod = ScorecardPeriod & {
  previous: ScorecardPeriod;
};

export type BuilderPublishedMetric = Pick<BuilderPeriodMetric,
  | "teamIpCents"
  | "teamRank"
  | "teamRankUnavailableReason"
  | "activeWriters"
  | "firstLegPercent"
  | "averageMonthlyIpPerWriterCents"
  | "monthCount"
  | "growth"
  | "recruitsAdded"
  | "recruitingRank"
  | "trend"
  | "performance"
  | "previousPerformance"
>;

export type PublishedProducerSnapshotPayload = {
  schemaVersion: typeof PUBLISHED_SCORECARD_SCHEMA_VERSION;
  cardType: "producer";
  member: PublishedScorecardMember;
  period: PublishedScorecardPeriod;
  metricPayload: ProducerPeriodMetricPayload;
  score: ProducerStarSummary;
};

export type PublishedBuilderSnapshotPayload = {
  schemaVersion: typeof PUBLISHED_SCORECARD_SCHEMA_VERSION;
  cardType: "builder";
  member: PublishedScorecardMember;
  period: PublishedScorecardPeriod;
  metricPayload: BuilderPublishedMetric;
  score: BuilderStarSummary;
};

export type PublishedScorecardSnapshotPayload =
  | PublishedProducerSnapshotPayload
  | PublishedBuilderSnapshotPayload;

export function builderPublishedMetric(metric: BuilderPeriodMetric): BuilderPublishedMetric {
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
    performance: metric.performance,
    previousPerformance: metric.previousPerformance,
  };
}

function publishedPeriod(period: ScorecardPeriod): PublishedScorecardPeriod {
  return { ...period, previous: previousEquivalentPeriod(period) };
}

export function createPublishedProducerSnapshotPayload(args: {
  metricPayload: ProducerPeriodMetricPayload;
  period: ScorecardPeriod;
  member?: PublishedScorecardMember;
}): PublishedProducerSnapshotPayload {
  const period = { ...args.period };
  const metricPayload = structuredClone(args.metricPayload);
  const member = structuredClone(args.member ?? {
    fullName: metricPayload.overview.producer.fullName,
    photoUrl: metricPayload.overview.producer.photoUrl,
  });
  const trackingLoggedDays = countProducerTrackingDays(metricPayload.overview.activity.loggedDates);
  return {
    schemaVersion: PUBLISHED_SCORECARD_SCHEMA_VERSION,
    cardType: "producer",
    member,
    period: publishedPeriod(period),
    metricPayload,
    score: createProducerStarSummary({
      issuedIpCents: metricPayload.preview.totalIssuedIpCents,
      trackingLoggedDays,
      leadSpendCents: metricPayload.overview.activity.leadSpendCents,
      periodKind: period.kind,
    }),
  };
}

export function createPublishedBuilderSnapshotPayload(args: {
  metric: BuilderPeriodMetric;
  member: PublishedScorecardMember;
  period: ScorecardPeriod;
}): PublishedBuilderSnapshotPayload {
  const metric = structuredClone(args.metric);
  const member = structuredClone(args.member);
  const period = { ...args.period };
  return {
    schemaVersion: PUBLISHED_SCORECARD_SCHEMA_VERSION,
    cardType: "builder",
    member,
    period: publishedPeriod(period),
    metricPayload: builderPublishedMetric(metric),
    score: createBuilderStarSummary({
      growthPercent: metric.growth.percentage,
      priorPeriodBaseline: metric.growth.priorTeamIpCents,
      firstLegPercent: metric.firstLegPercent,
      activeDirects: metric.activeWriters,
      averageIpPerActiveWriterCents: metric.averageMonthlyIpPerWriterCents,
      recruitsLicensed: metric.recruitsAdded,
      periodKind: period.kind,
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isStarRating(value: unknown): value is StarRating {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 5;
}

function isMember(value: unknown): value is PublishedScorecardMember {
  return isRecord(value)
    && typeof value.fullName === "string"
    && value.fullName.trim().length > 0
    && (value.photoUrl == null || typeof value.photoUrl === "string");
}

function isPeriod(value: unknown): value is PublishedScorecardPeriod {
  if (!isRecord(value) || !isRecord(value.previous)) return false;
  const validKind = (kind: unknown) => kind === "monthly" || kind === "quarterly" || kind === "annual";
  const validPart = (part: Record<string, unknown>) =>
    validKind(part.kind)
    && typeof part.start === "string"
    && typeof part.end === "string"
    && typeof part.label === "string"
    && part.label.length > 0;
  return validPart(value) && validPart(value.previous);
}

function isProducerScore(value: unknown): value is ProducerStarSummary {
  return isRecord(value)
    && isRecord(value.ratings)
    && isStarRating(value.ratings.issuedIp)
    && isStarRating(value.ratings.trackingConsistency)
    && isStarRating(value.ratings.leadSpend)
    && typeof value.overall === "number"
    && Number.isFinite(value.overall)
    && value.overall >= 0
    && value.overall <= 5;
}

function isBuilderScore(value: unknown): value is BuilderStarSummary {
  if (!isRecord(value) || !isRecord(value.ratings)) return false;
  const ratings = value.ratings;
  return isStarRating(ratings.growth)
    && isStarRating(ratings.firstLegPercent)
    && isStarRating(ratings.activeDirects)
    && isStarRating(ratings.averageIpPerActiveWriter)
    && isStarRating(ratings.recruitsLicensed)
    && typeof value.total === "number"
    && Number.isInteger(value.total)
    && value.total >= 0
    && value.total <= 25
    && typeof value.average === "number"
    && Number.isFinite(value.average)
    && value.average >= 0
    && value.average <= 5;
}

function isNullableFiniteNumber(value: unknown): boolean {
  return value == null || (typeof value === "number" && Number.isFinite(value));
}

function isOrganizationRank(value: unknown): boolean {
  return isRecord(value)
    && (value.rank == null || (typeof value.rank === "number" && Number.isInteger(value.rank) && value.rank > 0))
    && typeof value.population === "number"
    && Number.isInteger(value.population)
    && value.population >= 0;
}

function isProducerActivityTotals(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ["leads", "dials", "contacts", "appointments", "presentations", "sales"].every((key) =>
    typeof value[key] === "number" && Number.isFinite(value[key]),
  );
}

function isNullableProducerActivityTotals(value: unknown): boolean {
  return value == null || isProducerActivityTotals(value);
}

function isNullableStringArray(value: unknown): boolean {
  return value == null || (Array.isArray(value) && value.every((entry) => typeof entry === "string"));
}

function isProducerMetricPayload(value: unknown): value is ProducerPeriodMetricPayload {
  if (!isRecord(value) || !isRecord(value.preview) || !isRecord(value.overview)) return false;
  const preview = value.preview;
  const overview = value.overview;
  if (!isRecord(overview.producer) || !isRecord(overview.activity)) return false;
  return preview.cardType === "producer"
    && (preview.periodKind === "monthly" || preview.periodKind === "quarterly" || preview.periodKind === "annual")
    && typeof preview.periodStart === "string"
    && typeof preview.periodEnd === "string"
    && typeof preview.periodLabel === "string"
    && typeof preview.title === "string"
    && typeof preview.totalIssuedIpCents === "number"
    && Number.isFinite(preview.totalIssuedIpCents)
    && Array.isArray(preview.weeklyReports)
    && typeof overview.producer.fullName === "string"
    && (overview.producer.photoUrl == null || typeof overview.producer.photoUrl === "string")
    && typeof overview.activity.leadSpendCents === "number"
    && Number.isFinite(overview.activity.leadSpendCents)
    && Array.isArray(overview.activity.loggedDates)
    && overview.activity.loggedDates.every((entry) => typeof entry === "string")
    && isNullableStringArray(overview.activity.expectedDates)
    && isNullableProducerActivityTotals(overview.activity.totals)
    && isNullableProducerActivityTotals(overview.activity.perTrackedDay)
    && isNullableProducerActivityTotals(overview.priorActivityTotals)
    && isNullableFiniteNumber(overview.submittedApCents)
    && isNullableFiniteNumber(overview.priorSubmittedApCents)
    && isNullableFiniteNumber(overview.priorLeadSpendCents)
    && isNullableFiniteNumber(overview.priorIssuedIpCents);
}

function isBuilderPerformance(value: unknown, ranked: boolean): boolean {
  if (!isRecord(value)) return false;
  return BUILDER_PERFORMANCE_KEYS.every((key) => {
    const entry = value[key];
    if (!ranked) return isNullableFiniteNumber(entry);
    return isRecord(entry)
      && isNullableFiniteNumber(entry.value)
      && isOrganizationRank(entry.rank);
  });
}

function isBuilderMetricPayload(value: unknown): value is BuilderPublishedMetric {
  if (!isRecord(value) || !isRecord(value.growth) || !isOrganizationRank(value.recruitingRank)) return false;
  return typeof value.teamIpCents === "number"
    && Number.isFinite(value.teamIpCents)
    && (value.teamRank == null || isOrganizationRank(value.teamRank))
    && typeof value.activeWriters === "number"
    && Number.isInteger(value.activeWriters)
    && isNullableFiniteNumber(value.firstLegPercent)
    && isNullableFiniteNumber(value.averageMonthlyIpPerWriterCents)
    && (value.monthCount === 1 || value.monthCount === 3 || value.monthCount === 12)
    && (value.growth.comparison === "mom" || value.growth.comparison === "qoq" || value.growth.comparison === "yoy")
    && isNullableFiniteNumber(value.growth.priorTeamIpCents)
    && typeof value.growth.currentTeamIpCents === "number"
    && Number.isFinite(value.growth.currentTeamIpCents)
    && isNullableFiniteNumber(value.growth.percentage)
    && typeof value.recruitsAdded === "number"
    && Number.isInteger(value.recruitsAdded)
    && Array.isArray(value.trend)
    && isBuilderPerformance(value.performance, true)
    && isBuilderPerformance(value.previousPerformance, false);
}

export function parsePublishedScorecardSnapshotPayload(value: unknown): PublishedScorecardSnapshotPayload | null {
  if (!isRecord(value)
    || value.schemaVersion !== PUBLISHED_SCORECARD_SCHEMA_VERSION
    || !isMember(value.member)
    || !isPeriod(value.period)
    || !isRecord(value.metricPayload)
  ) return null;

  if (value.cardType === "producer" && isProducerMetricPayload(value.metricPayload) && isProducerScore(value.score)) {
    return value as unknown as PublishedProducerSnapshotPayload;
  }
  if (value.cardType === "builder" && isBuilderMetricPayload(value.metricPayload) && isBuilderScore(value.score)) {
    return value as unknown as PublishedBuilderSnapshotPayload;
  }
  return null;
}

export function requirePublishedScorecardSnapshotPayload(row: {
  id?: string;
  cardType: "producer" | "builder";
  periodKind: ScorecardPeriod["kind"];
  periodStart: string;
  periodEnd: string;
  kpiResults: unknown;
}): PublishedScorecardSnapshotPayload {
  const published = parsePublishedScorecardSnapshotPayload(row.kpiResults);
  const label = row.id ? `Published Scorecard ${row.id}` : "Published Scorecard";
  if (!published) throw new Error(`${label} snapshot is incomplete or malformed.`);
  if (
    published.cardType !== row.cardType
    || published.period.kind !== row.periodKind
    || published.period.start !== row.periodStart
    || published.period.end !== row.periodEnd
  ) {
    throw new Error(`${label} snapshot metadata does not match its persisted row.`);
  }
  return published;
}
