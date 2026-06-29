import { describe, it, expect } from "vitest";
import {
  getConditionsForToolkit,
  getCarriersForToolkit,
  lookupCarrierOutcomes,
  searchConditionsByTerms,
} from "./data";

describe("carrier matrix integrity (guards against silent data corruption)", () => {
  it("FEX exposes 287 conditions across 10 carrier products", () => {
    expect(getConditionsForToolkit("FEX")).toHaveLength(287);
    expect(getCarriersForToolkit("FEX")).toHaveLength(10);
  });

  it("SIUL exposes 287 conditions across 3 carrier products", () => {
    expect(getConditionsForToolkit("SIUL")).toHaveLength(287);
    expect(getCarriersForToolkit("SIUL")).toHaveLength(3);
  });

  it("every condition carries a non-empty name and category", () => {
    for (const c of getConditionsForToolkit("FEX")) {
      expect(c.condition.length).toBeGreaterThan(0);
      expect(typeof c.category).toBe("string");
    }
  });
});

describe("lookupCarrierOutcomes — the deterministic match a wrong answer would corrupt", () => {
  const sample = getConditionsForToolkit("FEX")[0].condition;

  it("returns a full per-carrier outcome grid for a known condition", () => {
    const [res] = lookupCarrierOutcomes("FEX", [sample]);
    expect(res.condition).toBe(sample);
    const carriers = Object.keys(res.carriers);
    expect(carriers).toHaveLength(10);
    for (const name of carriers) {
      expect(res.carriers[name].outcome.length).toBeGreaterThan(0);
    }
  });

  it("silently skips unknown conditions (never invents a row)", () => {
    expect(lookupCarrierOutcomes("FEX", ["Not A Real Condition 12345"])).toEqual([]);
    const mixed = lookupCarrierOutcomes("FEX", [sample, "Bogus"]);
    expect(mixed).toHaveLength(1);
    expect(mixed[0].condition).toBe(sample);
  });
});

describe("searchConditionsByTerms", () => {
  it("substring-matches condition names", () => {
    const res = searchConditionsByTerms("FEX", ["diabetes"]);
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((r) => r.condition.toLowerCase().includes("diabetes"))).toBe(true);
  });

  it("ignores terms shorter than 2 chars and empty input", () => {
    expect(searchConditionsByTerms("FEX", ["a"])).toEqual([]);
    expect(searchConditionsByTerms("FEX", [])).toEqual([]);
  });
});
