import { describe, expect, it } from "vitest";
import {
  builderRankStars,
  createBuilderStarSummary,
  createProducerStarSummary,
  producerRankStars,
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

  it("averages the eight percentile-based July ratings", () => {
    expect(createProducerStarSummary({
      issuedIp: 5,
      submittedAp: 5,
      leadSpend: 0,
      dials: 2,
      contacts: 3,
      presentations: 4,
      sales: 4,
      trackingConsistency: 4,
    })).toEqual({
      ratings: {
        issuedIp: 5,
        submittedAp: 5,
        leadSpend: 0,
        dials: 2,
        contacts: 3,
        presentations: 4,
        sales: 4,
        trackingConsistency: 4,
      },
      total: 27,
      average: 3.375,
    });
  });
});

describe("Builder Scorecard star ratings", () => {
  it("uses the same organization percentile tiers for active agencies", () => {
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
