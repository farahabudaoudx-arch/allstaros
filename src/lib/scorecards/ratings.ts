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

function starsForPercentile(percentile: number): StarRating {
  if (!Number.isFinite(percentile) || percentile < 0 || percentile > 100) {
    throw new Error("Builder Scorecard percentiles must be between 0 and 100.");
  }
  if (percentile === 0) return 0;
  return Math.min(5, Math.ceil(percentile / 20)) as StarRating;
}

export function builderRankStars(value: number, organizationRank: OrganizationRank): StarRating {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Builder Scorecard rating values must be finite and non-negative.");
  }
  if (value === 0) return 0;
  const { rank, population } = organizationRank;
  if (typeof rank !== "number" || !Number.isInteger(rank) || !Number.isInteger(population) || population < 1 || rank < 1 || rank > population) {
    throw new Error("Builder Scorecard organization ranks must be valid positive positions.");
  }
  const percentile = ((population - rank + 1) / population) * 100;
  return starsForPercentile(percentile);
}

export type BuilderStarRatings = {
  activeWriters: StarRating;
  teamDials: StarRating;
  teamContacts: StarRating;
  teamPresentations: StarRating;
  teamSales: StarRating;
  teamAp: StarRating;
  teamIp: StarRating;
  firstLegPercent: StarRating;
  averageIpPerWriter: StarRating;
  recruits: StarRating;
};

export type BuilderStarSummary = {
  ratings: BuilderStarRatings;
  total: number;
  average: number;
};

export function createBuilderStarSummary(ratings: BuilderStarRatings): BuilderStarSummary {
  const total = Object.values(ratings).reduce<number>((sum, rating) => sum + rating, 0);
  return { ratings, total, average: total / 10 };
}
