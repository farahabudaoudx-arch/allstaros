import { describe, expect, it } from "vitest";

import { reconcileMonthlyBuilderTeamIp } from "./builder-period";

describe("monthly Builder Team IP reconciliation", () => {
  it("uses month-end MTD and reconstructs Ronny Bucica's missing July WTD buckets", () => {
    const metric = reconcileMonthlyBuilderTeamIp([
      {
        reportDate: "2026-07-07",
        periodType: "mtd",
        gatewayLabel: "July MTD",
        teamIpCents: 28_450_279,
        firstLegPercent: 44.21,
      },
      {
        reportDate: "2026-07-07",
        periodType: "wtd",
        gatewayLabel: "July Week 1",
        teamIpCents: 28_450_279,
        firstLegPercent: 44.21,
      },
      {
        reportDate: "2026-07-21",
        periodType: "mtd",
        gatewayLabel: "July MTD",
        teamIpCents: 63_360_884,
        firstLegPercent: 45.03,
      },
      {
        reportDate: "2026-07-21",
        periodType: "wtd",
        gatewayLabel: "July Week 3",
        teamIpCents: 17_460_753,
        firstLegPercent: 45.82,
      },
      {
        reportDate: "2026-07-31",
        periodType: "mtd",
        gatewayLabel: "July MTD",
        teamIpCents: 91_506_494,
        firstLegPercent: 45.17,
      },
      {
        reportDate: "2026-07-31",
        periodType: "wtd",
        gatewayLabel: "July Week 5",
        teamIpCents: 6_141_231,
        firstLegPercent: 46.11,
      },
    ]);

    expect(metric.teamIpCents).toBe(91_506_494);
    expect(metric.firstLegPercent).toBe(45.17);
    expect(metric.trend.map(({ label, teamIpCents }) => ({ label, teamIpCents }))).toEqual([
      { label: "Week 1", teamIpCents: 28_450_279 },
      { label: "Week 2", teamIpCents: 17_449_852 },
      { label: "Week 3", teamIpCents: 17_460_753 },
      { label: "Week 4", teamIpCents: 22_004_379 },
      { label: "Week 5", teamIpCents: 6_141_231 },
    ]);
    expect(metric.trend.map(({ share }) => share)).toEqual([31, 19, 19, 24, 7]);
    expect(metric.trend.reduce((sum, week) => sum + week.teamIpCents, 0)).toBe(91_506_494);
  });
});
