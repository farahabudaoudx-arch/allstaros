export type StarRating = 0 | 1 | 2 | 3 | 4 | 5;

export type ProducerStarMetric =
  | "issuedIpCents"
  | "submittedApCents"
  | "leadSpendCents"
  | "dials"
  | "contacts"
  | "presentations"
  | "sales"
  | "trackingConsistency";

const MAXIMUMS_BY_STAR: Record<ProducerStarMetric, readonly [number, number, number, number]> = {
  issuedIpCents: [1_000_000, 2_000_000, 3_000_000, 5_000_000],
  submittedApCents: [1_000_000, 2_000_000, 3_000_000, 5_000_000],
  leadSpendCents: [100_000, 300_000, 500_000, 1_000_000],
  dials: [1_000, 2_000, 3_000, 4_000],
  contacts: [50, 100, 150, 200],
  presentations: [10, 20, 30, 40],
  sales: [5, 15, 25, 35],
  trackingConsistency: [20, 40, 60, 80],
};

export function producerMetricStars(metric: ProducerStarMetric, value: number): StarRating {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Producer Scorecard rating values must be finite and non-negative.");
  }
  if (value === 0) return 0;
  const maximums = MAXIMUMS_BY_STAR[metric];
  const band = maximums.findIndex((maximum) => value <= maximum);
  return (band === -1 ? 5 : band + 1) as StarRating;
}

export type ProducerStarSummary = {
  ratings: {
    issuedIp: StarRating;
    submittedAp: StarRating;
    leadSpend: StarRating;
    dials: StarRating;
    contacts: StarRating;
    presentations: StarRating;
    sales: StarRating;
    trackingConsistency: StarRating;
  };
  total: number;
  average: number;
};

export function createProducerStarSummary(input: {
  issuedIpCents: number;
  submittedApCents: number;
  leadSpendCents: number;
  dials: number;
  contacts: number;
  presentations: number;
  sales: number;
  trackingConsistency: number;
}): ProducerStarSummary {
  const ratings = {
    issuedIp: producerMetricStars("issuedIpCents", input.issuedIpCents),
    submittedAp: producerMetricStars("submittedApCents", input.submittedApCents),
    leadSpend: producerMetricStars("leadSpendCents", input.leadSpendCents),
    dials: producerMetricStars("dials", input.dials),
    contacts: producerMetricStars("contacts", input.contacts),
    presentations: producerMetricStars("presentations", input.presentations),
    sales: producerMetricStars("sales", input.sales),
    trackingConsistency: producerMetricStars("trackingConsistency", input.trackingConsistency),
  } satisfies ProducerStarSummary["ratings"];
  const total = Object.values(ratings).reduce<number>((sum, rating) => sum + rating, 0);
  return { ratings, total, average: total / 8 };
}
