import { describe, expect, it } from "vitest";
import {
  builderActiveDirectsStars,
  builderAverageIpPerActiveWriterStars,
  builderFirstLegStars,
  builderGrowthStars,
  builderRecruitsLicensedStars,
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

describe("Builder Scorecard fixed star ratings", () => {
  it.each([
    [-1, 0], [0, 0], [0.001, 1], [4.999, 1], [5, 2], [5.001, 2],
    [9.999, 2], [10, 3], [10.001, 3], [14.999, 3], [15, 4], [15.001, 4],
    [24.999, 4], [25, 5], [25.001, 5],
  ] as const)("scores Growth %%=%s as %s stars with a usable prior baseline", (value, stars) => {
    expect(builderGrowthStars(value, 100)).toBe(stars);
  });

  it.each([0, null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1] as const)(
    "treats unusable prior Growth baseline %s as zero stars",
    (prior) => expect(builderGrowthStars(100, prior)).toBe(0),
  );

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] as const)(
    "treats unusable Growth input %s as zero stars",
    (value) => expect(builderGrowthStars(value, 100)).toBe(0),
  );

  it.each([
    [0, 5], [9.999, 5], [10, 4], [10.001, 4], [19.999, 4], [20, 3], [20.001, 3],
    [29.999, 3], [30, 2], [30.001, 2], [39.999, 2], [40, 1], [40.001, 1],
    [49.999, 1], [50, 0], [50.001, 0], [100, 0],
  ] as const)("scores lower-is-better First Leg %%=%s as %s stars", (value, stars) => {
    expect(builderFirstLegStars(value)).toBe(stars);
  });

  it("keeps First Leg stars monotonically non-increasing as the percentage rises", () => {
    const values = [0, 5, 9.999, 10, 15, 19.999, 20, 25, 29.999, 30, 35, 39.999, 40, 45, 49.999, 50, 75, 100];
    const ratings = values.map(builderFirstLegStars);
    for (let index = 1; index < ratings.length; index += 1) {
      expect(ratings[index]).toBeLessThanOrEqual(ratings[index - 1]);
    }
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 100.001] as const)(
    "treats unusable First Leg input %s as zero stars",
    (value) => expect(builderFirstLegStars(value)).toBe(0),
  );

  it.each([
    [0, 0], [1, 1], [2, 2], [3, 3], [4, 3], [5, 4], [6, 4], [7, 4], [8, 5], [9, 5],
  ] as const)("scores Active Directs=%s as %s stars", (value, stars) => {
    expect(builderActiveDirectsStars(value)).toBe(stars);
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 1.5] as const)(
    "treats unusable Active Directs input %s as zero stars",
    (value) => expect(builderActiveDirectsStars(value)).toBe(0),
  );

  it.each([
    [0, 0], [499_999, 0], [500_000, 1], [500_001, 1],
    [999_999, 1], [1_000_000, 2], [1_000_001, 2],
    [1_999_999, 2], [2_000_000, 3], [2_000_001, 3],
    [2_999_999, 3], [3_000_000, 4], [3_000_001, 4],
    [3_999_999, 4], [4_000_000, 5], [4_000_001, 5],
  ] as const)("scores Avg IP per Active Writer cents=%s as %s stars", (value, stars) => {
    expect(builderAverageIpPerActiveWriterStars(value)).toBe(stars);
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1] as const)(
    "treats unusable Avg IP per Active Writer input %s as zero stars",
    (value) => expect(builderAverageIpPerActiveWriterStars(value)).toBe(0),
  );

  it.each([
    [0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 4], [6, 5], [7, 5],
  ] as const)("scores Recruits Licensed=%s as %s stars", (value, stars) => {
    expect(builderRecruitsLicensedStars(value)).toBe(stars);
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 2.5] as const)(
    "treats unusable Recruits Licensed input %s as zero stars",
    (value) => expect(builderRecruitsLicensedStars(value)).toBe(0),
  );

  it("scores missing and non-finite Builder summary inputs defensively as zero", () => {
    expect(createBuilderStarSummary({})).toEqual({
      ratings: {
        growth: 0,
        firstLegPercent: 0,
        activeDirects: 0,
        averageIpPerActiveWriter: 0,
        recruitsLicensed: 0,
      },
      total: 0,
      average: 0,
    });
    expect(createBuilderStarSummary({
      growthPercent: Number.POSITIVE_INFINITY,
      priorPeriodBaseline: Number.NaN,
      firstLegPercent: Number.NEGATIVE_INFINITY,
      activeDirects: 1.5,
      averageIpPerActiveWriterCents: Number.NaN,
      recruitsLicensed: -1,
    }).average).toBe(0);
  });

  it("weights all five Builder metrics equally at 20% each", () => {
    const base = {
      growthPercent: 0,
      priorPeriodBaseline: 100,
      firstLegPercent: 50,
      activeDirects: 0,
      averageIpPerActiveWriterCents: 0,
      recruitsLicensed: 0,
    };

    expect(createBuilderStarSummary({ ...base, growthPercent: 25 }).average).toBe(1);
    expect(createBuilderStarSummary({ ...base, firstLegPercent: 0 }).average).toBe(1);
    expect(createBuilderStarSummary({ ...base, activeDirects: 8 }).average).toBe(1);
    expect(createBuilderStarSummary({ ...base, averageIpPerActiveWriterCents: 4_000_000 }).average).toBe(1);
    expect(createBuilderStarSummary({ ...base, recruitsLicensed: 6 }).average).toBe(1);

    expect(createBuilderStarSummary({
      growthPercent: 25,
      priorPeriodBaseline: 100,
      firstLegPercent: 0,
      activeDirects: 8,
      averageIpPerActiveWriterCents: 4_000_000,
      recruitsLicensed: 6,
    })).toEqual({
      ratings: {
        growth: 5,
        firstLegPercent: 5,
        activeDirects: 5,
        averageIpPerActiveWriter: 5,
        recruitsLicensed: 5,
      },
      total: 25,
      average: 5,
    });
  });
});
