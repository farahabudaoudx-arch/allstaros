import { describe, expect, it } from "vitest";
import { countActiveDirects, gatewayActiveDirectWindow, isInSixWeekWindow, sixWeekWindowStart } from "./active-directs";

describe("six-week Active Directs window", () => {
  it("uses an inclusive 42-day window ending on the scorecard period end", () => {
    expect(sixWeekWindowStart("2026-08-31")).toBe("2026-07-21");
    expect(isInSixWeekWindow("2026-07-21", "2026-08-31")).toBe(true);
    expect(isInSixWeekWindow("2026-07-22", "2026-08-31")).toBe(true);
    expect(isInSixWeekWindow("2026-07-20", "2026-08-31")).toBe(false);
    expect(isInSixWeekWindow("2026-08-31", "2026-08-31")).toBe(true);
    expect(isInSixWeekWindow("2026-09-01", "2026-08-31")).toBe(false);
  });

  it.each([
    ["monthly", "2026-08-31", "2026-07-21"],
    ["quarterly", "2026-09-30", "2026-08-20"],
    ["annual", "2026-12-31", "2026-11-20"],
  ] as const)("moves the trailing window with a %s period end", (_kind, periodEnd, expectedStart) => {
    expect(sixWeekWindowStart(periodEnd)).toBe(expectedStart);
    expect(isInSixWeekWindow(expectedStart, periodEnd)).toBe(true);
  });

  it("rejects malformed activity dates without crashing", () => {
    expect(isInSixWeekWindow("not-a-date", "2026-08-31")).toBe(false);
    expect(() => sixWeekWindowStart("2026-02-30")).toThrow("valid calendar date");
  });
});

describe("provider week evidence", () => {
  it("keeps September week five in September even when downloaded in October", () => {
    expect(gatewayActiveDirectWindow({ reportDate: "2026-10-05", scorecardPeriodStart: "2026-09-01",
      scorecardPeriodEnd: "2026-09-30", gatewayWeekStart: "2026-09-28" }, "2026-09-30")).toBe(true);
  });
  it.each([
    ["2026-07-01", "2026-07-31", null],
    ["2026-08-01", "2026-08-31", true],
    ["2026-06-01", "2026-06-30", false],
  ])("uses only decisive month bounds for legacy scoped evidence %s", (start, end, expected) => {
    expect(gatewayActiveDirectWindow({ reportDate: "2026-08-28", scorecardPeriodStart: start as string,
      scorecardPeriodEnd: end as string }, "2026-08-31")).toBe(expected);
  });
  it("does not treat an impossible provider date as evidence", () => {
    expect(gatewayActiveDirectWindow({ reportDate: "2026-08-28", scorecardPeriodStart: "2026-08-01",
      scorecardPeriodEnd: "2026-08-31", gatewayWeekStart: "2026-02-31" }, "2026-08-31")).toBeNull();
  });
});

describe("countActiveDirects", () => {
  const people = [
    { id: "john", uplineId: null },
    { id: "mike", uplineId: "john" },
    { id: "sara", uplineId: "john" },
    { id: "billy", uplineId: "mike" },
    { id: "unrelated", uplineId: null },
  ];

  it("counts a qualifying direct but never a qualifying grandchild", () => {
    expect(countActiveDirects({
      builderId: "john",
      people,
      activePersonIds: ["john", "mike", "billy"],
      recentWriterIds: ["mike", "billy"],
    })).toBe(1);
  });

  it("counts multiple qualifying directs exactly once each", () => {
    expect(countActiveDirects({
      builderId: "john",
      people: [...people, { id: "mike", uplineId: "john" }],
      activePersonIds: ["mike", "sara"],
      recentWriterIds: ["mike", "mike", "sara"],
    })).toBe(2);
  });

  it("returns zero when only an indirect descendant has recent business", () => {
    expect(countActiveDirects({
      builderId: "john",
      people,
      activePersonIds: ["mike", "billy"],
      recentWriterIds: ["billy"],
    })).toBe(0);
  });

  it("requires direct + active + recent simultaneously", () => {
    expect(countActiveDirects({
      builderId: "john",
      people,
      activePersonIds: ["mike", "billy", "unrelated"],
      recentWriterIds: ["mike", "sara", "billy", "unrelated"],
    })).toBe(1);
  });

  it("treats missing/unknown active state as inactive", () => {
    expect(countActiveDirects({
      builderId: "john",
      people,
      activePersonIds: [],
      recentWriterIds: ["mike", "sara"],
    })).toBe(0);
  });

  it("ignores unrelated writers and malformed self-upline input safely", () => {
    expect(countActiveDirects({
      builderId: "john",
      people: [...people, { id: "john", uplineId: "john" }],
      activePersonIds: ["john", "unrelated"],
      recentWriterIds: ["john", "unrelated"],
    })).toBe(0);
  });
});
