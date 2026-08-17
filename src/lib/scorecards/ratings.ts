export type StarRating = 0 | 1 | 2 | 3 | 4 | 5;

export type OrganizationRank = { rank: number | null; population: number };

function validatePerformanceValue(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Producer Scorecard rating values must be finite and non-negative.");
  }
}

function starsForPercentile(percentile: number): StarRating {
  if (!Number.isFinite(percentile) || percentile < 0 || percentile > 100) {
    throw new Error("Producer Scorecard percentiles must be between 0 and 100.");
  }
  if (percentile === 0) return 0;
  return Math.min(5, Math.ceil(percentile / 20)) as StarRating;
}

export function producerRankStars(value: number, organizationRank: OrganizationRank): StarRating {
  validatePerformanceValue(value);
  if (value === 0) return 0;
  const { rank, population } = organizationRank;
  if (typeof rank !== "number" || !Number.isInteger(rank) || !Number.isInteger(population) || population < 1 || rank < 1 || rank > population) {
    throw new Error("Producer Scorecard organization ranks must be valid positive positions.");
  }
  const percentile = ((population - rank + 1) / population) * 100;
  return starsForPercentile(percentile);
}

export type ProducerStarRatings = {
  issuedIp: StarRating;
  submittedAp: StarRating;
  leadSpend: StarRating;
  dials: StarRating;
  contacts: StarRating;
  presentations: StarRating;
  sales: StarRating;
  trackingConsistency: StarRating;
};

export type ProducerStarSummary = {
  ratings: ProducerStarRatings;
  total: number;
  average: number;
};

export function createProducerStarSummary(ratings: ProducerStarRatings): ProducerStarSummary {
  const total = Object.values(ratings).reduce<number>((sum, rating) => sum + rating, 0);
  return { ratings, total, average: total / 8 };
}
