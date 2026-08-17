import { describe, expect, it } from "vitest";
import {
  createScorecardArtifacts,
  prepareScorecardRun,
  type ScorecardRunInput,
} from "./run";

function producerPayload(personId: string) {
  return {
    personId,
    payload: {
      preview: {
        cardType: "producer" as const,
        periodKind: "monthly" as const,
        lifecycleStatus: "in_progress" as const,
        producerId: personId,
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        periodLabel: "August 2026",
        title: "August 2026 Producer Scorecard",
        weeklyReports: [],
        totalIssuedIpCents: 0,
        averageWeeklyIpCents: 0,
        issuanceStatus: "red" as const,
        hasProduction: false,
        emptyMessage: "A starting point.",
        generatedAt: "2026-09-02T15:00:00.000Z",
        sourceCoverage: { source: "gateway" as const, reportCount: 4, completeThrough: "2026-08-28" },
      },
      overview: {
        producer: { fullName: personId, photoUrl: null, role: "Producer" as const },
        submittedApCents: 0,
        priorSubmittedApCents: 0,
        priorIssuedIpCents: 0,
        priorActivityTotals: null,
        growth: { kind: "new_baseline" as const, percentage: null },
        rank: { rank: 1, population: 4, percentile: 100, movement: null },
        organizationRanks: {
          submittedAp: { rank: 1, population: 4 }, dials: { rank: 1, population: 4 },
          contacts: { rank: 1, population: 4 }, appointments: { rank: 1, population: 4 },
          presentations: { rank: 1, population: 4 }, sales: { rank: 1, population: 4 },
        },
        activity: {
          availability: "missing" as const, trackedDays: 0, loggedDates: [], expectedDates: null,
          leadSpendCents: 0, consistency: null, totals: null, perTrackedDay: null,
        },
      },
    },
  };
}

function completeRun(): ScorecardRunInput {
  return {
    runId: "run-1",
    revision: 1,
    period: {
      kind: "monthly",
      start: "2026-08-01",
      end: "2026-08-31",
      label: "August 2026",
    },
    generatedAt: "2026-09-02T15:00:00.000Z",
    expectedReportDates: [
      "2026-08-07",
      "2026-08-14",
      "2026-08-21",
      "2026-08-28",
    ],
    people: [
      { id: "builder-a", fullName: "Alex Builder", email: "alex@example.com", photoUrl: null, uplineId: null, activeAtPeriodEnd: true, producerAtPeriodEnd: true, builderAtPeriodEnd: true },
      { id: "producer-b", fullName: "Blair Writer", email: "blair@example.com", photoUrl: null, uplineId: "builder-a", activeAtPeriodEnd: true, producerAtPeriodEnd: true, builderAtPeriodEnd: false },
      { id: "recruit-c", fullName: "Casey Recruit", email: "casey@example.com", photoUrl: null, uplineId: "producer-b", activeAtPeriodEnd: false, producerAtPeriodEnd: false, builderAtPeriodEnd: false },
      { id: "builder-d", fullName: "Devon Builder", email: "devon@example.com", photoUrl: null, uplineId: null, activeAtPeriodEnd: true, producerAtPeriodEnd: true, builderAtPeriodEnd: true },
      { id: "builder-e", fullName: "Emery Builder", email: "emery@example.com", photoUrl: null, uplineId: null, activeAtPeriodEnd: true, producerAtPeriodEnd: true, builderAtPeriodEnd: true },
    ],
    gatewayReports: [
      {
        id: "report-jul-24",
        periodType: "wtd",
        reportDate: "2026-07-24",
        status: "published",
        sourceChecksum: "jul-24",
        unmatchedCount: 0,
        ambiguousCount: 0,
        rows: [
          { personId: "producer-b", personalIpCents: 100_000, teamIpCents: 100_000, firstLegPercent: 20 },
        ],
      },
      {
        id: "report-jul-31",
        periodType: "wtd",
        reportDate: "2026-07-31",
        status: "published",
        sourceChecksum: "jul-31",
        unmatchedCount: 0,
        ambiguousCount: 0,
        rows: [],
      },
      {
        id: "report-aug-07",
        periodType: "wtd",
        reportDate: "2026-08-07",
        status: "published",
        sourceChecksum: "aug-07",
        unmatchedCount: 0,
        ambiguousCount: 0,
        rows: [
          { personId: "builder-a", personalIpCents: 50_000, teamIpCents: 1_000_000, firstLegPercent: 50 },
          { personId: "builder-d", personalIpCents: 0, teamIpCents: 2_000_000, firstLegPercent: 20 },
        ],
      },
      {
        id: "report-aug-14",
        periodType: "wtd",
        reportDate: "2026-08-14",
        status: "published",
        sourceChecksum: "aug-14",
        unmatchedCount: 0,
        ambiguousCount: 0,
        rows: [
          { personId: "builder-a", personalIpCents: 0, teamIpCents: 3_000_000, firstLegPercent: 25 },
          { personId: "producer-b", personalIpCents: 125_000, teamIpCents: 125_000, firstLegPercent: 10 },
          { personId: "builder-d", personalIpCents: 0, teamIpCents: 2_000_000, firstLegPercent: 20 },
        ],
      },
      {
        id: "report-aug-21",
        periodType: "wtd",
        reportDate: "2026-08-21",
        status: "published",
        sourceChecksum: "aug-21",
        unmatchedCount: 0,
        ambiguousCount: 0,
        rows: [],
      },
      {
        id: "report-aug-28",
        periodType: "wtd",
        reportDate: "2026-08-28",
        status: "published",
        sourceChecksum: "aug-28",
        unmatchedCount: 0,
        ambiguousCount: 0,
        rows: [],
      },
    ],
    recruits: [
      { id: "recruit-1", personId: "recruit-c", createdAt: "2026-08-05T14:00:00.000Z", removedAt: "2026-09-10T14:00:00.000Z" },
      { id: "recruit-2", personId: "producer-b", createdAt: "2026-08-20T14:00:00.000Z", removedAt: null },
    ],
    priorBuilderTeamIpCents: {
      "builder-a": 0,
      "builder-d": 2_000_000,
      "builder-e": 0,
    },
    priorBuilderCoverage: {
      "builder-a": "complete",
      "builder-d": "complete",
      "builder-e": "complete",
    },
    producerMetrics: [
      producerPayload("builder-a"),
      producerPayload("producer-b"),
      producerPayload("builder-d"),
      producerPayload("builder-e"),
    ],
    producerVerificationMetrics: [
      producerPayload("builder-a"),
      producerPayload("producer-b"),
      producerPayload("builder-d"),
      producerPayload("builder-e"),
    ],
  };
}

describe("Scorecard run", () => {
  it("prepares complete Producer and Builder datasets before marking the period ready", () => {
    const result = prepareScorecardRun(completeRun());

    expect(result.problems).toEqual([]);
    expect(result.status).toBe("ready");
    expect(result.summary).toEqual({
      eligibleProducers: 4,
      eligibleBuilders: 3,
      producerRows: 4,
      builderRows: 3,
      passed: 7,
      failed: 0,
      held: 0,
    });

    const alex = result.builderMetrics.find((row) => row.personId === "builder-a");
    expect(alex).toMatchObject({
      teamIpCents: 4_000_000,
      teamRank: { rank: 1, population: 2 },
      activeWriters: 2,
      firstLegPercent: 31.25,
      averageMonthlyIpPerWriterCents: 2_000_000,
      growth: { comparison: "mom", percentage: 100 },
      recruitsAdded: 2,
      recruitingRank: { rank: 1, population: 3 },
    });

    const devon = result.builderMetrics.find((row) => row.personId === "builder-d");
    expect(devon).toMatchObject({
      teamIpCents: 4_000_000,
      teamRank: { rank: 1, population: 2 },
      recruitingRank: { rank: 2, population: 3 },
    });

    const emery = result.builderMetrics.find((row) => row.personId === "builder-e");
    expect(emery).toMatchObject({
      teamIpCents: 0,
      teamRank: null,
      teamRankUnavailableReason: "not_represented_in_gateway",
      recruitingRank: { rank: 2, population: 3 },
    });
  });

  it("blocks the whole run when period-wide Gateway coverage is incomplete", () => {
    const input = completeRun();
    input.gatewayReports = input.gatewayReports
      .filter((report) => report.reportDate !== "2026-08-28")
      .map((report) => report.reportDate === "2026-08-21"
        ? { ...report, unmatchedCount: 1 }
        : report);

    const result = prepareScorecardRun(input);

    expect(result.status).toBe("blocked");
    expect(result.problems.map((problem) => problem.code)).toEqual([
      "missing_gateway_report",
      "incomplete_active_writer_window",
      "unmatched_gateway_people",
    ]);
    expect(result.summary.failed).toBe(3);
    expect(result.summary.passed).toBe(0);
  });

  it("blocks a positive-production report whose First Leg percentage is missing", () => {
    const input = completeRun();
    input.gatewayReports = input.gatewayReports.map((report) =>
      report.reportDate === "2026-08-07"
        ? {
            ...report,
            rows: report.rows.map((row) =>
              row.personId === "builder-a" ? { ...row, firstLegPercent: null } : row,
            ),
          }
        : report,
    );

    const result = prepareScorecardRun(input);

    expect(result.status).toBe("blocked");
    expect(result.problems).toContainEqual(expect.objectContaining({
      code: "missing_first_leg_percent",
      reportDate: "2026-08-07",
      personId: "builder-a",
    }));
  });

  it.each([
    ["monthly", 1, 2_000_000, "mom"],
    ["quarterly", 3, 666_667, "qoq"],
    ["annual", 12, 166_667, "yoy"],
  ] as const)("uses the fixed month divisor for %s periods", (kind, _months, expectedAverage, comparison) => {
    const input = completeRun();
    input.period.kind = kind;

    const result = prepareScorecardRun(input);
    const alex = result.builderMetrics.find((row) => row.personId === "builder-a");

    expect(alex?.averageMonthlyIpPerWriterCents).toBe(expectedAverage);
    expect(alex?.growth.comparison).toBe(comparison);
  });

  it("uses exactly the six latest organization reports for Active Writers", () => {
    const input = completeRun();
    input.people.push({
      id: "writer-old",
      fullName: "Old Writer",
      email: "old@example.com",
      photoUrl: null,
      uplineId: "builder-a",
      activeAtPeriodEnd: true,
      producerAtPeriodEnd: true,
      builderAtPeriodEnd: false,
    });
    input.producerMetrics.push(producerPayload("writer-old"));
    input.producerVerificationMetrics.push(producerPayload("writer-old"));
    input.gatewayReports.unshift({
      id: "report-jul-17",
      periodType: "wtd",
      reportDate: "2026-07-17",
      status: "published",
      sourceChecksum: "jul-17",
      unmatchedCount: 0,
      ambiguousCount: 0,
      rows: [{ personId: "writer-old", personalIpCents: 100_000, teamIpCents: 100_000, firstLegPercent: 10 }],
    });

    const result = prepareScorecardRun(input);

    expect(result.builderMetrics.find((row) => row.personId === "builder-a")?.activeWriters).toBe(2);
  });

  it("publishes separate idempotent Producer and Builder artifacts and delivery intents", () => {
    const input = completeRun();
    const prepared = prepareScorecardRun(input);

    const published = createScorecardArtifacts({ prepared, input });

    expect(published.snapshots).toHaveLength(7);
    expect(published.deliveries).toHaveLength(7);
    expect(published.snapshots.filter((snapshot) => snapshot.personId === "builder-a")).toEqual([
      expect.objectContaining({ cardType: "producer", lifecycleStatus: "final" }),
      expect.objectContaining({ cardType: "builder", lifecycleStatus: "final" }),
    ]);
    expect(published.deliveries.filter((delivery) => delivery.personId === "builder-a")).toEqual([
      expect.objectContaining({ deliveryType: "producer_email", status: "pending" }),
      expect.objectContaining({ deliveryType: "builder_email", status: "pending" }),
    ]);
    expect(new Set(published.deliveries.map((delivery) => delivery.idempotencyKey)).size).toBe(7);
  });

  it("does not create a partial artifact batch from a blocked run", () => {
    const input = completeRun();
    input.gatewayReports = input.gatewayReports.filter((report) => report.reportDate !== "2026-08-28");
    const prepared = prepareScorecardRun(input);

    expect(() => createScorecardArtifacts({ prepared, input })).toThrow(
      "fully validated Scorecard run",
    );
  });

  it("creates correction artifacts only for card rows whose visible payload changed", () => {
    const originalInput = completeRun();
    const original = createScorecardArtifacts({
      input: originalInput,
      prepared: prepareScorecardRun(originalInput),
    });
    const correctedInput = completeRun();
    correctedInput.runId = "run-2";
    correctedInput.revision = 2;
    correctedInput.gatewayReports = correctedInput.gatewayReports.map((report) =>
      report.reportDate === "2026-08-28"
        ? {
            ...report,
            rows: [{ personId: "builder-d", personalIpCents: 0, teamIpCents: 1, firstLegPercent: 20 }],
          }
        : report,
    );

    const correction = createScorecardArtifacts({
      input: correctedInput,
      prepared: prepareScorecardRun(correctedInput),
      priorSnapshots: original.snapshots,
    });

    expect(correction.snapshots.map(({ personId, cardType }) => `${personId}:${cardType}`)).toEqual([
      "builder-a:builder",
      "builder-d:builder",
    ]);
    expect(correction.snapshots.every((snapshot) => snapshot.lifecycleStatus === "corrected")).toBe(true);
    expect(correction.deliveries.every((delivery) => delivery.deliveryType === "builder_email")).toBe(true);
  });
});
