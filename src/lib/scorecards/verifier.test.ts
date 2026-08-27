import { describe, expect, it } from "vitest";
import { prepareScorecardRun, type PreparedScorecardRun, type ProducerPeriodMetricPayload, type ScorecardRunInput } from "./run";
import { verifyPreparedScorecardRun } from "./verifier";

function fixture(): ScorecardRunInput {
  return {
    runId: "verify-run",
    revision: 1,
    period: { kind: "monthly", start: "2026-08-01", end: "2026-08-31", label: "August 2026" },
    generatedAt: "2026-09-02T12:00:00Z",
    expectedReportDates: ["2026-08-07", "2026-08-14"],
    people: [
      { id: "builder", fullName: "Builder", email: "builder@example.com", photoUrl: null, uplineId: null, activeAtPeriodEnd: true, producerAtPeriodEnd: true, builderAtPeriodEnd: true },
      { id: "writer", fullName: "Writer", email: "writer@example.com", photoUrl: null, uplineId: "builder", activeAtPeriodEnd: true, producerAtPeriodEnd: true, builderAtPeriodEnd: false },
    ],
    gatewayReports: [
      { id: "prior-1", periodType: "wtd", reportDate: "2026-07-10", status: "published", sourceChecksum: "prior-1", unmatchedCount: 0, ambiguousCount: 0, rows: [] },
      { id: "prior-2", periodType: "wtd", reportDate: "2026-07-17", status: "published", sourceChecksum: "prior-2", unmatchedCount: 0, ambiguousCount: 0, rows: [] },
      { id: "prior-3", periodType: "wtd", reportDate: "2026-07-24", status: "published", sourceChecksum: "prior-3", unmatchedCount: 0, ambiguousCount: 0, rows: [] },
      { id: "prior-4", periodType: "wtd", reportDate: "2026-07-31", status: "published", sourceChecksum: "prior-4", unmatchedCount: 0, ambiguousCount: 0, rows: [] },
      { id: "one", periodType: "wtd", reportDate: "2026-08-07", status: "published", sourceChecksum: "one", unmatchedCount: 0, ambiguousCount: 0, rows: [{ personId: "builder", personalIpCents: 10, teamIpCents: 100, firstLegPercent: 25 }] },
      { id: "two", periodType: "wtd", reportDate: "2026-08-14", status: "published", sourceChecksum: "two", unmatchedCount: 0, ambiguousCount: 0, rows: [{ personId: "builder", personalIpCents: 0, teamIpCents: 300, firstLegPercent: 50 }, { personId: "writer", personalIpCents: 50, teamIpCents: 50, firstLegPercent: 10 }] },
    ],
    recruits: [{ id: "recruit", personId: "writer", createdAt: "2026-08-31T23:00:00-05:00", removedAt: "2026-09-03T12:00:00Z" }],
    priorBuilderTeamIpCents: { builder: 200 },
    priorBuilderCoverage: { builder: "complete" },
    producerMetrics: [
      { personId: "builder", payload: {} as ProducerPeriodMetricPayload },
      { personId: "writer", payload: {} as ProducerPeriodMetricPayload },
    ],
    producerVerificationMetrics: [
      { personId: "builder", payload: {} as ProducerPeriodMetricPayload },
      { personId: "writer", payload: {} as ProducerPeriodMetricPayload },
    ],
  };
}

describe("independent Scorecard verification", () => {
  it("detects every corrupted displayed Builder field without calling the production calculator", () => {
    const input = fixture();
    const prepared = prepareScorecardRun(input);
    const mutations: Array<(run: PreparedScorecardRun) => void> = [
      (run) => { run.builderMetrics[0].teamIpCents += 1; },
      (run) => { run.builderMetrics[0].teamRank = null; },
      (run) => { run.builderMetrics[0].activeWriters += 1; },
      (run) => { run.builderMetrics[0].firstLegPercent = 0; },
      (run) => { run.builderMetrics[0].averageMonthlyIpPerWriterCents = 1; },
      (run) => { run.builderMetrics[0].growth.percentage = 1; },
      (run) => { run.builderMetrics[0].recruitsAdded += 1; },
      (run) => { run.builderMetrics[0].recruitingRank.rank += 1; },
      (run) => { run.builderMetrics[0].trend[0].teamIpCents += 1; },
    ];

    for (const mutate of mutations) {
      const candidate = structuredClone(prepared);
      mutate(candidate);
      expect(verifyPreparedScorecardRun(input, candidate).valid).toBe(false);
    }

    const corruptedProducer = structuredClone(prepared);
    (corruptedProducer.producerMetrics[0].payload as unknown as Record<string, unknown>).corrupt = true;
    expect(verifyPreparedScorecardRun(input, corruptedProducer).valid).toBe(false);
  });
});
