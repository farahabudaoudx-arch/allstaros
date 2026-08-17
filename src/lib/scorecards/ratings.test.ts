import { describe, expect, it } from "vitest";
import { createProducerStarSummary, producerMetricStars } from "./ratings";

describe("Producer Scorecard star ratings", () => {
  it.each([
    ["issuedIpCents", 0, 0],
    ["issuedIpCents", 1, 1],
    ["issuedIpCents", 1_000_000, 1],
    ["issuedIpCents", 1_000_001, 2],
    ["issuedIpCents", 2_000_001, 3],
    ["issuedIpCents", 3_000_001, 4],
    ["issuedIpCents", 5_000_001, 5],
    ["submittedApCents", 5_000_001, 5],
    ["leadSpendCents", 0, 0],
    ["leadSpendCents", 100_000, 1],
    ["leadSpendCents", 100_001, 2],
    ["leadSpendCents", 300_001, 3],
    ["leadSpendCents", 500_001, 4],
    ["leadSpendCents", 1_000_001, 5],
    ["dials", 0, 0],
    ["dials", 1_000, 1],
    ["dials", 1_001, 2],
    ["dials", 2_001, 3],
    ["dials", 3_001, 4],
    ["dials", 4_001, 5],
    ["contacts", 50, 1],
    ["contacts", 51, 2],
    ["contacts", 101, 3],
    ["contacts", 151, 4],
    ["contacts", 201, 5],
    ["presentations", 10, 1],
    ["presentations", 11, 2],
    ["presentations", 21, 3],
    ["presentations", 31, 4],
    ["presentations", 41, 5],
    ["sales", 5, 1],
    ["sales", 6, 2],
    ["sales", 16, 3],
    ["sales", 26, 4],
    ["sales", 36, 5],
    ["trackingConsistency", 0, 0],
    ["trackingConsistency", 20, 1],
    ["trackingConsistency", 21, 2],
    ["trackingConsistency", 41, 3],
    ["trackingConsistency", 61, 4],
    ["trackingConsistency", 81, 5],
    ["trackingConsistency", 100, 5],
  ] as const)("scores %s=%s as %s stars", (metric, value, stars) => {
    expect(producerMetricStars(metric, value)).toBe(stars);
  });

  it("averages the eight approved July ratings", () => {
    expect(createProducerStarSummary({
      issuedIpCents: 3_376_680,
      submittedApCents: 3_094_788,
      leadSpendCents: 0,
      dials: 443,
      contacts: 38,
      presentations: 13,
      sales: 11,
      trackingConsistency: 59,
    })).toEqual({
      ratings: {
        issuedIp: 4,
        submittedAp: 4,
        leadSpend: 0,
        dials: 1,
        contacts: 1,
        presentations: 2,
        sales: 2,
        trackingConsistency: 3,
      },
      total: 17,
      average: 2.125,
    });
  });
});
