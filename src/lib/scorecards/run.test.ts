import { describe, expect, it } from "vitest";
import {
  createScorecardArtifacts,
  prepareScorecardRun,
  type ScorecardRunInput,
} from "./run";
import {
  parsePublishedScorecardSnapshotPayload,
  requirePublishedScorecardSnapshotPayload,
} from "./published-snapshot";
import { verifyPreparedScorecardRun, verifyPublishedScorecardArtifacts } from "./verifier";

function producerPayload(
  personId: string,
  period: ScorecardRunInput["period"] = {
    kind: "monthly",
    start: "2026-08-01",
    end: "2026-08-31",
    label: "August 2026",
  },
) {
  return {
    personId,
    payload: {
      preview: {
        cardType: "producer" as const,
        periodKind: period.kind,
        lifecycleStatus: "in_progress" as const,
        producerId: personId,
        periodStart: period.start,
        periodEnd: period.end,
        periodLabel: period.label,
        title: `${period.label} Producer Scorecard`,
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
        priorLeadSpendCents: 0,
        priorIssuedIpCents: 0,
        priorActivityTotals: null,
        growth: { kind: "new_baseline" as const, percentage: null },
        rank: { rank: 1, population: 4, percentile: 100, movement: null },
        organizationRanks: {
          submittedAp: { rank: 1, population: 4 }, leadSpend: { rank: 1, population: 4 },
          dials: { rank: 1, population: 4 }, contacts: { rank: 1, population: 4 },
          presentations: { rank: 1, population: 4 }, sales: { rank: 1, population: 4 },
          trackingConsistency: { rank: null, population: 0 },
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
    priorPeriod: {
      kind: "monthly",
      start: "2026-07-01",
      end: "2026-07-31",
      label: "July 2026",
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
      {
        id: "recruit-1",
        personId: "recruit-c",
        createdAt: "2026-08-05T14:00:00.000Z",
        removedAt: "2026-09-10T14:00:00.000Z",
        npn: null,
        npnStatus: "missing",
        npnVerifiedAt: null,
      },
      {
        id: "recruit-2",
        personId: "producer-b",
        createdAt: "2026-08-20T14:00:00.000Z",
        removedAt: null,
        npn: "12345678",
        npnStatus: "verified",
        npnVerifiedAt: "2026-08-20T14:00:00.000Z",
      },
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
      activeWriters: 1,
      firstLegPercent: 31.25,
      averageMonthlyIpPerWriterCents: 2_000_000,
      growth: { comparison: "mom", percentage: 100 },
      recruitsAdded: 1,
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


  it("keeps Builder team IP on Gateway team_ip_cents even when personal IP differs", () => {
    const input = completeRun();
    const firstAlexRow = input.gatewayReports
      .find((report) => report.id === "report-aug-07")!
      .rows.find((row) => row.personId === "builder-a")!;

    expect(firstAlexRow.personalIpCents).toBe(50_000);
    expect(firstAlexRow.teamIpCents).toBe(1_000_000);

    const result = prepareScorecardRun(input);
    expect(result.builderMetrics.find((row) => row.personId === "builder-a")?.teamIpCents).toBe(4_000_000);
  });

  it("accepts distinct canonical Gateway weeks that share the same File Date without duplicate-person errors", () => {
    const input = completeRun();
    input.expectedReportDates = ["2026-08-14", "2026-08-21", "2026-08-28"];
    input.gatewayReports = input.gatewayReports.map((report) => {
      if (report.id === "report-aug-07") {
        return {
          ...report,
          reportDate: "2026-08-14",
          scorecardPeriodStart: "2026-08-01",
          scorecardPeriodEnd: "2026-08-31",
          gatewayWeekOrdinal: 1,
          gatewayPeriodFinal: false,
        };
      }
      if (report.id === "report-aug-14") {
        return {
          ...report,
          scorecardPeriodStart: "2026-08-01",
          scorecardPeriodEnd: "2026-08-31",
          gatewayWeekOrdinal: 2,
          gatewayPeriodFinal: false,
        };
      }
      return report;
    });

    const result = prepareScorecardRun(input);

    expect(result.status).toBe("ready");
    expect(result.problems).toEqual([]);
    expect(result.builderMetrics.find((row) => row.personId === "builder-a")?.teamIpCents).toBe(4_000_000);
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
    [
      { kind: "monthly", start: "2026-08-01", end: "2026-08-31", label: "August 2026" },
      { kind: "monthly", start: "2026-07-01", end: "2026-07-31", label: "July 2026" },
      2_000_000,
      "mom",
    ],
    [
      { kind: "quarterly", start: "2026-07-01", end: "2026-09-30", label: "Q3 2026" },
      { kind: "quarterly", start: "2026-04-01", end: "2026-06-30", label: "Q2 2026" },
      666_667,
      "qoq",
    ],
    [
      { kind: "annual", start: "2026-01-01", end: "2026-12-31", label: "2026" },
      { kind: "annual", start: "2025-01-01", end: "2025-12-31", label: "2025" },
      166_667,
      "yoy",
    ],
  ] as const)("keeps Avg IP/Writer monthly-normalized for %s periods", (period, priorPeriod, expectedAverage, comparison) => {
    const input = completeRun();
    input.period = period;
    input.priorPeriod = priorPeriod;
    input.producerMetrics = input.producerMetrics.map((metric) => producerPayload(metric.personId, period));
    input.producerVerificationMetrics = input.producerVerificationMetrics.map((metric) => producerPayload(metric.personId, period));

    const result = prepareScorecardRun(input);
    const alex = result.builderMetrics.find((row) => row.personId === "builder-a");

    expect(result.status).toBe("ready");
    expect(alex?.averageMonthlyIpPerWriterCents).toBe(expectedAverage);
    expect(alex?.monthCount).toBe(period.kind === "annual" ? 12 : period.kind === "quarterly" ? 3 : 1);
    expect(alex?.growth.comparison).toBe(comparison);
  });

  it("blocks a run when Producer frozen period metadata disagrees with the run period", () => {
    const input = completeRun();
    input.producerMetrics[0] = producerPayload(input.producerMetrics[0].personId, {
      kind: "monthly",
      start: "2026-07-01",
      end: "2026-07-31",
      label: "July 2026",
    });

    const result = prepareScorecardRun(input);

    expect(result.status).toBe("blocked");
    expect(result.problems).toContainEqual(expect.objectContaining({
      code: "invalid_producer_period",
      personId: "builder-a",
    }));
  });

  it("blocks quarterly Growth when the supplied prior period is only one month", () => {
    const input = completeRun();
    input.period = { kind: "quarterly", start: "2026-07-01", end: "2026-09-30", label: "Q3 2026" };
    input.priorPeriod = { kind: "monthly", start: "2026-06-01", end: "2026-06-30", label: "June 2026" };
    input.producerMetrics = input.producerMetrics.map((metric) => producerPayload(metric.personId, input.period));
    input.producerVerificationMetrics = input.producerVerificationMetrics.map((metric) => producerPayload(metric.personId, input.period));

    const result = prepareScorecardRun(input);

    expect(result.status).toBe("blocked");
    expect(result.problems).toContainEqual(expect.objectContaining({
      code: "invalid_comparison_period",
    }));
  });

  it("blocks annual Growth when the supplied prior period is not the previous year", () => {
    const input = completeRun();
    input.period = { kind: "annual", start: "2026-01-01", end: "2026-12-31", label: "2026" };
    input.priorPeriod = { kind: "quarterly", start: "2025-10-01", end: "2025-12-31", label: "Q4 2025" };
    input.producerMetrics = input.producerMetrics.map((metric) => producerPayload(metric.personId, input.period));
    input.producerVerificationMetrics = input.producerVerificationMetrics.map((metric) => producerPayload(metric.personId, input.period));

    const result = prepareScorecardRun(input);

    expect(result.status).toBe("blocked");
    expect(result.problems).toContainEqual(expect.objectContaining({
      code: "invalid_comparison_period",
    }));
  });

  it("keeps Avg IP/Writer on the six latest organization reports while stale direct business does not count", () => {
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

    const alex = result.builderMetrics.find((row) => row.personId === "builder-a");
    expect(alex?.activeWriters).toBe(1);
    expect(alex?.averageMonthlyIpPerWriterCents).toBe(2_000_000);
  });

  it("counts a direct writer exactly on the inclusive six-week boundary", () => {
    const input = completeRun();
    input.people.push({
      id: "boundary-direct",
      fullName: "Boundary Direct",
      email: "boundary@example.com",
      photoUrl: null,
      uplineId: "builder-a",
      activeAtPeriodEnd: true,
      producerAtPeriodEnd: false,
      builderAtPeriodEnd: false,
    });
    input.gatewayReports.unshift({
      id: "report-jul-21-boundary",
      periodType: "wtd",
      reportDate: "2026-07-21",
      status: "published",
      sourceChecksum: "jul-21-boundary",
      unmatchedCount: 0,
      ambiguousCount: 0,
      rows: [{ personId: "boundary-direct", personalIpCents: 100_000, teamIpCents: 100_000, firstLegPercent: 10 }],
    });

    const alex = prepareScorecardRun(input).builderMetrics.find((row) => row.personId === "builder-a");
    expect(alex?.activeWriters).toBe(2);
    expect(alex?.averageMonthlyIpPerWriterCents).toBe(2_000_000);
  });

  it("excludes direct business immediately outside the six-week boundary", () => {
    const input = completeRun();
    input.people.push({
      id: "outside-direct",
      fullName: "Outside Direct",
      email: "outside@example.com",
      photoUrl: null,
      uplineId: "builder-a",
      activeAtPeriodEnd: true,
      producerAtPeriodEnd: false,
      builderAtPeriodEnd: false,
    });
    input.gatewayReports.unshift({
      id: "report-jul-20-outside",
      periodType: "wtd",
      reportDate: "2026-07-20",
      status: "published",
      sourceChecksum: "jul-20-outside",
      unmatchedCount: 0,
      ambiguousCount: 0,
      rows: [{ personId: "outside-direct", personalIpCents: 100_000, teamIpCents: 100_000, firstLegPercent: 10 }],
    });

    expect(prepareScorecardRun(input).builderMetrics.find((row) => row.personId === "builder-a")?.activeWriters).toBe(1);
  });

  it("excludes inactive directs and active producing grandchildren", () => {
    const input = completeRun();
    input.people.push({
      id: "inactive-direct",
      fullName: "Inactive Direct",
      email: "inactive@example.com",
      photoUrl: null,
      uplineId: "builder-a",
      activeAtPeriodEnd: false,
      producerAtPeriodEnd: false,
      builderAtPeriodEnd: false,
    });
    input.people = input.people.map((person) => person.id === "recruit-c"
      ? { ...person, activeAtPeriodEnd: true }
      : person);
    const aug21 = input.gatewayReports.find((report) => report.id === "report-aug-21")!;
    aug21.rows.push(
      { personId: "inactive-direct", personalIpCents: 100_000, teamIpCents: 100_000, firstLegPercent: 10 },
      { personId: "recruit-c", personalIpCents: 100_000, teamIpCents: 100_000, firstLegPercent: 10 },
    );

    expect(prepareScorecardRun(input).builderMetrics.find((row) => row.personId === "builder-a")?.activeWriters).toBe(1);
  });

  it("counts only the actually licensed recruit in the signup + licensing + licensed fixture", () => {
    const input = completeRun();
    input.recruits = input.recruits.map((recruit) => recruit.personId === "producer-b"
      ? { ...recruit, npn: null, npnStatus: "pending_license", npnVerifiedAt: null }
      : recruit);
    input.people.push({
      id: "licensed-c",
      fullName: "Licensed Recruit",
      email: "licensed@example.com",
      photoUrl: null,
      uplineId: "producer-b",
      activeAtPeriodEnd: false,
      producerAtPeriodEnd: false,
      builderAtPeriodEnd: false,
    });
    input.recruits.push({
      id: "recruit-licensed",
      personId: "licensed-c",
      createdAt: "2026-07-12T12:00:00.000Z",
      removedAt: null,
      npn: "22223333",
      npnStatus: "verified",
      npnVerifiedAt: "2026-08-18T18:00:00.000Z",
    });

    const alex = prepareScorecardRun(input).builderMetrics.find((row) => row.personId === "builder-a");
    expect(alex?.recruitsAdded).toBe(1);
  });

  it("attributes Recruits Licensed to NPN verification time rather than recruit signup time", () => {
    const input = completeRun();
    input.recruits = input.recruits.map((recruit) => recruit.personId === "producer-b"
      ? { ...recruit, createdAt: "2026-08-15T18:00:00.000Z", npnVerifiedAt: "2026-07-31T20:00:00.000Z" }
      : recruit);
    expect(prepareScorecardRun(input).builderMetrics.find((row) => row.personId === "builder-a")?.recruitsAdded).toBe(0);

    input.recruits = input.recruits.map((recruit) => recruit.personId === "producer-b"
      ? { ...recruit, createdAt: "2026-07-01T18:00:00.000Z", npnVerifiedAt: "2026-08-01T05:00:00.000Z" }
      : recruit);
    expect(prepareScorecardRun(input).builderMetrics.find((row) => row.personId === "builder-a")?.recruitsAdded).toBe(1);
  });

  it("deduplicates licensed recruit records and excludes unrelated or missing hierarchy identities", () => {
    const input = completeRun();
    input.recruits.push(
      { ...input.recruits[1], id: "recruit-duplicate" },
      {
        id: "recruit-missing-person",
        personId: "missing-person",
        createdAt: "2026-08-10T12:00:00.000Z",
        removedAt: null,
        npn: "44445555",
        npnStatus: "verified",
        npnVerifiedAt: "2026-08-10T12:00:00.000Z",
      },
    );
    input.people.push({
      id: "devon-recruit",
      fullName: "Devon Recruit",
      email: "devon-recruit@example.com",
      photoUrl: null,
      uplineId: "builder-d",
      activeAtPeriodEnd: false,
      producerAtPeriodEnd: false,
      builderAtPeriodEnd: false,
    });
    input.recruits.push({
      id: "devon-recruit-row",
      personId: "devon-recruit",
      createdAt: "2026-08-10T12:00:00.000Z",
      removedAt: null,
      npn: "55556666",
      npnStatus: "verified",
      npnVerifiedAt: "2026-08-10T12:00:00.000Z",
    });

    const result = prepareScorecardRun(input);
    expect(result.builderMetrics.find((row) => row.personId === "builder-a")?.recruitsAdded).toBe(1);
    expect(result.builderMetrics.find((row) => row.personId === "builder-d")?.recruitsAdded).toBe(1);
  });

  it("publishes separate idempotent Producer and Builder artifacts with complete frozen visible payloads", () => {
    const input = completeRun();
    const prepared = prepareScorecardRun(input);

    const published = createScorecardArtifacts({ prepared, input });
    const repeated = createScorecardArtifacts({ prepared, input });

    expect(repeated).toEqual(published);
    expect(published.snapshots).toHaveLength(7);
    expect(published.deliveries).toHaveLength(7);
    expect(published.snapshots.filter((snapshot) => snapshot.personId === "builder-a")).toEqual([
      expect.objectContaining({ cardType: "producer", lifecycleStatus: "final" }),
      expect.objectContaining({ cardType: "builder", lifecycleStatus: "final" }),
    ]);
    const producer = parsePublishedScorecardSnapshotPayload(
      published.snapshots.find((snapshot) => snapshot.personId === "builder-a" && snapshot.cardType === "producer")!.visiblePayload,
    );
    const builder = parsePublishedScorecardSnapshotPayload(
      published.snapshots.find((snapshot) => snapshot.personId === "builder-a" && snapshot.cardType === "builder")!.visiblePayload,
    );
    expect(producer).toEqual(expect.objectContaining({
      cardType: "producer",
      period: expect.objectContaining({ label: "August 2026", previous: expect.objectContaining({ label: "July 2026" }) }),
      score: expect.objectContaining({ ratings: expect.any(Object), overall: expect.any(Number) }),
    }));
    expect(builder).toEqual(expect.objectContaining({
      cardType: "builder",
      member: { fullName: "Alex Builder", photoUrl: null },
      period: expect.objectContaining({ label: "August 2026", previous: expect.objectContaining({ label: "July 2026" }) }),
      metricPayload: expect.objectContaining({
        performance: expect.any(Object),
        previousPerformance: expect.any(Object),
      }),
      score: expect.objectContaining({ ratings: expect.any(Object), total: expect.any(Number), average: expect.any(Number) }),
    }));
    expect(published.deliveries.filter((delivery) => delivery.personId === "builder-a")).toEqual([
      expect.objectContaining({ deliveryType: "producer_email", status: "pending" }),
      expect.objectContaining({ deliveryType: "builder_email", status: "pending" }),
    ]);
    expect(new Set(published.deliveries.map((delivery) => delivery.idempotencyKey)).size).toBe(7);
  });

  it("freezes only approved photos and strips non-approved URLs from scorecard artifacts", () => {
    const input = completeRun();
    const approvedUrl = "https://example.com/approved-builder-a.jpg";
    const pendingUrl = "https://example.com/pending-producer-b.jpg";
    const rejectedUrl = "https://example.com/rejected-builder-d.jpg";
    const missingStatusUrl = "https://example.com/missing-status-builder-e.jpg";
    const photoByPerson = new Map([
      ["builder-a", approvedUrl],
      ["producer-b", pendingUrl],
      ["builder-d", rejectedUrl],
      ["builder-e", missingStatusUrl],
    ]);

    input.people = input.people.map((person) => {
      const photoUrl = photoByPerson.get(person.id);
      if (!photoUrl) return person;
      const photoReviewStatus = person.id === "builder-a"
        ? "approved"
        : person.id === "producer-b"
          ? "pending"
          : person.id === "builder-d"
            ? "rejected"
            : null;
      return { ...person, photoUrl, photoReviewStatus };
    });
    for (const metrics of [input.producerMetrics, input.producerVerificationMetrics]) {
      for (const metric of metrics) {
        const photoUrl = photoByPerson.get(metric.personId);
        if (photoUrl) metric.payload.overview.producer.photoUrl = photoUrl;
      }
    }

    const prepared = prepareScorecardRun(input);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") throw new Error("Expected a ready scorecard run.");

    expect(prepared.producerMetrics.find((metric) => metric.personId === "builder-a")?.payload.overview.producer.photoUrl).toBe(approvedUrl);
    expect(prepared.producerMetrics.find((metric) => metric.personId === "producer-b")?.payload.overview.producer.photoUrl).toBeNull();
    expect(prepared.producerMetrics.find((metric) => metric.personId === "builder-d")?.payload.overview.producer.photoUrl).toBeNull();
    expect(prepared.producerMetrics.find((metric) => metric.personId === "builder-e")?.payload.overview.producer.photoUrl).toBeNull();

    const published = createScorecardArtifacts({ prepared, input });
    const memberPhoto = (personId: string, cardType: "producer" | "builder") =>
      parsePublishedScorecardSnapshotPayload(
        published.snapshots.find((snapshot) => snapshot.personId === personId && snapshot.cardType === cardType)!.visiblePayload,
      )?.member.photoUrl;

    expect(memberPhoto("builder-a", "producer")).toBe(approvedUrl);
    expect(memberPhoto("builder-a", "builder")).toBe(approvedUrl);
    expect(memberPhoto("producer-b", "producer")).toBeNull();
    expect(memberPhoto("builder-d", "producer")).toBeNull();
    expect(memberPhoto("builder-d", "builder")).toBeNull();
    expect(memberPhoto("builder-e", "producer")).toBeNull();
    expect(memberPhoto("builder-e", "builder")).toBeNull();

    const serialized = JSON.stringify(published.snapshots);
    expect(serialized).toContain(approvedUrl);
    expect(serialized).not.toContain(pendingUrl);
    expect(serialized).not.toContain(rejectedUrl);
    expect(serialized).not.toContain(missingStatusUrl);
    expect(verifyPublishedScorecardArtifacts(input, prepared, published.snapshots)).toEqual({ valid: true, problems: [] });
  });

  it("keeps a published snapshot frozen after representative upstream source changes while a new draft recalculates", () => {
    const input = completeRun();
    const setProducerSource = (issuedIpCents: number, leadSpendCents: number, dayCount: number) => {
      const dates: string[] = [];
      for (let day = 1; day <= 31 && dates.length < dayCount; day += 1) {
        const date = `2026-08-${String(day).padStart(2, "0")}`;
        if (new Date(`${date}T00:00:00.000Z`).getUTCDay() !== 0) dates.push(date);
      }
      for (const collection of [input.producerMetrics, input.producerVerificationMetrics]) {
        const row = collection.find((metric) => metric.personId === "builder-a")!;
        row.payload.preview.totalIssuedIpCents = issuedIpCents;
        row.payload.overview.activity.leadSpendCents = leadSpendCents;
        row.payload.overview.activity.loggedDates = dates;
      }
    };
    setProducerSource(3_000_000, 600_000, 20);

    const preparedAtPublish = prepareScorecardRun(input);
    const published = createScorecardArtifacts({ prepared: preparedAtPublish, input });
    const producerSnapshot = published.snapshots.find(
      (snapshot) => snapshot.personId === "builder-a" && snapshot.cardType === "producer",
    )!;
    const builderSnapshot = published.snapshots.find(
      (snapshot) => snapshot.personId === "builder-a" && snapshot.cardType === "builder",
    )!;
    const persistedProducerJson = JSON.stringify(producerSnapshot.visiblePayload);
    const persistedBuilderJson = JSON.stringify(builderSnapshot.visiblePayload);
    const producerAtPublish = JSON.parse(persistedProducerJson) as Record<string, unknown>;
    const builderAtPublish = JSON.parse(persistedBuilderJson) as Record<string, unknown>;

    setProducerSource(40_000_000, 10_000_000, 24);
    input.gatewayReports = input.gatewayReports.map((report) => ({
      ...report,
      rows: report.rows.map((row) => row.personId === "builder-a"
        ? { ...row, teamIpCents: row.teamIpCents + 5_000_000 }
        : row),
    }));
    input.recruits = input.recruits.map((recruit) => recruit.personId === "producer-b"
      ? { ...recruit, npnStatus: "submitted" }
      : recruit);

    const recalculatedDraft = prepareScorecardRun(input);
    const recalculatedArtifacts = createScorecardArtifacts({ prepared: recalculatedDraft, input });
    const recalculatedProducer = recalculatedArtifacts.snapshots.find(
      (snapshot) => snapshot.personId === "builder-a" && snapshot.cardType === "producer",
    )!.visiblePayload;
    const recalculatedBuilder = recalculatedArtifacts.snapshots.find(
      (snapshot) => snapshot.personId === "builder-a" && snapshot.cardType === "builder",
    )!.visiblePayload;

    expect(recalculatedDraft.status).toBe("ready");
    expect(recalculatedDraft.builderMetrics.find((metric) => metric.personId === "builder-a")?.teamIpCents)
      .not.toBe(preparedAtPublish.builderMetrics.find((metric) => metric.personId === "builder-a")?.teamIpCents);
    expect(recalculatedDraft.builderMetrics.find((metric) => metric.personId === "builder-a")?.recruitsAdded).toBe(0);
    expect(recalculatedProducer).not.toEqual(producerAtPublish);
    expect(recalculatedBuilder).not.toEqual(builderAtPublish);

    const reloadedProducer = requirePublishedScorecardSnapshotPayload({
      id: producerSnapshot.id,
      cardType: producerSnapshot.cardType,
      periodKind: producerSnapshot.period.kind,
      periodStart: producerSnapshot.period.start,
      periodEnd: producerSnapshot.period.end,
      kpiResults: JSON.parse(persistedProducerJson),
    });
    const reloadedBuilder = requirePublishedScorecardSnapshotPayload({
      id: builderSnapshot.id,
      cardType: builderSnapshot.cardType,
      periodKind: builderSnapshot.period.kind,
      periodStart: builderSnapshot.period.start,
      periodEnd: builderSnapshot.period.end,
      kpiResults: JSON.parse(persistedBuilderJson),
    });
    expect(reloadedProducer).toEqual(producerAtPublish);
    expect(reloadedBuilder).toEqual(builderAtPublish);
  });

  it("independent publication verification rejects tampered frozen stars", () => {
    const input = completeRun();
    const prepared = prepareScorecardRun(input);
    const published = createScorecardArtifacts({ prepared, input });
    const tampered = structuredClone(published.snapshots);
    const producer = tampered.find((snapshot) => snapshot.cardType === "producer" && snapshot.personId === "builder-a")!;
    const payload = producer.visiblePayload as unknown as { score: { overall: number } };
    payload.score.overall = 5;

    const verification = verifyPublishedScorecardArtifacts(input, prepared, tampered);

    expect(verification.valid).toBe(false);
    expect(verification.problems).toContainEqual(expect.objectContaining({
      cardType: "producer",
      personId: "builder-a",
      field: "score",
    }));
  });

  it("targets exactly one Producer card for a dual-role person and leaves unrelated people out", () => {
    const input = completeRun();
    input.target = { personId: "builder-a", cardType: "producer" };
    input.producerMetrics = [producerPayload("builder-a")];
    input.producerVerificationMetrics = [producerPayload("builder-a")];

    const prepared = prepareScorecardRun(input);

    expect(prepared.status).toBe("ready");
    expect(prepared.summary).toMatchObject({
      eligibleProducers: 1,
      eligibleBuilders: 0,
      producerRows: 1,
      builderRows: 0,
    });
    expect(prepared.producerMetrics.map((metric) => metric.personId)).toEqual(["builder-a"]);
    expect(prepared.builderMetrics).toEqual([]);

    const artifacts = createScorecardArtifacts({ prepared, input });
    expect(artifacts.snapshots.map(({ personId, cardType }) => `${personId}:${cardType}`)).toEqual([
      "builder-a:producer",
    ]);
  });

  it("targets exactly one Builder card while bounded subtree support contributes without Producer artifacts", () => {
    const input = completeRun();
    input.target = { personId: "builder-a", cardType: "builder" };
    input.producerMetrics = [];
    input.producerVerificationMetrics = [];
    input.builderProductionSupport = [{
      personId: "producer-b",
      current: { dials: 9, contacts: 4, presentations: 3, sales: 2, apCents: 125_000 },
      prior: { dials: 5, contacts: 3, presentations: 2, sales: 1, apCents: 75_000 },
    }];

    const prepared = prepareScorecardRun(input);

    expect(prepared.status).toBe("ready");
    expect(prepared.summary).toMatchObject({
      eligibleProducers: 0,
      eligibleBuilders: 1,
      producerRows: 0,
      builderRows: 1,
    });
    expect(prepared.producerMetrics).toEqual([]);
    expect(prepared.builderMetrics.map((metric) => metric.personId)).toEqual(["builder-a"]);
    expect(prepared.builderMetrics[0].performance.teamDials.value).toBe(9);
    expect(prepared.builderMetrics[0].performance.teamAp.value).toBe(125_000);
    expect(prepared.builderMetrics[0].previousPerformance.teamDials).toBe(5);
    expect(prepared.builderMetrics[0].previousPerformance.teamAp).toBe(75_000);

    const artifacts = createScorecardArtifacts({ prepared, input });
    expect(artifacts.snapshots.map(({ personId, cardType }) => `${personId}:${cardType}`)).toEqual([
      "builder-a:builder",
    ]);
  });

  it("keeps Producer and Builder targets distinct for the same dual-role person", () => {
    const producerInput = completeRun();
    producerInput.target = { personId: "builder-a", cardType: "producer" };
    producerInput.producerMetrics = [producerPayload("builder-a")];
    producerInput.producerVerificationMetrics = [producerPayload("builder-a")];
    const producerArtifacts = createScorecardArtifacts({
      input: producerInput,
      prepared: prepareScorecardRun(producerInput),
    });

    const builderInput = completeRun();
    builderInput.runId = "run-builder-target";
    builderInput.target = { personId: "builder-a", cardType: "builder" };
    builderInput.producerMetrics = [];
    builderInput.producerVerificationMetrics = [];
    builderInput.builderProductionSupport = [];
    const builderArtifacts = createScorecardArtifacts({
      input: builderInput,
      prepared: prepareScorecardRun(builderInput),
    });

    expect(producerArtifacts.snapshots).toHaveLength(1);
    expect(producerArtifacts.snapshots[0]).toMatchObject({ personId: "builder-a", cardType: "producer" });
    expect(builderArtifacts.snapshots).toHaveLength(1);
    expect(builderArtifacts.snapshots[0]).toMatchObject({ personId: "builder-a", cardType: "builder" });
  });

  it("fails closed when the requested target card is not applicable at period end", () => {
    const input = completeRun();
    input.target = { personId: "producer-b", cardType: "builder" };
    input.producerMetrics = [];
    input.producerVerificationMetrics = [];

    const prepared = prepareScorecardRun(input);

    expect(prepared.status).toBe("blocked");
    expect(prepared.problems).toContainEqual(expect.objectContaining({
      code: "invalid_target",
      personId: "producer-b",
    }));
    expect(prepared.producerMetrics).toEqual([]);
    expect(prepared.builderMetrics).toEqual([]);
  });
  it("does not create a partial artifact batch from a blocked run", () => {
    const input = completeRun();
    input.gatewayReports = input.gatewayReports.filter((report) => report.reportDate !== "2026-08-28");
    const prepared = prepareScorecardRun(input);

    expect(() => createScorecardArtifacts({ prepared, input })).toThrow(
      "fully validated Scorecard run",
    );
  });

  it("prepares a Producer-only eligible subset while retaining excluded people in the frozen roster", () => {
    const input = completeRun();
    input.eligibleTargets = [{ personId: "producer-b", cardType: "producer" }];
    input.producerMetrics = [producerPayload("producer-b")];
    input.producerVerificationMetrics = [producerPayload("producer-b")];

    const prepared = prepareScorecardRun(input);

    expect(input.people.map((person) => person.id)).toContain("builder-a");
    expect(prepared.status).toBe("ready");
    expect(prepared.summary).toMatchObject({ eligibleProducers: 1, eligibleBuilders: 0 });
    expect(prepared.producerMetrics.map((metric) => metric.personId)).toEqual(["producer-b"]);
    expect(prepared.builderMetrics).toEqual([]);
    expect(verifyPreparedScorecardRun(input, prepared)).toEqual({ valid: true, problems: [] });
  });

  it("does not let excluded Builder-only fields block an eligible Producer subset", () => {
    const input = completeRun();
    input.eligibleTargets = [{ personId: "producer-b", cardType: "producer" }];
    input.producerMetrics = [producerPayload("producer-b")];
    input.producerVerificationMetrics = [producerPayload("producer-b")];
    input.gatewayReports = input.gatewayReports.map((report) => ({
      ...report,
      rows: report.rows.map((row) => row.personId === "builder-a"
        ? { ...row, teamIpCents: -1, firstLegPercent: 999 }
        : row),
    }));

    const prepared = prepareScorecardRun(input);

    expect(prepared.status).toBe("ready");
    expect(prepared.problems).toEqual([]);
    expect(prepared.producerMetrics.map((metric) => metric.personId)).toEqual(["producer-b"]);
  });

  it("prepares a Builder-only eligible subset without making excluded Builders verification targets", () => {
    const input = completeRun();
    input.eligibleTargets = [{ personId: "builder-a", cardType: "builder" }];
    input.producerMetrics = [];
    input.producerVerificationMetrics = [];
    input.builderProductionSupport = [{
      personId: "producer-b",
      current: { dials: 9, contacts: 4, presentations: 3, sales: 2, apCents: 125_000 },
      prior: { dials: 5, contacts: 3, presentations: 2, sales: 1, apCents: 75_000 },
    }];

    const prepared = prepareScorecardRun(input);

    expect(prepared.status).toBe("ready");
    expect(prepared.summary).toMatchObject({ eligibleProducers: 0, eligibleBuilders: 1 });
    expect(prepared.builderMetrics.map((metric) => metric.personId)).toEqual(["builder-a"]);
    expect(prepared.builderMetrics[0]?.teamRank).toEqual({ rank: 1, population: 1 });
    expect(prepared.builderMetrics[0]?.recruitingRank).toEqual({ rank: 1, population: 1 });
    expect(verifyPreparedScorecardRun(input, prepared)).toEqual({ valid: true, problems: [] });
  });

  it("prepares a mixed Producer/Builder eligible subset and verifies only those card targets", () => {
    const input = completeRun();
    input.eligibleTargets = [
      { personId: "producer-b", cardType: "producer" },
      { personId: "builder-a", cardType: "builder" },
    ];
    input.producerMetrics = [producerPayload("producer-b")];
    input.producerVerificationMetrics = [producerPayload("producer-b")];
    input.builderProductionSupport = [{
      personId: "producer-b",
      current: { dials: 9, contacts: 4, presentations: 3, sales: 2, apCents: 125_000 },
      prior: { dials: 5, contacts: 3, presentations: 2, sales: 1, apCents: 75_000 },
    }];

    const prepared = prepareScorecardRun(input);

    expect(prepared.status).toBe("ready");
    expect(prepared.summary).toMatchObject({ eligibleProducers: 1, eligibleBuilders: 1 });
    expect(prepared.producerMetrics.map((metric) => metric.personId)).toEqual(["producer-b"]);
    expect(prepared.builderMetrics.map((metric) => metric.personId)).toEqual(["builder-a"]);
    expect(verifyPreparedScorecardRun(input, prepared)).toEqual({ valid: true, problems: [] });
  });

  it("treats an explicit empty eligibleTargets list as an intentional zero-card subset", () => {
    const input = completeRun();
    input.eligibleTargets = [];
    input.producerMetrics = [];
    input.producerVerificationMetrics = [];

    const prepared = prepareScorecardRun(input);

    expect(prepared.status).toBe("ready");
    expect(prepared.summary).toMatchObject({
      eligibleProducers: 0,
      eligibleBuilders: 0,
      producerRows: 0,
      builderRows: 0,
    });
    expect(verifyPreparedScorecardRun(input, prepared)).toEqual({ valid: true, problems: [] });
    expect(createScorecardArtifacts({ prepared, input })).toEqual({ snapshots: [], deliveries: [] });
  });

  it("intersects manual target scope with eligibleTargets instead of widening either scope", () => {
    const input = completeRun();
    input.target = { personId: "builder-a", cardType: "producer" };
    input.eligibleTargets = [{ personId: "producer-b", cardType: "producer" }];
    input.producerMetrics = [];
    input.producerVerificationMetrics = [];

    const prepared = prepareScorecardRun(input);

    expect(prepared.status).toBe("ready");
    expect(prepared.summary).toMatchObject({ eligibleProducers: 0, eligibleBuilders: 0 });
    expect(verifyPreparedScorecardRun(input, prepared)).toEqual({ valid: true, problems: [] });
  });

  it("still rejects a corrupted metric inside an otherwise valid eligible subset", () => {
    const input = completeRun();
    input.eligibleTargets = [{ personId: "producer-b", cardType: "producer" }];
    input.producerMetrics = [producerPayload("producer-b")];
    input.producerVerificationMetrics = [producerPayload("producer-b")];
    const prepared = prepareScorecardRun(input);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") throw new Error("expected ready subset fixture");
    prepared.producerMetrics[0] = {
      ...prepared.producerMetrics[0],
      payload: {
        ...prepared.producerMetrics[0].payload,
        preview: {
          ...prepared.producerMetrics[0].payload.preview,
          totalIssuedIpCents: 123_456_789,
        },
      },
    };

    const verification = verifyPreparedScorecardRun(input, prepared);

    expect(verification.valid).toBe(false);
    expect(verification.problems).toContainEqual(expect.objectContaining({
      cardType: "producer",
      personId: "producer-b",
      field: "visiblePayload",
    }));
  });

  it("allows scoped publication when the canonical final week exists and earlier reconnect weeks remain holes", () => {
    const input = completeRun();
    input.eligibleTargets = [{ personId: "producer-b", cardType: "producer" }];
    input.producerMetrics = [producerPayload("producer-b")];
    input.producerVerificationMetrics = [producerPayload("producer-b")];
    input.expectedReportDates = [];
    input.expectedGatewayWeeks = [{ periodStart: "2026-08-01", weekOrdinal: 4 }];
    input.gatewayReports = input.gatewayReports
      .filter((report) => !["report-aug-07", "report-aug-14", "report-aug-21"].includes(report.id))
      .map((report) => report.id === "report-aug-28"
        ? {
            ...report,
            reportDate: "2026-08-03",
            scorecardPeriodStart: "2026-08-01",
            scorecardPeriodEnd: "2026-08-31",
            gatewayWeekOrdinal: 4,
            gatewayPeriodFinal: true,
          }
        : report);

    const prepared = prepareScorecardRun(input);

    expect(prepared.status).toBe("ready");
    expect(prepared.problems).toEqual([]);
    expect(verifyPreparedScorecardRun(input, prepared)).toEqual({ valid: true, problems: [] });
  });

  it("requires the exact scoped final-week identity even when another canonical week has the same File Date", () => {
    const input = completeRun();
    input.eligibleTargets = [{ personId: "producer-b", cardType: "producer" }];
    input.producerMetrics = [producerPayload("producer-b")];
    input.producerVerificationMetrics = [producerPayload("producer-b")];
    input.expectedReportDates = [];
    input.expectedGatewayWeeks = [{ periodStart: "2026-08-01", weekOrdinal: 4 }];
    input.gatewayReports = input.gatewayReports
      .filter((report) => report.id !== "report-aug-28")
      .map((report) => report.id === "report-aug-21"
        ? {
            ...report,
            reportDate: "2026-08-03",
            scorecardPeriodStart: "2026-08-01",
            scorecardPeriodEnd: "2026-08-31",
            gatewayWeekOrdinal: 3,
            gatewayPeriodFinal: false,
          }
        : report);

    const prepared = prepareScorecardRun(input);

    expect(prepared.status).toBe("blocked");
    expect(prepared.problems).toContainEqual(expect.objectContaining({ code: "missing_gateway_report" }));
    expect(prepared.problems.find((problem) => problem.code === "missing_gateway_report")?.message)
      .toContain("coverage:2026-08-01:w4");
  });

  it("still validates every present scoped in-period source even when only the final week is required", () => {
    const input = completeRun();
    input.eligibleTargets = [{ personId: "producer-b", cardType: "producer" }];
    input.producerMetrics = [producerPayload("producer-b")];
    input.producerVerificationMetrics = [producerPayload("producer-b")];
    input.expectedReportDates = [];
    input.expectedGatewayWeeks = [{ periodStart: "2026-08-01", weekOrdinal: 4 }];
    input.gatewayReports = input.gatewayReports.map((report) => {
      if (report.id === "report-aug-21") {
        return {
          ...report,
          reportDate: "2026-08-03",
          scorecardPeriodStart: "2026-08-01",
          scorecardPeriodEnd: "2026-08-31",
          gatewayWeekOrdinal: 3,
          gatewayPeriodFinal: false,
          sourceChecksum: "",
        };
      }
      if (report.id === "report-aug-28") {
        return {
          ...report,
          reportDate: "2026-08-03",
          scorecardPeriodStart: "2026-08-01",
          scorecardPeriodEnd: "2026-08-31",
          gatewayWeekOrdinal: 4,
          gatewayPeriodFinal: true,
        };
      }
      return report;
    });

    const prepared = prepareScorecardRun(input);

    expect(prepared.status).toBe("blocked");
    expect(prepared.problems).toContainEqual(expect.objectContaining({
      code: "invalid_source_checksum",
      reportDate: "2026-08-03",
    }));
  });

  it("uses the provider-sourced week date for Active Directs instead of a misleading File Date", () => {
    const input = completeRun();
    input.eligibleTargets = [{ personId: "builder-a", cardType: "builder" }];
    input.producerMetrics = [];
    input.producerVerificationMetrics = [];
    input.builderProductionSupport = [{
      personId: "producer-b",
      current: { dials: 9, contacts: 4, presentations: 3, sales: 2, apCents: 125_000 },
      prior: { dials: 5, contacts: 3, presentations: 2, sales: 1, apCents: 75_000 },
    }];
    input.expectedReportDates = [];
    input.expectedGatewayWeeks = [{ periodStart: "2026-08-01", weekOrdinal: 4 }];
    input.people.push({
      id: "canonical-direct",
      fullName: "Canonical Direct",
      email: "canonical@example.com",
      photoUrl: null,
      uplineId: "builder-a",
      activeAtPeriodEnd: true,
      producerAtPeriodEnd: false,
      builderAtPeriodEnd: false,
    });
    const ordinalById = new Map([
      ["report-aug-07", 1],
      ["report-aug-14", 2],
      ["report-aug-21", 3],
      ["report-aug-28", 4],
    ]);
    input.gatewayReports = input.gatewayReports.map((report) => {
      const ordinal = ordinalById.get(report.id);
      if (!ordinal) return report;
      return {
        ...report,
        reportDate: ordinal === 1 ? "2026-06-01" : "2026-08-03",
        scorecardPeriodStart: "2026-08-01",
        scorecardPeriodEnd: "2026-08-31",
        gatewayWeekOrdinal: ordinal,
        gatewayWeekStart: "2026-08-03",
        gatewayPeriodFinal: ordinal === 4,
        rows: ordinal === 1
          ? [...report.rows, { personId: "canonical-direct", personalIpCents: 100_000, teamIpCents: 100_000, firstLegPercent: 10 }]
          : report.rows,
      };
    });

    const prepared = prepareScorecardRun(input);

    expect(prepared.status).toBe("ready");
    expect(prepared.builderMetrics[0]?.activeWriters).toBe(2);
    expect(verifyPreparedScorecardRun(input, prepared)).toEqual({ valid: true, problems: [] });
  });

  it("does not count scoped Active Direct business whose File Date is recent but provider week date is outside the six-week window", () => {
    const input = completeRun();
    input.people.push({
      id: "stale-canonical-direct",
      fullName: "Stale Canonical Direct",
      email: "stale-canonical@example.com",
      photoUrl: null,
      uplineId: "builder-a",
      activeAtPeriodEnd: true,
      producerAtPeriodEnd: false,
      builderAtPeriodEnd: false,
    });
    input.gatewayReports.push({
      id: "scoped-jul-w1-recent-file",
      gatewayWeekStart: "2026-07-06",
      periodType: "wtd",
      reportDate: "2026-08-28",
      scorecardPeriodStart: "2026-07-01",
      scorecardPeriodEnd: "2026-07-31",
      gatewayWeekOrdinal: 1,
      gatewayPeriodFinal: false,
      status: "published",
      sourceChecksum: "scoped-jul-w1-recent-file",
      unmatchedCount: 0,
      ambiguousCount: 0,
      rows: [{
        personId: "stale-canonical-direct",
        personalIpCents: 100_000,
        teamIpCents: 100_000,
        firstLegPercent: 10,
      }],
    });

    const prepared = prepareScorecardRun(input);

    expect(prepared.status).toBe("ready");
    expect(prepared.builderMetrics.find((metric) => metric.personId === "builder-a")?.activeWriters).toBe(1);
    expect(verifyPreparedScorecardRun(input, prepared)).toEqual({ valid: true, problems: [] });
  });

  it("counts September's fifth Gateway week when its file arrives in October", () => {
    const input = completeRun();
    input.period = { kind: "monthly", start: "2026-09-01", end: "2026-09-30", label: "September 2026" };
    input.priorPeriod = { kind: "monthly", start: "2026-08-01", end: "2026-08-31", label: "August 2026" };
    input.generatedAt = "2026-10-06T15:00:00Z";
    input.eligibleTargets = [{ personId: "builder-a", cardType: "builder" }];
    input.producerMetrics = [];
    input.producerVerificationMetrics = [];
    input.expectedReportDates = [];
    input.expectedGatewayWeeks = [{ periodStart: "2026-09-01", weekOrdinal: 5 }];
    input.people.push({ id: "late-direct", fullName: "Late Direct", email: "late@example.com", photoUrl: null,
      uplineId: "builder-a", activeAtPeriodEnd: true, producerAtPeriodEnd: false, builderAtPeriodEnd: false });
    input.gatewayReports = input.gatewayReports.map((report) => {
      if (!report.id.startsWith("report-aug")) return { ...report, reportDate: report.reportDate.replace("2026-07", "2026-08") };
      const ordinal = report.id.endsWith("28") ? 5 : report.id.endsWith("21") ? 3 : report.id.endsWith("14") ? 2 : 1;
      return { ...report, reportDate: "2026-10-05", scorecardPeriodStart: "2026-09-01", scorecardPeriodEnd: "2026-09-30",
        gatewayWeekOrdinal: ordinal, gatewayWeekStart: report.reportDate.replace("2026-08", "2026-09"), gatewayPeriodFinal: ordinal === 5,
        rows: ordinal === 5 ? [...report.rows, { personId: "late-direct", personalIpCents: 100, teamIpCents: 100, firstLegPercent: null }] : report.rows };
    });
    const prepared = prepareScorecardRun(input);
    expect(prepared.problems).toEqual([]);
    expect(prepared.status).toBe("ready");
    expect(prepared.builderMetrics[0]?.activeWriters).toBe(2);
    expect(verifyPreparedScorecardRun(input, prepared)).toEqual({ valid: true, problems: [] });
  });

  it("blocks an ambiguous boundary only when it can change an eligible Builder's Active Direct count", () => {
    const input = completeRun();
    const prepared = prepareScorecardRun(input);
    input.people.push({ id: "unknown-direct", fullName: "Unknown Direct", email: "unknown@example.com",
      photoUrl: null, uplineId: "builder-a", activeAtPeriodEnd: true, producerAtPeriodEnd: false, builderAtPeriodEnd: false });
    input.gatewayReports.push({ id: "boundary-week", periodType: "wtd", reportDate: "2026-08-28",
      scorecardPeriodStart: "2026-07-01", scorecardPeriodEnd: "2026-07-31", gatewayWeekOrdinal: 5,
      status: "published", sourceChecksum: "boundary", unmatchedCount: 0, ambiguousCount: 0,
      rows: [{ personId: "unknown-direct", personalIpCents: 100, teamIpCents: 100, firstLegPercent: null }] });
    const blocked = prepareScorecardRun(input);
    expect(blocked.status).toBe("blocked");
    expect(blocked.problems).toContainEqual(expect.objectContaining({ code: "unresolved_active_direct_week" }));
    expect(verifyPreparedScorecardRun(input, prepared).problems).toContainEqual(
      expect.objectContaining({ field: "activeDirectCoverage" }));
    input.gatewayReports.at(-1)!.gatewayWeekStart = "2026-07-27";
    const resolved = prepareScorecardRun(input);
    expect(resolved.status).toBe("ready");
    expect(resolved.builderMetrics.find((row) => row.personId === "builder-a")?.activeWriters).toBe(2);
    expect(verifyPreparedScorecardRun(input, resolved).valid).toBe(true);
    input.gatewayReports.at(-1)!.gatewayWeekStart = null;
    input.people.at(-1)!.uplineId = "unrelated";
    expect(prepareScorecardRun(input).status).toBe("ready");
  });


  it("independent verification rejects duplicate and excluded prepared card rows", () => {
    const producerInput = completeRun();
    producerInput.eligibleTargets = [{ personId: "producer-b", cardType: "producer" }];
    producerInput.producerMetrics = [producerPayload("producer-b")];
    producerInput.producerVerificationMetrics = [producerPayload("producer-b")];
    const producerPrepared = prepareScorecardRun(producerInput);
    expect(producerPrepared.status).toBe("ready");
    producerPrepared.producerMetrics.push(producerPayload("builder-a"));
    const producerVerification = verifyPreparedScorecardRun(producerInput, producerPrepared);
    expect(producerVerification.valid).toBe(false);
    expect(producerVerification.problems).toContainEqual(expect.objectContaining({
      cardType: "producer",
      personId: "builder-a",
      field: "row",
      expected: 0,
    }));

    const builderInput = completeRun();
    builderInput.eligibleTargets = [{ personId: "builder-a", cardType: "builder" }];
    builderInput.producerMetrics = [];
    builderInput.producerVerificationMetrics = [];
    builderInput.builderProductionSupport = [{
      personId: "producer-b",
      current: { dials: 9, contacts: 4, presentations: 3, sales: 2, apCents: 125_000 },
      prior: { dials: 5, contacts: 3, presentations: 2, sales: 1, apCents: 75_000 },
    }];
    const builderPrepared = prepareScorecardRun(builderInput);
    expect(builderPrepared.status).toBe("ready");
    builderPrepared.builderMetrics.push({ ...builderPrepared.builderMetrics[0] });
    const builderVerification = verifyPreparedScorecardRun(builderInput, builderPrepared);
    expect(builderVerification.valid).toBe(false);
    expect(builderVerification.problems).toContainEqual(expect.objectContaining({
      cardType: "builder",
      personId: "builder-a",
      field: "row",
      expected: 1,
      actual: 2,
    }));

    const excludedBuilderPrepared = prepareScorecardRun(builderInput);
    const fullPrepared = prepareScorecardRun(completeRun());
    const excludedBuilderMetric = fullPrepared.builderMetrics.find((metric) => metric.personId === "builder-d");
    expect(excludedBuilderMetric).toBeDefined();
    excludedBuilderPrepared.builderMetrics.push({ ...excludedBuilderMetric! });
    const excludedBuilderVerification = verifyPreparedScorecardRun(builderInput, excludedBuilderPrepared);
    expect(excludedBuilderVerification.valid).toBe(false);
    expect(excludedBuilderVerification.problems).toContainEqual(expect.objectContaining({
      cardType: "builder",
      personId: "builder-d",
      field: "row",
      expected: 0,
    }));
  });

  it("ignores regenerated producer timestamps when deciding whether a correction changed business values", () => {
    const originalInput = completeRun();
    const original = createScorecardArtifacts({
      input: originalInput,
      prepared: prepareScorecardRun(originalInput),
    });
    const correctedInput = completeRun();
    correctedInput.runId = "run-timestamp-only";
    correctedInput.revision = 2;
    correctedInput.generatedAt = "2026-09-03T16:00:00.000Z";
    correctedInput.producerMetrics = correctedInput.producerMetrics.map((metric) => ({
      ...metric,
      payload: {
        ...metric.payload,
        preview: { ...metric.payload.preview, generatedAt: correctedInput.generatedAt },
      },
    }));
    correctedInput.producerVerificationMetrics = correctedInput.producerVerificationMetrics.map((metric) => ({
      ...metric,
      payload: {
        ...metric.payload,
        preview: { ...metric.payload.preview, generatedAt: correctedInput.generatedAt },
      },
    }));

    const correction = createScorecardArtifacts({
      input: correctedInput,
      prepared: prepareScorecardRun(correctedInput),
      priorSnapshots: original.snapshots,
    });

    expect(correction.snapshots).toEqual([]);
    expect(correction.deliveries).toEqual([]);
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
