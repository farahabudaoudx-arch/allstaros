import { describe, expect, it } from "vitest";
import protectedFixture from "./fixtures/protected-producer-january-2026.json";
import {
  createProducerOverview,
  createScorecardScheduleFacts,
  createMonthlyProducerPreview,
  ISSUANCE_THRESHOLD_SUMMARY,
  issuanceStatusForMonthlyIp,
  type MonthlyProducerSource,
} from "./lifecycle";

const organizationRanks = {
  submittedAp: { rank: 8, population: 424 },
  dials: { rank: 20, population: 424 },
  contacts: { rank: 18, population: 424 },
  appointments: { rank: 12, population: 424 },
  presentations: { rank: 10, population: 424 },
  sales: { rank: 6, population: 424 },
};

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
  it("freezes expected workdays and tracker submissions as dated finalization facts", () => {
    expect(
      createScorecardScheduleFacts({
        periodStart: "2026-08-02",
        periodEnd: "2026-08-04",
        expectedWorkingDates: ["2026-08-03", "2026-08-04"],
        activityRows: [
          { entryDate: "2026-08-02", leads: 0, dials: 0, contacts: 0, appointments: 0, presentations: 0, sales: 0 },
          { entryDate: "2026-08-03", leads: 0, dials: 0, contacts: 0, appointments: 0, presentations: 0, sales: 0 },
        ],
      }),
    ).toEqual([
      { factDate: "2026-08-02", expectedWorkingDay: false, trackerSubmitted: true },
      { factDate: "2026-08-03", expectedWorkingDay: true, trackerSubmitted: true },
      { factDate: "2026-08-04", expectedWorkingDay: true, trackerSubmitted: false },
    ]);
  });

  it("builds the complete at-a-glance Producer overview without hiding missing tracking", () => {
    const overview = createProducerOverview({
      fullName: "Jordan Taylor",
      photoUrl: "/headshot-sample.png",
      submittedApCents: 2_412_648,
      currentIssuedIpCents: 4_580_978,
      priorIssuedIpCents: 0,
      rank: { rank: 3, population: 424, percentile: 100, movement: 2 },
      organizationRanks,
      activityRows: [
        { entryDate: "2026-08-03", leads: 12, dials: 100, contacts: 40, appointments: 10, presentations: 6, sales: 2 },
        { entryDate: "2026-08-04", leads: 0, dials: 0, contacts: 0, appointments: 0, presentations: 0, sales: 0 },
      ],
      expectedWorkingDates: null,
    });

    expect(overview).toMatchObject({
      producer: { fullName: "Jordan Taylor", role: "Producer" },
      submittedApCents: 2_412_648,
      priorIssuedIpCents: 0,
      growth: { kind: "new_baseline" },
      rank: { rank: 3, population: 424, percentile: 100, movement: 2 },
      activity: {
        availability: "tracked",
        trackedDays: 2,
        consistency: null,
        totals: { leads: 12, dials: 100, contacts: 40, appointments: 10, presentations: 6, sales: 2 },
        perTrackedDay: { leads: 6, dials: 50, contacts: 20, appointments: 5, presentations: 3, sales: 1 },
      },
    });
  });

  it("labels absent tracker submissions as missing rather than zero activity", () => {
    const overview = createProducerOverview({
      fullName: "Jordan Taylor",
      photoUrl: null,
      submittedApCents: 0,
      currentIssuedIpCents: 0,
      priorIssuedIpCents: null,
      rank: { rank: 20, population: 20, percentile: 5, movement: null },
      organizationRanks,
      activityRows: [],
      expectedWorkingDates: ["2026-08-03", "2026-08-04"],
    });

    expect(overview.activity.availability).toBe("missing");
    expect(overview.activity.loggedDates).toEqual([]);
    expect(overview.activity.expectedDates).toEqual(["2026-08-03", "2026-08-04"]);
    expect(overview.activity.consistency).toEqual({ loggedDays: 0, expectedDays: 2, percentage: 0 });
    expect(overview.activity.totals).toBeNull();
    expect(overview.activity.perTrackedDay).toBeNull();
  });

  it("labels a partially populated tracker row instead of turning missing fields into zero", () => {
    const overview = createProducerOverview({
      fullName: "Jordan Taylor",
      photoUrl: null,
      submittedApCents: null,
      currentIssuedIpCents: 0,
      priorIssuedIpCents: null,
      rank: { rank: 1, population: 1, percentile: 100, movement: null },
      organizationRanks,
      activityRows: [
        { entryDate: "2026-08-03", leads: null, dials: 10, contacts: 2, appointments: 1, presentations: 0, sales: 0 },
      ],
      expectedWorkingDates: ["2026-08-03"],
    });

    expect(overview.activity.availability).toBe("partial");
    expect(overview.activity.totals).toBeNull();
    expect(overview.activity.perTrackedDay).toBeNull();
  });

  it("does not count a tracker submission on a non-working day toward consistency", () => {
    const overview = createProducerOverview({
      fullName: "Jordan Taylor",
      photoUrl: null,
      submittedApCents: 0,
      currentIssuedIpCents: 0,
      priorIssuedIpCents: 0,
      rank: { rank: 1, population: 1, percentile: 100, movement: 0 },
      organizationRanks,
      activityRows: [
        { entryDate: "2026-08-02", leads: 0, dials: 0, contacts: 0, appointments: 0, presentations: 0, sales: 0 },
        { entryDate: "2026-08-03", leads: 0, dials: 0, contacts: 0, appointments: 0, presentations: 0, sales: 0 },
      ],
      expectedWorkingDates: ["2026-08-03", "2026-08-04"],
    });

    expect(overview.activity.consistency).toEqual({ loggedDays: 1, expectedDays: 2, percentage: 50 });
  });
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
    expect(preview.issuanceStatus).toBe("blue");
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
  ] as const)("maps monthly IP of %i cents to %s", (monthlyIp, expected) => {
    expect(issuanceStatusForMonthlyIp(monthlyIp)).toBe(expected);
  });

  it("classifies the exact monthly total rather than the weekly average", () => {
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

    expect(preview.totalIssuedIpCents).toBe(5_999_999);
    expect(preview.issuanceStatus).toBe("green");
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
