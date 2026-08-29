import { describe, expect, it } from "vitest";
import {
  builderRankStars,
  countProducerTrackingDays,
  createBuilderStarSummary,
  createProducerStarSummary,
  producerIssuedIpStars,
  producerLeadSpendStars,
  producerTrackingStars,
} from "./ratings";

describe("Producer Scorecard fixed star ratings", () => {
  it.each([
    [0, 0],
    [499_999, 0], [500_000, 1], [500_001, 1],
    [999_999, 1], [1_000_000, 2], [1_000_001, 2],
    [1_999_999, 2], [2_000_000, 3], [2_000_001, 3],
    [2_999_999, 3], [3_000_000, 4], [3_000_001, 4],
    [3_999_999, 4], [4_000_000, 5], [4_000_001, 5],
  ] as const)("scores Personal IP cents=%s as %s stars", (value, stars) => {
    expect(producerIssuedIpStars(value)).toBe(stars);
  });

  it.each([
    [0, 0], [7, 0], [8, 1], [9, 1], [11, 1], [12, 2], [13, 2],
    [15, 2], [16, 3], [17, 3], [19, 3], [20, 4], [21, 4],
    [23, 4], [24, 5], [25, 5], [31, 5],
  ] as const)("scores tracking days=%s as %s stars", (value, stars) => {
    expect(producerTrackingStars(value)).toBe(stars);
  });

  it.each([
    [0, 0],
    [199_999, 0], [200_000, 1], [200_001, 1],
    [399_999, 1], [400_000, 2], [400_001, 2],
    [599_999, 2], [600_000, 3], [600_001, 3],
    [799_999, 3], [800_000, 4], [800_001, 4],
    [999_999, 4], [1_000_000, 5], [1_000_001, 5],
  ] as const)("scores Lead Spend cents=%s as %s stars", (value, stars) => {
    expect(producerLeadSpendStars(value)).toBe(stars);
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1] as const)(
    "treats unusable Personal IP input %s as zero stars",
    (value) => expect(producerIssuedIpStars(value)).toBe(0),
  );

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 8.5] as const)(
    "treats unusable tracking input %s as zero stars",
    (value) => expect(producerTrackingStars(value)).toBe(0),
  );

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1] as const)(
    "treats unusable Lead Spend input %s as zero stars",
    (value) => expect(producerLeadSpendStars(value)).toBe(0),
  );

  it("counts duplicate Mon–Sat dates only once", () => {
    expect(countProducerTrackingDays([
      "2026-08-01",
      "2026-08-01",
      "2026-08-03",
      "2026-08-03",
    ])).toBe(2);
  });

  it("scores Sunday-only tracking logs as zero days", () => {
    expect(countProducerTrackingDays([
      "2026-08-02",
      "2026-08-09",
      "2026-08-16",
      "2026-08-23",
    ])).toBe(0);
  });

  it("ignores Sundays while retaining valid Mon–Sat logs", () => {
    expect(countProducerTrackingDays([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-09",
      "2026-08-03",
      "not-a-date",
    ])).toBe(2);
  });

  it("treats missing tracking-date collections as zero days", () => {
    expect(countProducerTrackingDays(null)).toBe(0);
    expect(countProducerTrackingDays(undefined)).toBe(0);
  });

  it("treats missing or invalid Producer summary inputs as zero without throwing", () => {
    expect(createProducerStarSummary({})).toEqual({
      ratings: { issuedIp: 0, trackingConsistency: 0, leadSpend: 0 },
      overall: 0,
    });
    expect(createProducerStarSummary({
      issuedIpCents: Number.POSITIVE_INFINITY,
      trackingLoggedDays: -10,
      leadSpendCents: Number.NaN,
    })).toEqual({
      ratings: { issuedIp: 0, trackingConsistency: 0, leadSpend: 0 },
      overall: 0,
    });
  });

  it("applies the fixed 50/25/25 Producer weighting instead of an arithmetic average", () => {
    expect(createProducerStarSummary({
      issuedIpCents: 4_000_000,
      trackingLoggedDays: 20,
      leadSpendCents: 600_000,
    })).toEqual({
      ratings: { issuedIp: 5, trackingConsistency: 4, leadSpend: 3 },
      overall: 4.25,
    });
    expect(createProducerStarSummary({
      issuedIpCents: 500_000,
      trackingLoggedDays: 24,
      leadSpendCents: 1_000_000,
    }).overall).toBe(3);
  });

  it("weights the three Producer metrics at 50%, 25%, and 25% independently", () => {
    expect(createProducerStarSummary({ issuedIpCents: 4_000_000 }).overall).toBe(2.5);
    expect(createProducerStarSummary({ trackingLoggedDays: 24 }).overall).toBe(1.25);
    expect(createProducerStarSummary({ leadSpendCents: 1_000_000 }).overall).toBe(1.25);
  });
});

describe("Builder Scorecard star ratings", () => {
  it("preserves organization percentile tiers for active agencies", () => {
    expect(builderRankStars(0, { rank: 99, population: 99 })).toBe(0);
    expect(builderRankStars(43, { rank: 18, population: 99 })).toBe(5);
    expect(builderRankStars(443, { rank: 59, population: 99 })).toBe(3);
  });

  it("averages the nine Team Production ratings and Recruiting", () => {
    expect(createBuilderStarSummary({
      activeWriters: 5,
      teamDials: 4,
      teamContacts: 4,
      teamPresentations: 3,
      teamSales: 3,
      teamAp: 5,
      teamIp: 5,
      firstLegPercent: 4,
      averageIpPerWriter: 4,
      recruits: 5,
    })).toEqual({
      ratings: {
        activeWriters: 5,
        teamDials: 4,
        teamContacts: 4,
        teamPresentations: 3,
        teamSales: 3,
        teamAp: 5,
        teamIp: 5,
        firstLegPercent: 4,
        averageIpPerWriter: 4,
        recruits: 5,
      },
      total: 42,
      average: 4.2,
    });
  });
});
