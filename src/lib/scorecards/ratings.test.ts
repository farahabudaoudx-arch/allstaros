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
    [999_999, 1], [1_000_000, 1], [1_499_999, 1],
    [1_500_000, 2], [1_500_001, 2],
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
    [-1, 0], [-0.001, 0], [0, 1], [3.99, 1], [3.999, 1], [4, 2],
    [7.99, 2], [7.999, 2], [8, 3], [11.99, 3], [11.999, 3], [12, 4],
    [15.99, 4], [15.999, 4], [16, 5], [25, 5],
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
    [0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5],
  ] as const)("scores Active Directs=%s as %s stars", (value, stars) => {
    expect(builderActiveDirectsStars(value, 0)).toBe(stars);
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 1.5] as const)(
    "treats unusable Active Directs input %s as zero stars",
    (value) => expect(builderActiveDirectsStars(value, 0)).toBe(0),
  );

  it.each([
    [0, 0], [499_999, 0], [500_000, 1], [500_001, 1],
    [999_999, 1], [1_000_000, 1], [1_499_999, 1],
    [1_500_000, 2], [1_500_001, 2],
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
    expect(createBuilderStarSummary({ teamIpCents: 0,})).toEqual({
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
    expect(createBuilderStarSummary({ teamIpCents: 0,
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
      growthPercent: -1,
      priorPeriodBaseline: 100,
      firstLegPercent: 50,
      activeDirects: 0,
      averageIpPerActiveWriterCents: 0,
      recruitsLicensed: 0,
    };

    expect(createBuilderStarSummary({ teamIpCents: 0, ...base, growthPercent: 25 }).average).toBe(1);
    expect(createBuilderStarSummary({ teamIpCents: 0, ...base, firstLegPercent: 0 }).average).toBe(1);
    expect(createBuilderStarSummary({ teamIpCents: 0, ...base, activeDirects: 8 }).average).toBe(1);
    expect(createBuilderStarSummary({ teamIpCents: 0, ...base, averageIpPerActiveWriterCents: 4_000_000 }).average).toBe(1);
    expect(createBuilderStarSummary({ teamIpCents: 0, ...base, recruitsLicensed: 6 }).average).toBe(1);

    expect(createBuilderStarSummary({ teamIpCents: 0,
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

describe("period-aware cumulative scorecard ratings", () => {
  it.each([
    ["monthly", 1],
    ["quarterly", 3],
    ["annual", 12],
  ] as const)("scales Producer Personal IP transitions for %s", (kind, factor) => {
    const transitions = [500_000, 1_500_000, 2_000_000, 3_000_000, 4_000_000] as const;
    const stars = [1, 2, 3, 4, 5] as const;
    transitions.forEach((base, index) => {
      const threshold = base * factor;
      expect(producerIssuedIpStars(threshold - 1, kind)).toBe(index === 0 ? 0 : stars[index - 1]);
      expect(producerIssuedIpStars(threshold, kind)).toBe(stars[index]);
      expect(producerIssuedIpStars(threshold + 1, kind)).toBe(stars[index]);
    });
  });

  it.each([
    ["monthly", 1],
    ["quarterly", 3],
    ["annual", 12],
  ] as const)("scales Producer Tracking transitions for %s", (kind, factor) => {
    const transitions = [8, 12, 16, 20, 24] as const;
    const stars = [1, 2, 3, 4, 5] as const;
    transitions.forEach((base, index) => {
      const threshold = base * factor;
      expect(producerTrackingStars(threshold - 1, kind)).toBe(index === 0 ? 0 : stars[index - 1]);
      expect(producerTrackingStars(threshold, kind)).toBe(stars[index]);
      expect(producerTrackingStars(threshold + 1, kind)).toBe(stars[index]);
    });
  });

  it.each([
    ["monthly", 1],
    ["quarterly", 3],
    ["annual", 12],
  ] as const)("scales Producer Lead Spend transitions for %s", (kind, factor) => {
    const transitions = [200_000, 400_000, 600_000, 800_000, 1_000_000] as const;
    const stars = [1, 2, 3, 4, 5] as const;
    transitions.forEach((base, index) => {
      const threshold = base * factor;
      expect(producerLeadSpendStars(threshold - 1, kind)).toBe(index === 0 ? 0 : stars[index - 1]);
      expect(producerLeadSpendStars(threshold, kind)).toBe(stars[index]);
      expect(producerLeadSpendStars(threshold + 1, kind)).toBe(stars[index]);
    });
  });

  it.each([
    ["monthly", 1],
    ["quarterly", 3],
    ["annual", 12],
  ] as const)("scales Recruits Licensed transitions for %s", (kind, factor) => {
    const transitions = [1, 2, 3, 4, 6] as const;
    const stars = [1, 2, 3, 4, 5] as const;
    transitions.forEach((base, index) => {
      const threshold = base * factor;
      const nextThreshold = index < transitions.length - 1 ? transitions[index + 1] * factor : null;
      expect(builderRecruitsLicensedStars(threshold - 1, kind)).toBe(index === 0 ? 0 : stars[index - 1]);
      expect(builderRecruitsLicensedStars(threshold, kind)).toBe(stars[index]);
      expect(builderRecruitsLicensedStars(threshold + 1, kind)).toBe(
        nextThreshold != null && threshold + 1 >= nextThreshold ? stars[index + 1] : stars[index],
      );
    });
  });

  it("scores the same cumulative raw value lower as the selected period grows", () => {
    expect([
      producerIssuedIpStars(4_000_000, "monthly"),
      producerIssuedIpStars(4_000_000, "quarterly"),
      producerIssuedIpStars(4_000_000, "annual"),
    ]).toEqual([5, 1, 0]);
    expect([
      producerLeadSpendStars(1_000_000, "monthly"),
      producerLeadSpendStars(1_000_000, "quarterly"),
      producerLeadSpendStars(1_000_000, "annual"),
    ]).toEqual([5, 1, 0]);
    expect([
      producerTrackingStars(24, "monthly"),
      producerTrackingStars(24, "quarterly"),
      producerTrackingStars(24, "annual"),
    ]).toEqual([5, 1, 0]);
    expect([
      builderRecruitsLicensedStars(6, "monthly"),
      builderRecruitsLicensedStars(6, "quarterly"),
      builderRecruitsLicensedStars(6, "annual"),
    ]).toEqual([5, 2, 0]);
  });

  it("does not scale Builder percentage, snapshot, or monthly-normalized metrics", () => {
    for (const kind of ["monthly", "quarterly", "annual"] as const) {
      expect(createBuilderStarSummary({ teamIpCents: 0,
        periodKind: kind,
        growthPercent: 15,
        priorPeriodBaseline: 100,
        firstLegPercent: 20,
        activeDirects: 5,
        averageIpPerActiveWriterCents: 1_500_000,
        recruitsLicensed: kind === "monthly" ? 1 : kind === "quarterly" ? 3 : 12,
      }).ratings).toEqual({
        growth: 4,
        firstLegPercent: 3,
        activeDirects: 5,
        averageIpPerActiveWriter: 2,
        recruitsLicensed: 1,
      });
    }
  });

  it("threads period kind through Producer and Builder summaries without changing weighting", () => {
    expect(createProducerStarSummary({
      periodKind: "quarterly",
      issuedIpCents: 12_000_000,
      trackingLoggedDays: 72,
      leadSpendCents: 3_000_000,
    })).toEqual({ ratings: { issuedIp: 5, trackingConsistency: 5, leadSpend: 5 }, overall: 5 });
    expect(createBuilderStarSummary({ teamIpCents: 0,
      periodKind: "quarterly",
      growthPercent: 25,
      priorPeriodBaseline: 100,
      firstLegPercent: 0,
      activeDirects: 8,
      averageIpPerActiveWriterCents: 4_000_000,
      recruitsLicensed: 18,
    })).toEqual({
      ratings: { growth: 5, firstLegPercent: 5, activeDirects: 5, averageIpPerActiveWriter: 5, recruitsLicensed: 5 },
      total: 25,
      average: 5,
    });
  });
});
