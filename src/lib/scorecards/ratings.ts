import { scaleCumulativeThreshold } from "./period";
import type { ScorecardPeriodKind } from "./run";

export type StarRating = 0 | 1 | 2 | 3 | 4 | 5;

export type OrganizationRank = { rank: number | null; population: number };

function validProducerMetric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function producerIssuedIpStars(
  value: unknown,
  periodKind: ScorecardPeriodKind = "monthly",
): StarRating {
  const cents = validProducerMetric(value);
  if (cents == null || cents < scaleCumulativeThreshold(500_000, periodKind)) return 0;
  if (cents < scaleCumulativeThreshold(1_500_000, periodKind)) return 1;
  if (cents < scaleCumulativeThreshold(2_000_000, periodKind)) return 2;
  if (cents < scaleCumulativeThreshold(3_000_000, periodKind)) return 3;
  if (cents < scaleCumulativeThreshold(4_000_000, periodKind)) return 4;
  return 5;
}

export function producerTrackingStars(
  value: unknown,
  periodKind: ScorecardPeriodKind = "monthly",
): StarRating {
  const loggedDays = validProducerMetric(value);
  if (loggedDays == null || !Number.isInteger(loggedDays)) return 0;
  if (loggedDays < scaleCumulativeThreshold(8, periodKind)) return 0;
  if (loggedDays < scaleCumulativeThreshold(12, periodKind)) return 1;
  if (loggedDays < scaleCumulativeThreshold(16, periodKind)) return 2;
  if (loggedDays < scaleCumulativeThreshold(20, periodKind)) return 3;
  if (loggedDays < scaleCumulativeThreshold(24, periodKind)) return 4;
  return 5;
}

export function producerLeadSpendStars(
  value: unknown,
  periodKind: ScorecardPeriodKind = "monthly",
): StarRating {
  const cents = validProducerMetric(value);
  if (cents == null || cents < scaleCumulativeThreshold(200_000, periodKind)) return 0;
  if (cents < scaleCumulativeThreshold(400_000, periodKind)) return 1;
  if (cents < scaleCumulativeThreshold(600_000, periodKind)) return 2;
  if (cents < scaleCumulativeThreshold(800_000, periodKind)) return 3;
  if (cents < scaleCumulativeThreshold(1_000_000, periodKind)) return 4;
  return 5;
}

export function countProducerTrackingDays(loggedDates: Iterable<string> | null | undefined): number {
  if (!loggedDates) return 0;
  const counted = new Set<string>();
  for (const dateText of loggedDates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) continue;
    const date = new Date(`${dateText}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateText) continue;
    if (date.getUTCDay() === 0) continue;
    counted.add(dateText);
  }
  return counted.size;
}

export type ProducerStarRatings = {
  issuedIp: StarRating;
  trackingConsistency: StarRating;
  leadSpend: StarRating;
};

export type ProducerStarSummary = {
  ratings: ProducerStarRatings;
  overall: number;
};

export function createProducerStarSummary(input: {
  issuedIpCents?: unknown;
  trackingLoggedDays?: unknown;
  leadSpendCents?: unknown;
  periodKind?: ScorecardPeriodKind;
}): ProducerStarSummary {
  const periodKind = input.periodKind ?? "monthly";
  const ratings: ProducerStarRatings = {
    issuedIp: producerIssuedIpStars(input.issuedIpCents, periodKind),
    trackingConsistency: producerTrackingStars(input.trackingLoggedDays, periodKind),
    leadSpend: producerLeadSpendStars(input.leadSpendCents, periodKind),
  };
  const weighted =
    0.5 * ratings.issuedIp +
    0.25 * ratings.trackingConsistency +
    0.25 * ratings.leadSpend;
  const overall = weighted % 1 === 0.5 ? Math.ceil(weighted) : weighted;
  return {
    ratings,
    overall,
  };
}

function validBuilderMetric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function builderGrowthStars(value: unknown, priorPeriodBaseline: unknown): StarRating {
  const growth = typeof value === "number" && Number.isFinite(value) ? value : null;
  const prior = validBuilderMetric(priorPeriodBaseline);
  if (growth == null || prior == null || prior === 0 || growth < 0) return 0;
  if (growth < 4) return 1;
  if (growth < 8) return 2;
  if (growth < 12) return 3;
  if (growth < 16) return 4;
  return 5;
}

export function builderFirstLegStars(value: unknown): StarRating {
  const percent = validBuilderMetric(value);
  if (percent == null || percent > 100) return 0;
  if (percent < 30) return 5;
  if (percent < 40) return 4;
  if (percent < 50) return 3;
  if (percent < 60) return 2;
  if (percent < 70) return 1;
  return 0;
}

// Monthly-equivalent team IP determines the required number of direct writers.
export const ACTIVE_DIRECT_IP_TIERS = [
  { maximumCents: 15_000_000, label: "0–150K", firstStar: 1 },
  { maximumCents: 30_000_000, label: ">150K–300K", firstStar: 5 },
  { maximumCents: 60_000_000, label: ">300K–600K", firstStar: 9 },
  { maximumCents: 100_000_000, label: ">600K–1M", firstStar: 13 },
  { maximumCents: 150_000_000, label: ">1M–1.5M", firstStar: 17 },
  { maximumCents: Infinity, label: ">1.5M", firstStar: 21 },
] as const;

export function builderActiveDirectsStars(value: unknown, teamIpCents: unknown, periodKind: ScorecardPeriodKind = "monthly"): StarRating {
  const directs = validBuilderMetric(value);
  const teamIp = validBuilderMetric(teamIpCents);
  if (directs == null || !Number.isInteger(directs) || teamIp == null) return 0;
  const monthlyIp = teamIp / scaleCumulativeThreshold(1, periodKind);
  const tier = ACTIVE_DIRECT_IP_TIERS.find(tier => monthlyIp <= tier.maximumCents)!;
  return Math.max(0, Math.min(5, directs - tier.firstStar + 1)) as StarRating;
}

export function builderGrowthPercent(current: unknown, prior: unknown): number | null {
  const currentIp = validBuilderMetric(current);
  const priorIp = validBuilderMetric(prior);
  if (currentIp == null || priorIp == null || priorIp === 0) return null;
  return ((currentIp - priorIp) / priorIp) * 100;
}

export function builderAverageIpPerActiveWriterStars(value: unknown): StarRating {
  const cents = validBuilderMetric(value);
  if (cents == null || cents < 500_000) return 0;
  if (cents < 750_000) return 1;
  if (cents < 1_000_000) return 2;
  if (cents < 1_250_000) return 3;
  if (cents < 1_500_000) return 4;
  return 5;
}

export function builderRecruitsLicensedStars(
  value: unknown,
  periodKind: ScorecardPeriodKind = "monthly",
): StarRating {
  const recruits = validBuilderMetric(value);
  if (recruits == null || !Number.isInteger(recruits)) return 0;
  if (recruits < scaleCumulativeThreshold(1, periodKind)) return 0;
  if (recruits < scaleCumulativeThreshold(2, periodKind)) return 1;
  if (recruits < scaleCumulativeThreshold(3, periodKind)) return 2;
  if (recruits < scaleCumulativeThreshold(4, periodKind)) return 3;
  if (recruits < scaleCumulativeThreshold(5, periodKind)) return 4;
  return 5;
}

export type BuilderStarRatings = {
  growth: StarRating;
  firstLegPercent: StarRating;
  activeDirects: StarRating;
  averageIpPerActiveWriter: StarRating;
  recruitsLicensed: StarRating;
};

export type BuilderStarSummary = {
  ratings: BuilderStarRatings;
  total: number;
  average: number;
};

export function createBuilderStarSummary(input: {
  growthPercent?: unknown;
  priorPeriodBaseline?: unknown;
  teamIpCents?: unknown;
  currentTeamIpCents?: unknown;
  firstLegPercent?: unknown;
  activeDirects?: unknown;
  averageIpPerActiveWriterCents?: unknown;
  recruitsLicensed?: unknown;
  periodKind?: ScorecardPeriodKind;
}): BuilderStarSummary {
  const periodKind = input.periodKind ?? "monthly";
  const ratings: BuilderStarRatings = {
    growth: builderGrowthStars(input.currentTeamIpCents === undefined ? input.growthPercent : builderGrowthPercent(input.currentTeamIpCents, input.priorPeriodBaseline), input.priorPeriodBaseline),
    firstLegPercent: builderFirstLegStars(input.firstLegPercent),
    activeDirects: builderActiveDirectsStars(input.activeDirects, input.teamIpCents, periodKind),
    averageIpPerActiveWriter: builderAverageIpPerActiveWriterStars(input.averageIpPerActiveWriterCents),
    recruitsLicensed: builderRecruitsLicensedStars(input.recruitsLicensed, periodKind),
  };
  const total = Object.values(ratings).reduce<number>((sum, rating) => sum + rating, 0);
  return { ratings, total, average: total / 5 };
}
