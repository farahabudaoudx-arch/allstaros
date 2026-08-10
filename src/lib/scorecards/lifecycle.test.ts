import { describe, expect, it } from "vitest";
import protectedFixture from "./fixtures/protected-producer-january-2026.json";
import {
  createMonthlyProducerPreview,
  ISSUANCE_THRESHOLD_SUMMARY,
  issuanceStatusForAverage,
  type MonthlyProducerSource,
} from "./lifecycle";

function source(overrides: Partial<MonthlyProducerSource> = {}): MonthlyProducerSource {
  return {
    producerId: "producer-1",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    periodLabel: "August 2026",
    reportDates: [
      { reportDate: "2026-08-07", label: "August Week 1" },
      { reportDate: "2026-08-14", label: "August Week 2" },
      { reportDate: "2026-08-21", label: "August Week 3" },
      { reportDate: "2026-08-28", label: "August Week 4" },
    ],
    producerRows: [
      { reportDate: "2026-08-07", personalIpCents: 1200000 },
      { reportDate: "2026-08-14", personalIpCents: 1800000 },
      { reportDate: "2026-08-21", personalIpCents: 2400000 },
      { reportDate: "2026-08-28", personalIpCents: 1600000 },
    ],
    generatedAt: "2026-08-29T14:00:00.000Z",
    ...overrides,
  };
}

describe("Scorecard lifecycle — monthly Producer preview", () => {
  it("derives the visible threshold guidance from the calculation constants", () => {
    expect(ISSUANCE_THRESHOLD_SUMMARY).toBe(
      "Green $30k+ · Blue $15k–$29,999.99 · Red below $15k",
    );
  });

  it("reproduces the manually verified protected Gateway snapshot", () => {
    const fixture = protectedFixture;
    const preview = createMonthlyProducerPreview({
      producerId: fixture.producerId,
      periodStart: fixture.period.start,
      periodEnd: fixture.period.end,
      periodLabel: fixture.period.label,
      reportDates: fixture.reports.map(({ reportDate, label }) => ({ reportDate, label })),
      producerRows: fixture.reports.map(({ reportDate, personalIpCents }) => ({
        reportDate,
        personalIpCents,
      })),
      generatedAt: "2026-08-10T12:00:00.000Z",
    });

    expect(preview).toMatchObject({
      cardType: "producer",
      periodKind: "monthly",
      lifecycleStatus: "in_progress",
      totalIssuedIpCents: fixture.expected.totalIssuedIpCents,
      averageWeeklyIpCents: fixture.expected.averageWeeklyIpCents,
      issuanceStatus: fixture.expected.issuanceStatus,
    });
    expect(preview.weeklyReports).toHaveLength(fixture.reports.length);
    expect(preview.totalIssuedIpCents).toBe(fixture.protection.monthEndMtdCents);
  });

  it("represents every organization report, including a missing producer row as zero", () => {
    const preview = createMonthlyProducerPreview(
      source({
        producerRows: [{ reportDate: "2026-08-14", personalIpCents: 1600000 }],
      }),
    );

    expect(preview.weeklyReports.map((week) => week.personalIpCents)).toEqual([
      0, 1600000, 0, 0,
    ]);
    expect(preview.totalIssuedIpCents).toBe(1600000);
    expect(preview.averageWeeklyIpCents).toBe(400000);
    expect(preview.issuanceStatus).toBe("red");
  });

  it("creates a useful red preview for an active producer with no production", () => {
    const preview = createMonthlyProducerPreview(source({ producerRows: [] }));

    expect(preview.hasProduction).toBe(false);
    expect(preview.weeklyReports).toHaveLength(4);
    expect(preview.totalIssuedIpCents).toBe(0);
    expect(preview.emptyMessage).toContain("starting point");
  });

  it.each([
    [1499999, "red"],
    [1500000, "blue"],
    [2999999, "blue"],
    [3000000, "green"],
  ] as const)("maps an average of %i cents to %s", (average, expected) => {
    expect(issuanceStatusForAverage(average)).toBe(expected);
  });

  it("does not round a below-threshold exact average into Blue", () => {
    const preview = createMonthlyProducerPreview(
      source({
        producerRows: [
          { reportDate: "2026-08-07", personalIpCents: 1_500_000 },
          { reportDate: "2026-08-14", personalIpCents: 1_500_000 },
          { reportDate: "2026-08-21", personalIpCents: 1_500_000 },
          { reportDate: "2026-08-28", personalIpCents: 1_499_999 },
        ],
      }),
    );

    expect(preview.averageWeeklyIpCents).toBe(1_500_000);
    expect(preview.issuanceStatus).toBe("red");
  });

  it("rejects duplicate report dates so a source cannot silently double-count", () => {
    expect(() =>
      createMonthlyProducerPreview(
        source({
          reportDates: [
            { reportDate: "2026-08-07", label: "Week 1" },
            { reportDate: "2026-08-07", label: "Week 1 duplicate" },
          ],
        }),
      ),
    ).toThrow(/duplicate/i);
  });
});
