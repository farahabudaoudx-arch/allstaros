import { describe, expect, it } from "vitest";
import {
  createProducerStarSummary,
  producerRankStars,
  producerTrackingConsistencyStars,
} from "./ratings";

describe("Producer Scorecard star ratings", () => {
  it.each([
    [0, 1, 100, 0],
    [1, 100, 100, 1],
    [1, 80, 100, 2],
    [1, 60, 100, 3],
    [1, 40, 100, 4],
    [1, 20, 100, 5],
    [1, 1, 100, 5],
  ] as const)("scores value=%s at rank %s of %s as %s stars", (value, rank, population, stars) => {
    expect(producerRankStars(value, { rank, population })).toBe(stars);
  });

  it.each([
    [0, 0],
    [20, 1],
    [21, 2],
    [40, 2],
    [41, 3],
    [60, 3],
    [61, 4],
    [80, 4],
    [81, 5],
    [100, 5],
  ] as const)("scores %s%% tracking consistency as %s stars", (percentage, stars) => {
    expect(producerTrackingConsistencyStars(percentage)).toBe(stars);
  });

  it("averages the eight percentile-based July ratings", () => {
    expect(createProducerStarSummary({
      issuedIp: 5,
      submittedAp: 5,
      leadSpend: 0,
      dials: 4,
      contacts: 4,
      presentations: 5,
      sales: 5,
      trackingConsistency: 3,
    })).toEqual({
      ratings: {
        issuedIp: 5,
        submittedAp: 5,
        leadSpend: 0,
        dials: 4,
        contacts: 4,
        presentations: 5,
        sales: 5,
        trackingConsistency: 3,
      },
      total: 31,
      average: 3.875,
    });
  });
});
