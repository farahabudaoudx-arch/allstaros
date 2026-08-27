import { describe, expect, it } from "vitest";
import { validateClosedScorecardPeriod } from "./period";

describe("closed Scorecard periods", () => {
  it.each([
    ["monthly", "2026-08-01", "2026-08-31", "August 2026"],
    ["quarterly", "2026-07-01", "2026-09-30", "Q3 2026"],
    ["annual", "2025-01-01", "2025-12-31", "2025"],
  ] as const)("accepts an exact %s calendar period", (kind, start, end, label) => {
    expect(validateClosedScorecardPeriod({ kind, start, end, today: "2026-10-02" })).toEqual({ kind, start, end, label });
  });

  it("rejects partial and still-open periods", () => {
    expect(() => validateClosedScorecardPeriod({ kind: "quarterly", start: "2026-08-01", end: "2026-08-31", today: "2026-10-02" })).toThrow("calendar quarter");
    expect(() => validateClosedScorecardPeriod({ kind: "monthly", start: "2026-10-01", end: "2026-10-31", today: "2026-10-02" })).toThrow("closed");
  });
});
