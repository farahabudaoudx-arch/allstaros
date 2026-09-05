import { describe, expect, it } from "vitest";
import { builderActiveDirectsStars, createBuilderStarSummary } from "./ratings";

describe("corrected Builder boundaries", () => {
  it.each([15_000_000, 30_000_000, 60_000_000, 100_000_000, 150_000_000])("assigns the exact IP boundary %s and the following cent to adjacent tiers", boundary => {
    const tier = [15_000_000, 30_000_000, 60_000_000, 100_000_000, 150_000_000].indexOf(boundary);
    const firstStar = 1 + tier * 4;
    expect(builderActiveDirectsStars(firstStar, boundary)).toBe(1);
    expect(builderActiveDirectsStars(firstStar, boundary + 1)).toBe(0);
    expect(builderActiveDirectsStars(firstStar + 4, boundary + 1)).toBe(1);
  });
  it.each([0, 15_000_001, 30_000_001, 60_000_001, 100_000_001, 150_000_001])("covers every star in IP tier %s", ip => {
    const tier = [0, 15_000_001, 30_000_001, 60_000_001, 100_000_001, 150_000_001].indexOf(ip);
    for (let stars = 0; stars <= 5; stars++) {
      expect(builderActiveDirectsStars(tier * 4 + stars, ip)).toBe(stars);
    }
  });
  it("normalizes quarter and year IP before choosing the tier", () => {
    expect(builderActiveDirectsStars(9, 30_000_000, "monthly")).toBe(5);
    expect(builderActiveDirectsStars(9, 90_000_000, "quarterly")).toBe(5);
    expect(builderActiveDirectsStars(9, 360_000_000, "annual")).toBe(5);
  });
  it("does not use a saved rounded growth percentage to cross a star boundary", () => {
    const base = { priorPeriodBaseline: 1_000_000, growthPercent: 16, activeDirects: 8, teamIpCents: 40_000_000 };
    expect(createBuilderStarSummary({ ...base, currentTeamIpCents: 1_159_600 }).ratings.growth).toBe(4);
    expect(createBuilderStarSummary({ ...base, currentTeamIpCents: 1_160_000 }).ratings.growth).toBe(5);
    expect(createBuilderStarSummary({ ...base, currentTeamIpCents: 1_000_000 }).ratings.growth).toBe(1);
    expect(createBuilderStarSummary({ ...base, currentTeamIpCents: 999_999 }).ratings.growth).toBe(0);
    expect(createBuilderStarSummary({ ...base, currentTeamIpCents: 1_160_000 }).ratings.activeDirects).toBe(0);
  });
  it("does not assume a low IP tier when team IP is missing", () => {
    expect(builderActiveDirectsStars(25, undefined)).toBe(0);
  });
});
