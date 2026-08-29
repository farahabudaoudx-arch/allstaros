export type StarRating = 0 | 1 | 2 | 3 | 4 | 5;

export type OrganizationRank = { rank: number | null; population: number };

function validProducerMetric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function producerIssuedIpStars(value: unknown): StarRating {
  const cents = validProducerMetric(value);
  if (cents == null || cents < 500_000) return 0;
  if (cents < 1_000_000) return 1;
  if (cents < 2_000_000) return 2;
  if (cents < 3_000_000) return 3;
  if (cents < 4_000_000) return 4;
  return 5;
}

export function producerTrackingStars(value: unknown): StarRating {
  const loggedDays = validProducerMetric(value);
  if (loggedDays == null || !Number.isInteger(loggedDays) || loggedDays <= 7) return 0;
  if (loggedDays <= 11) return 1;
  if (loggedDays <= 15) return 2;
  if (loggedDays <= 19) return 3;
  if (loggedDays <= 23) return 4;
  return 5;
}

export function producerLeadSpendStars(value: unknown): StarRating {
  const cents = validProducerMetric(value);
  if (cents == null || cents < 200_000) return 0;
  if (cents < 400_000) return 1;
  if (cents < 600_000) return 2;
  if (cents < 800_000) return 3;
  if (cents < 1_000_000) return 4;
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
}): ProducerStarSummary {
  const ratings: ProducerStarRatings = {
    issuedIp: producerIssuedIpStars(input.issuedIpCents),
    trackingConsistency: producerTrackingStars(input.trackingLoggedDays),
    leadSpend: producerLeadSpendStars(input.leadSpendCents),
  };
  return {
    ratings,
    overall:
      0.5 * ratings.issuedIp +
      0.25 * ratings.trackingConsistency +
      0.25 * ratings.leadSpend,
  };
}

function validBuilderMetric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function builderGrowthStars(value: unknown, priorPeriodBaseline: unknown): StarRating {
  const growth = typeof value === "number" && Number.isFinite(value) ? value : null;
  const prior = validBuilderMetric(priorPeriodBaseline);
  if (growth == null || prior == null || prior === 0 || growth <= 0) return 0;
  if (growth < 5) return 1;
  if (growth < 10) return 2;
  if (growth < 15) return 3;
  if (growth < 25) return 4;
  return 5;
}

export function builderFirstLegStars(value: unknown): StarRating {
  const percent = validBuilderMetric(value);
  if (percent == null || percent > 100) return 0;
  if (percent < 10) return 5;
  if (percent < 20) return 4;
  if (percent < 30) return 3;
  if (percent < 40) return 2;
  if (percent < 50) return 1;
  return 0;
}

export function builderActiveDirectsStars(value: unknown): StarRating {
  const directs = validBuilderMetric(value);
  if (directs == null || !Number.isInteger(directs) || directs === 0) return 0;
  if (directs === 1) return 1;
  if (directs === 2) return 2;
  if (directs <= 4) return 3;
  if (directs <= 7) return 4;
  return 5;
}

export function builderAverageIpPerActiveWriterStars(value: unknown): StarRating {
  return producerIssuedIpStars(value);
}

export function builderRecruitsLicensedStars(value: unknown): StarRating {
  const recruits = validBuilderMetric(value);
  if (recruits == null || !Number.isInteger(recruits) || recruits === 0) return 0;
  if (recruits === 1) return 1;
  if (recruits === 2) return 2;
  if (recruits === 3) return 3;
  if (recruits <= 5) return 4;
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
  firstLegPercent?: unknown;
  activeDirects?: unknown;
  averageIpPerActiveWriterCents?: unknown;
  recruitsLicensed?: unknown;
}): BuilderStarSummary {
  const ratings: BuilderStarRatings = {
    growth: builderGrowthStars(input.growthPercent, input.priorPeriodBaseline),
    firstLegPercent: builderFirstLegStars(input.firstLegPercent),
    activeDirects: builderActiveDirectsStars(input.activeDirects),
    averageIpPerActiveWriter: builderAverageIpPerActiveWriterStars(input.averageIpPerActiveWriterCents),
    recruitsLicensed: builderRecruitsLicensedStars(input.recruitsLicensed),
  };
  const total = Object.values(ratings).reduce<number>((sum, rating) => sum + rating, 0);
  return { ratings, total, average: total / 5 };
}
