import { describe, expect, it } from "vitest";
import { createProducerOverview, createProducerPeriodPreview } from "./lifecycle";
import type { BuilderPeriodMetric } from "./run";
import {
  createPublishedBuilderSnapshotPayload,
  createPublishedProducerSnapshotPayload,
  parsePublishedScorecardSnapshotPayload,
  PUBLISHED_SCORECARD_SCHEMA_VERSION,
  requirePublishedScorecardSnapshotPayload,
} from "./published-snapshot";

function loggedDates(count: number, start = "2026-08-01") {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  while (dates.length < count) {
    if (cursor.getUTCDay() !== 0) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function producerMetric(args: {
  periodKind?: "monthly" | "quarterly" | "annual";
  periodStart?: string;
  periodEnd?: string;
  periodLabel?: string;
  issuedIpCents?: number;
  leadSpendCents?: number;
  trackingDays?: number;
} = {}) {
  const periodKind = args.periodKind ?? "monthly";
  const periodStart = args.periodStart ?? "2026-08-01";
  const periodEnd = args.periodEnd ?? "2026-08-31";
  const periodLabel = args.periodLabel ?? "August 2026";
  const issuedIpCents = args.issuedIpCents ?? 3_000_000;
  const leadSpendCents = args.leadSpendCents ?? 600_000;
  const dates = loggedDates(args.trackingDays ?? 20, periodStart);
  return {
    preview: createProducerPeriodPreview({
      producerId: "producer-1",
      periodStart,
      periodEnd,
      periodLabel,
      reportDates: [{ reportDate: periodEnd, label: "Close" }],
      producerRows: [{ reportDate: periodEnd, personalIpCents: issuedIpCents }],
      generatedAt: "2026-09-02T12:00:00.000Z",
    }, periodKind),
    overview: createProducerOverview({
      fullName: "Frozen Producer",
      photoUrl: "https://example.com/frozen.jpg",
      submittedApCents: 1_000_000,
      leadSpendCents,
      priorSubmittedApCents: 500_000,
      priorLeadSpendCents: 400_000,
      currentIssuedIpCents: issuedIpCents,
      priorIssuedIpCents: 2_000_000,
      rank: { rank: 1, population: 3, percentile: 100, movement: null },
      organizationRanks: {
        submittedAp: { rank: 1, population: 3 },
        leadSpend: { rank: 1, population: 3 },
        dials: { rank: 1, population: 3 },
        contacts: { rank: 1, population: 3 },
        presentations: { rank: 1, population: 3 },
        sales: { rank: 1, population: 3 },
        trackingConsistency: { rank: 1, population: 3 },
      },
      activityRows: dates.map((entryDate) => ({
        entryDate,
        leads: 1,
        dials: 2,
        contacts: 1,
        appointments: 1,
        presentations: 1,
        sales: 1,
      })),
      priorActivityRows: [],
      expectedWorkingDates: null,
    }),
  };
}

function builderMetric(): BuilderPeriodMetric {
  const rank = { rank: 1, population: 3 };
  return {
    runId: "run-1",
    revision: 1,
    personId: "builder-1",
    teamIpCents: 9_000_000,
    teamRank: rank,
    teamRankUnavailableReason: null,
    activeWriters: 5,
    firstLegPercent: 18,
    averageMonthlyIpPerWriterCents: 1_800_000,
    monthCount: 1,
    growth: {
      comparison: "mom",
      priorTeamIpCents: 8_000_000,
      currentTeamIpCents: 9_000_000,
      percentage: 12.5,
    },
    recruitsAdded: 4,
    recruitingRank: rank,
    trend: [{ reportDate: "2026-08-28", label: "Week 4", teamIpCents: 9_000_000, share: 100 }],
    performance: {
      activeWriters: { value: 5, rank },
      teamDials: { value: 1_000, rank },
      teamContacts: { value: 300, rank },
      teamPresentations: { value: 100, rank },
      teamSales: { value: 50, rank },
      teamAp: { value: 4_000_000, rank },
      teamIp: { value: 9_000_000, rank },
      firstLegPercent: { value: 18, rank },
      averageIpPerWriter: { value: 1_800_000, rank },
      recruits: { value: 4, rank },
    },
    previousPerformance: {
      activeWriters: null,
      teamDials: 900,
      teamContacts: 250,
      teamPresentations: 90,
      teamSales: 40,
      teamAp: 3_500_000,
      teamIp: 8_000_000,
      firstLegPercent: null,
      averageIpPerWriter: null,
      recruits: 3,
    },
    sourceReportIds: ["report-1"],
    sourceChecksums: ["checksum-1"],
  };
}

describe("published Scorecard snapshot payload", () => {
  it("freezes Producer identity, period metadata, section metrics, stars, and overall result", () => {
    const metricPayload = producerMetric();
    const frozen = createPublishedProducerSnapshotPayload({
      metricPayload,
      period: { kind: "monthly", start: "2026-08-01", end: "2026-08-31", label: "August 2026" },
    });

    expect(frozen.schemaVersion).toBe(PUBLISHED_SCORECARD_SCHEMA_VERSION);
    expect(frozen.member).toEqual({ fullName: "Frozen Producer", photoUrl: "https://example.com/frozen.jpg" });
    expect(frozen.period).toEqual({
      kind: "monthly",
      start: "2026-08-01",
      end: "2026-08-31",
      label: "August 2026",
      previous: { kind: "monthly", start: "2026-07-01", end: "2026-07-31", label: "July 2026" },
    });
    expect(frozen.metricPayload.preview.totalIssuedIpCents).toBe(3_000_000);
    expect(frozen.score).toEqual({
      ratings: { issuedIp: 4, trackingConsistency: 4, leadSpend: 3 },
      overall: 3.75,
    });
  });

  it("copies the source payload so later draft/source mutation cannot mutate the published artifact in memory", () => {
    const metricPayload = producerMetric();
    const frozen = createPublishedProducerSnapshotPayload({
      metricPayload,
      period: { kind: "monthly", start: "2026-08-01", end: "2026-08-31", label: "August 2026" },
    });

    metricPayload.preview.totalIssuedIpCents = 50_000_000;
    metricPayload.overview.activity.leadSpendCents = 50_000_000;
    metricPayload.overview.producer.fullName = "Changed Later";

    expect(frozen.metricPayload.preview.totalIssuedIpCents).toBe(3_000_000);
    expect(frozen.metricPayload.overview.activity.leadSpendCents).toBe(600_000);
    expect(frozen.member.fullName).toBe("Frozen Producer");
    expect(frozen.score.overall).toBe(3.75);
  });

  it("freezes #017 quarterly scaling and equivalent prior-period metadata", () => {
    const metricPayload = producerMetric({
      periodKind: "quarterly",
      periodStart: "2026-07-01",
      periodEnd: "2026-09-30",
      periodLabel: "Q3 2026",
      issuedIpCents: 4_000_000,
      leadSpendCents: 1_000_000,
      trackingDays: 24,
    });
    const frozen = createPublishedProducerSnapshotPayload({
      metricPayload,
      period: { kind: "quarterly", start: "2026-07-01", end: "2026-09-30", label: "Q3 2026" },
    });

    expect(frozen.period.previous).toEqual({
      kind: "quarterly", start: "2026-04-01", end: "2026-06-30", label: "Q2 2026",
    });
    expect(frozen.score).toEqual({
      ratings: { issuedIp: 1, trackingConsistency: 1, leadSpend: 1 },
      overall: 1,
    });
  });

  it("rejects malformed or incomplete published payloads instead of accepting a recalculation fallback", () => {
    const frozen = createPublishedProducerSnapshotPayload({
      metricPayload: producerMetric(),
      period: { kind: "monthly", start: "2026-08-01", end: "2026-08-31", label: "August 2026" },
    });

    expect(parsePublishedScorecardSnapshotPayload(frozen)).not.toBeNull();
    expect(parsePublishedScorecardSnapshotPayload({ ...frozen, score: null })).toBeNull();
    expect(parsePublishedScorecardSnapshotPayload({ ...frozen, member: { fullName: "", photoUrl: null } })).toBeNull();
    expect(parsePublishedScorecardSnapshotPayload({ ...frozen, schemaVersion: "legacy" })).toBeNull();
  });

  it("rejects malformed nested Producer metric data before published rendering", () => {
    const frozen = createPublishedProducerSnapshotPayload({
      metricPayload: producerMetric(),
      period: { kind: "monthly", start: "2026-08-01", end: "2026-08-31", label: "August 2026" },
    });
    const missingActivity = structuredClone(frozen) as unknown as { metricPayload: { overview: { activity?: unknown } } };
    delete missingActivity.metricPayload.overview.activity;
    expect(parsePublishedScorecardSnapshotPayload(missingActivity)).toBeNull();

    const malformedExpectedDates = structuredClone(frozen) as unknown as {
      metricPayload: { overview: { activity: { expectedDates: unknown } } };
    };
    malformedExpectedDates.metricPayload.overview.activity.expectedDates = 42;
    expect(parsePublishedScorecardSnapshotPayload(malformedExpectedDates)).toBeNull();

    const malformedTotals = structuredClone(frozen) as unknown as {
      metricPayload: { overview: { activity: { totals: unknown } } };
    };
    malformedTotals.metricPayload.overview.activity.totals = { dials: 1 };
    expect(parsePublishedScorecardSnapshotPayload(malformedTotals)).toBeNull();
  });

  it("requires complete frozen Builder performance and previousPerformance structures", () => {
    const frozen = createPublishedBuilderSnapshotPayload({
      metric: builderMetric(),
      member: { fullName: "Frozen Builder", photoUrl: null },
      period: { kind: "monthly", start: "2026-08-01", end: "2026-08-31", label: "August 2026" },
    });

    expect(parsePublishedScorecardSnapshotPayload(frozen)).toEqual(frozen);

    const missingPerformance = structuredClone(frozen) as unknown as { metricPayload: { performance?: unknown } };
    delete missingPerformance.metricPayload.performance;
    expect(parsePublishedScorecardSnapshotPayload(missingPerformance)).toBeNull();

    const missingPreviousPerformance = structuredClone(frozen) as unknown as { metricPayload: { previousPerformance?: unknown } };
    delete missingPreviousPerformance.metricPayload.previousPerformance;
    expect(parsePublishedScorecardSnapshotPayload(missingPreviousPerformance)).toBeNull();

    const malformedPreviousPerformance = structuredClone(frozen) as unknown as {
      metricPayload: { previousPerformance: Record<string, unknown> };
    };
    malformedPreviousPerformance.metricPayload.previousPerformance.teamIp = "not-a-number";
    expect(parsePublishedScorecardSnapshotPayload(malformedPreviousPerformance)).toBeNull();
  });

  it("fails closed when a published row is malformed or disagrees with its frozen envelope metadata", () => {
    const frozen = createPublishedProducerSnapshotPayload({
      metricPayload: producerMetric(),
      period: { kind: "monthly", start: "2026-08-01", end: "2026-08-31", label: "August 2026" },
    });
    const row = {
      id: "snapshot-1",
      cardType: "producer" as const,
      periodKind: "monthly" as const,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      kpiResults: frozen,
    };

    expect(requirePublishedScorecardSnapshotPayload(row)).toEqual(frozen);
    expect(() => requirePublishedScorecardSnapshotPayload({ ...row, kpiResults: {} }))
      .toThrow("snapshot is incomplete or malformed");
    expect(() => requirePublishedScorecardSnapshotPayload({ ...row, periodStart: "2026-07-01" }))
      .toThrow("snapshot metadata does not match its persisted row");
  });
});
