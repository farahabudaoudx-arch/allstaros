import { describe, expect, it } from "vitest";
import {
  comparisonForPeriod,
  periodFactor,
  previousEquivalentPeriod,
  recentClosedScorecardPeriods,
  scaleCumulativeThreshold,
  scorecardPeriodFromStart,
  validateClosedScorecardPeriod,
} from "./period";

describe("Scorecard period construction", () => {
  it.each([
    ["monthly", "2026-08-01", "2026-08-31", "August 2026"],
    ["monthly", "2024-02-01", "2024-02-29", "February 2024"],
    ["quarterly", "2026-01-01", "2026-03-31", "Q1 2026"],
    ["quarterly", "2026-04-01", "2026-06-30", "Q2 2026"],
    ["quarterly", "2026-07-01", "2026-09-30", "Q3 2026"],
    ["quarterly", "2026-10-01", "2026-12-31", "Q4 2026"],
    ["annual", "2025-01-01", "2025-12-31", "2025"],
  ] as const)("constructs an exact %s period", (kind, start, end, label) => {
    expect(scorecardPeriodFromStart(kind, start)).toEqual({ kind, start, end, label });
  });

  it("derives equivalent previous periods across year boundaries", () => {
    expect(previousEquivalentPeriod({ kind: "monthly", start: "2026-01-01", end: "2026-01-31" })).toEqual({
      kind: "monthly", start: "2025-12-01", end: "2025-12-31", label: "December 2025",
    });
    expect(previousEquivalentPeriod({ kind: "quarterly", start: "2026-01-01", end: "2026-03-31" })).toEqual({
      kind: "quarterly", start: "2025-10-01", end: "2025-12-31", label: "Q4 2025",
    });
    expect(previousEquivalentPeriod({ kind: "quarterly", start: "2026-07-01", end: "2026-09-30" })).toEqual({
      kind: "quarterly", start: "2026-04-01", end: "2026-06-30", label: "Q2 2026",
    });
    expect(previousEquivalentPeriod({ kind: "annual", start: "2026-01-01", end: "2026-12-31" })).toEqual({
      kind: "annual", start: "2025-01-01", end: "2025-12-31", label: "2025",
    });
  });

  it("rejects malformed dates, partial periods, and unsupported period kinds", () => {
    expect(() => scorecardPeriodFromStart("monthly", "2026-02-30")).toThrow("valid ISO");
    expect(() => scorecardPeriodFromStart("quarterly", "2026-08-01")).toThrow("calendar quarter");
    expect(() => scorecardPeriodFromStart("annual", "2026-02-01")).toThrow("calendar year");
    expect(() => scorecardPeriodFromStart("bogus" as never, "2026-01-01")).toThrow("Unsupported");
    expect(() => previousEquivalentPeriod({ kind: "quarterly", start: "2026-07-01", end: "2026-08-31" })).toThrow("exact calendar period");
  });
});

describe("closed Scorecard periods", () => {
  it.each([
    ["monthly", "2026-08-01", "2026-08-31", "August 2026"],
    ["quarterly", "2026-07-01", "2026-09-30", "Q3 2026"],
    ["annual", "2025-01-01", "2025-12-31", "2025"],
  ] as const)("accepts an exact %s calendar period", (kind, start, end, label) => {
    expect(validateClosedScorecardPeriod({ kind, start, end, today: "2026-10-02" })).toEqual({ kind, start, end, label });
  });

  it("rejects partial and still-open periods", () => {
    expect(() => validateClosedScorecardPeriod({ kind: "quarterly", start: "2026-07-01", end: "2026-08-31", today: "2026-10-02" })).toThrow("calendar quarter");
    expect(() => validateClosedScorecardPeriod({ kind: "monthly", start: "2026-10-01", end: "2026-10-31", today: "2026-10-02" })).toThrow("closed");
    expect(() => validateClosedScorecardPeriod({ kind: "monthly", start: "2026-08-01", end: "2026-08-31", today: "not-a-date" })).toThrow("valid ISO");
  });
});

describe("recent closed Scorecard period choices", () => {
  it("offers only completed named month, quarter, and year periods", () => {
    const periods = recentClosedScorecardPeriods("2026-09-03", { monthly: 3, quarterly: 2, annual: 2 });
    expect(periods).toEqual([
      { kind: "monthly", start: "2026-08-01", end: "2026-08-31", label: "August 2026" },
      { kind: "monthly", start: "2026-07-01", end: "2026-07-31", label: "July 2026" },
      { kind: "monthly", start: "2026-06-01", end: "2026-06-30", label: "June 2026" },
      { kind: "quarterly", start: "2026-04-01", end: "2026-06-30", label: "Q2 2026" },
      { kind: "quarterly", start: "2026-01-01", end: "2026-03-31", label: "Q1 2026" },
      { kind: "annual", start: "2025-01-01", end: "2025-12-31", label: "2025" },
      { kind: "annual", start: "2024-01-01", end: "2024-12-31", label: "2024" },
    ]);
  });

  it("never offers the still-open current period and crosses year boundaries correctly", () => {
    const periods = recentClosedScorecardPeriods("2026-01-02", { monthly: 1, quarterly: 1, annual: 1 });
    expect(periods).toEqual([
      { kind: "monthly", start: "2025-12-01", end: "2025-12-31", label: "December 2025" },
      { kind: "quarterly", start: "2025-10-01", end: "2025-12-31", label: "Q4 2025" },
      { kind: "annual", start: "2025-01-01", end: "2025-12-31", label: "2025" },
    ]);
  });

  it("rejects an invalid today value", () => {
    expect(() => recentClosedScorecardPeriods("not-a-date")).toThrow("valid ISO date");
  });
});
describe("period scaling metadata", () => {
  it.each([
    ["monthly", 1, "mom"],
    ["quarterly", 3, "qoq"],
    ["annual", 12, "yoy"],
  ] as const)("maps %s to factor %i and comparison %s", (kind, factor, comparison) => {
    expect(periodFactor(kind)).toBe(factor);
    expect(comparisonForPeriod(kind)).toBe(comparison);
    expect(scaleCumulativeThreshold(500_000, kind)).toBe(500_000 * factor);
  });
});
