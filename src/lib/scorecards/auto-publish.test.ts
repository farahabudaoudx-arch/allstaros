import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  service: null as unknown,
  blockPrepare: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => harness.service,
}));
vi.mock("./source", () => ({
  loadProducerSourceForPeriod: vi.fn(async (_service, personId: string, period, generatedAt: Date) => ({
    producerId: personId,
    periodStart: period.start,
    periodEnd: period.end,
    periodLabel: period.label,
    reportDates: [],
    producerRows: [],
    generatedAt: generatedAt.toISOString(),
  })),
  loadManualProducerOverviewForPeriod: vi.fn(async () => ({
    activity: { expectedDates: [], loggedDates: [] },
  })),
}));
vi.mock("./lifecycle", () => ({
  createProducerPeriodPreview: vi.fn((source, kind) => ({
    periodKind: kind,
    periodStart: source.periodStart,
    periodEnd: source.periodEnd,
    periodLabel: source.periodLabel,
    totalIssuedIpCents: 100,
    sourceCoverage: {
      source: "gateway",
      reportCount: 1,
      completeThrough: source.periodEnd,
    },
  })),
  createScorecardScheduleFacts: vi.fn(() => []),
}));
vi.mock("./published-snapshot", () => ({
  builderPublishedMetric: vi.fn((metric) => metric),
}));
vi.mock("./run", () => ({
  prepareScorecardRun: vi.fn((input) => {
    if (harness.blockPrepare) {
      return {
        status: "blocked",
        producerMetrics: [],
        builderMetrics: [],
        problems: [{ message: "canonical validation blocked" }],
        summary: {
          eligibleProducers: input.producerMetrics.length,
          eligibleBuilders: 0,
          producerRows: 0,
          builderRows: 0,
          passed: 0,
          failed: 1,
          held: input.producerMetrics.length,
        },
      };
    }
    return {
      status: "ready",
      producerMetrics: input.producerMetrics,
      builderMetrics: [],
      problems: [],
      summary: {
        eligibleProducers: input.producerMetrics.length,
        eligibleBuilders: 0,
        producerRows: input.producerMetrics.length,
        builderRows: 0,
        passed: input.producerMetrics.length,
        failed: 0,
        held: 0,
      },
    };
  }),
  createScorecardArtifacts: vi.fn(({ prepared, input }) => ({
    snapshots: prepared.producerMetrics.map((metric: { personId: string; payload: unknown }) => ({
      id: `${input.runId}:producer:${metric.personId}`,
      runId: input.runId,
      revision: 1,
      personId: metric.personId,
      cardType: "producer",
      lifecycleStatus: "final",
      period: input.period,
      title: "Producer Scorecard",
      visiblePayload: {
        schemaVersion: "scorecard-published-v1",
        cardType: "producer",
        metricPayload: metric.payload,
      },
      priorSnapshotId: null,
    })),
    deliveries: [],
  })),
}));

import {
  candidateClosedPeriods,
  processCompletedScorecardPeriods,
} from "./auto-publish";

type AuditRow = {
  id: string;
  person_id: string;
  period_type: string;
  status: string;
  report_date: string;
  gateway_label: string;
  source_checksum: string;
  matched_count: number;
  unmatched_count: number;
  ambiguous_count: number;
  summary: unknown;
  created_at: string;
};

type PremiumRow = {
  id: string;
  import_id: string;
  person_id: string;
  period_type: string;
  report_date: string;
  personal_ip_cents: number;
  team_ip_cents: number;
  first_leg_percent: number | null;
};

type FakeState = {
  context: Array<Record<string, unknown>>;
  connections: Array<Record<string, unknown>>;
  imports: AuditRow[];
  premiumRows: PremiumRow[];
  existingRuns: Map<string, { id: string; status: string }>;
  publishCalls: Array<Record<string, unknown>>;
};

function mondays(start: string, end: string): string[] {
  const result: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const stop = new Date(`${end}T00:00:00.000Z`);
  while (cursor <= stop) {
    if (cursor.getUTCDay() === 1) result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function addMatchedEvidence(state: FakeState, start: string, end: string) {
  for (const reportDate of mondays(start, end)) {
    const importId = `import-${reportDate}`;
    state.imports.push({
      id: importId,
      person_id: "producer-1",
      period_type: "wtd",
      status: "imported",
      report_date: reportDate,
      gateway_label: reportDate,
      source_checksum: `checksum-${reportDate}`,
      matched_count: 1,
      unmatched_count: 0,
      ambiguous_count: 0,
      summary: { samples: { matchReason: null } },
      created_at: `${reportDate}T12:00:00.000Z`,
    });
    state.premiumRows.push({
      id: `premium-${reportDate}`,
      import_id: importId,
      person_id: "producer-1",
      period_type: "wtd",
      report_date: reportDate,
      personal_ip_cents: 100,
      team_ip_cents: 100,
      first_leg_percent: 10,
    });
  }
}

function fakeState(): FakeState {
  return {
    context: [{
      person_id: "producer-1",
      full_name: "Producer One",
      email: "producer@example.com",
      photo_url: null,
      photo_review_status: "approved",
      npn: "12345678",
      npn_status: "verified",
      npn_verified_at: "2025-01-01T12:00:00.000Z",
      recruit_id: null,
      recruit_created_at: null,
      recruit_removed_at: null,
      upline_id: null,
      active_at_period_end: true,
      producer_at_period_end: true,
      builder_at_period_end: false,
    }],
    connections: [{
      person_id: "producer-1",
      first_connected_at: "2025-01-01T12:00:00.000Z",
    }],
    imports: [],
    premiumRows: [],
    existingRuns: new Map(),
    publishCalls: [],
  };
}

class FakeQuery {
  private filters = new Map<string, unknown>();
  private lower: string | null = null;
  private upper: string | null = null;

  constructor(
    private table: string,
    private state: FakeState,
  ) {}

  select() { return this; }
  eq(column: string, value: unknown) { this.filters.set(column, value); return this; }
  in(column: string, values: unknown[]) { this.filters.set(`in:${column}`, values); return this; }
  limit() { return this; }
  not() { return this; }
  order() { return this; }
  gte(_column: string, value: string) { this.lower = value; return this; }
  lte(_column: string, value: string) { this.upper = value; return this; }

  async maybeSingle() {
    if (this.table === "scorecard_metric_run") {
      const key = `${String(this.filters.get("period_kind"))}:${String(this.filters.get("period_start"))}`;
      return { data: this.state.existingRuns.get(key) ?? null, error: null };
    }
    if (this.table === "scorecard_snapshot") {
      const key = `${String(this.filters.get("period_kind"))}:${String(this.filters.get("period_start"))}`;
      const snapshot = this.state.existingRuns.get(`snapshot:${key}`);
      return { data: snapshot ? { id: snapshot.id } : null, error: null };
    }
    return { data: null, error: null };
  }

  async range(from: number, to: number) {
    let rows: Array<Record<string, unknown>> = [];
    if (this.table === "gateway_connection") rows = this.state.connections;
    if (this.table === "gateway_issued_premium_import") rows = this.state.imports;
    if (this.table === "producer_issued_premium") rows = this.state.premiumRows;
    rows = rows.filter((row) => {
      const reportDate = typeof row.report_date === "string" ? row.report_date : null;
      if (reportDate && this.lower && reportDate < this.lower) return false;
      if (reportDate && this.upper && reportDate > this.upper) return false;
      for (const [column, value] of this.filters) {
        if (row[column] !== value) return false;
      }
      return true;
    });
    return { data: rows.slice(from, to + 1), error: null };
  }
}

function fakeClient(state: FakeState) {
  return {
    from(table: string) {
      return new FakeQuery(table, state);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "scorecard_population_context") {
        return { data: state.context, error: null };
      }
      if (name === "publish_gateway_complete_scorecard_population") {
        state.publishCalls.push(args);
        return {
          data: [{
            run_id: String(args.p_run_id),
            snapshot_count: 1,
            existing: false,
          }],
          error: null,
        };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  } as never;
}

beforeEach(() => {
  harness.blockPrepare = false;
});

describe("automatic Scorecard period candidates", () => {
  it("evaluates only the immediately previous month and does not scan historical backfill", () => {
    expect(candidateClosedPeriods("2026-09-04T18:00:00.000Z").map((period) => [
      period.kind, period.start, period.end,
    ])).toEqual([
      ["monthly", "2026-08-01", "2026-08-31"],
    ]);
  });

  it("adds the quarter only at a quarter close and the year only at December close", () => {
    expect(candidateClosedPeriods("2026-10-01T18:00:00.000Z").map((period) => period.kind))
      .toEqual(["monthly", "quarterly"]);
    expect(candidateClosedPeriods("2027-01-02T18:00:00.000Z").map((period) => period.kind))
      .toEqual(["monthly", "quarterly", "annual"]);
  });
});

describe("automatic Scorecard orchestration", () => {
  it("publishes one complete month through one atomic population RPC", async () => {
    const state = fakeState();
    addMatchedEvidence(state, "2026-08-01", "2026-08-31");
    harness.service = fakeClient(state);

    const result = await processCompletedScorecardPeriods({ now: "2026-09-04T18:00:00.000Z" });

    expect(result).toMatchObject({ evaluated: 1, published: 1, existing: 0, skipped: 0 });
    expect(state.publishCalls).toHaveLength(1);
    expect(state.publishCalls[0]).toMatchObject({
      p_period_kind: "monthly",
      p_period_start: "2026-08-01",
      p_period_end: "2026-08-31",
    });
    expect(state.publishCalls[0].p_source_manifest).toMatchObject({
      trigger: "gateway_complete",
      generationScope: "population",
      finalRequiredDate: "2026-08-31",
    });
    expect(state.publishCalls[0]).not.toHaveProperty("p_people");
  });

  it("keeps one missing earlier Monday as a hole even when the final Monday exists", async () => {
    const state = fakeState();
    addMatchedEvidence(state, "2026-08-01", "2026-08-31");
    state.imports = state.imports.filter((row) => row.report_date !== "2026-08-10");
    state.premiumRows = state.premiumRows.filter((row) => row.report_date !== "2026-08-10");
    harness.service = fakeClient(state);

    const result = await processCompletedScorecardPeriods({ now: "2026-09-04T18:00:00.000Z" });

    expect(result).toMatchObject({ evaluated: 1, published: 0, skipped: 1 });
    expect(result.periods[0]).toMatchObject({ status: "incomplete" });
    expect(state.publishCalls).toEqual([]);
  });

  it("accepts the person's own unambiguous target_npn_not_present as verified zero", async () => {
    const state = fakeState();
    addMatchedEvidence(state, "2026-08-01", "2026-08-31");
    const zeroDate = "2026-08-10";
    const audit = state.imports.find((row) => row.report_date === zeroDate)!;
    audit.matched_count = 0;
    audit.unmatched_count = 1;
    audit.summary = { samples: { matchReason: "target_npn_not_present" } };
    state.premiumRows = state.premiumRows.filter((row) => row.report_date !== zeroDate);
    harness.service = fakeClient(state);

    const result = await processCompletedScorecardPeriods({ now: "2026-09-04T18:00:00.000Z" });

    expect(result.published).toBe(1);
    expect(state.publishCalls).toHaveLength(1);
  });

  it("does not persist anything when canonical population preparation blocks", async () => {
    const state = fakeState();
    addMatchedEvidence(state, "2026-08-01", "2026-08-31");
    harness.blockPrepare = true;
    harness.service = fakeClient(state);

    const result = await processCompletedScorecardPeriods({ now: "2026-09-04T18:00:00.000Z" });

    expect(result.periods[0]).toMatchObject({ status: "blocked", reason: "canonical validation blocked" });
    expect(state.publishCalls).toEqual([]);
  });

  it("returns an existing population run idempotently without republishing", async () => {
    const state = fakeState();
    state.existingRuns.set("monthly:2026-08-01", { id: "existing-run", status: "published" });
    harness.service = fakeClient(state);

    const result = await processCompletedScorecardPeriods({ now: "2026-09-04T18:00:00.000Z" });

    expect(result).toMatchObject({ evaluated: 1, published: 0, existing: 1, skipped: 0 });
    expect(result.periods[0]).toMatchObject({ status: "existing", runId: "existing-run" });
    expect(state.publishCalls).toEqual([]);
  });

  it("blocks cleanly when immutable revision-one manual artifacts already exist", async () => {
    const state = fakeState();
    state.existingRuns.set("snapshot:monthly:2026-08-01", { id: "manual-snapshot", status: "published" });
    harness.service = fakeClient(state);

    const result = await processCompletedScorecardPeriods({ now: "2026-09-04T18:00:00.000Z" });

    expect(result.periods[0]).toMatchObject({ status: "blocked" });
    expect(result.periods[0].reason).toContain("outside a population run");
    expect(state.publishCalls).toEqual([]);
  });

  it("evaluates December month, Q4, and annual independently when all exact Mondays are ready", async () => {
    const state = fakeState();
    addMatchedEvidence(state, "2026-01-01", "2026-12-31");
    harness.service = fakeClient(state);

    const result = await processCompletedScorecardPeriods({ now: "2027-01-02T18:00:00.000Z" });

    expect(result).toMatchObject({ evaluated: 3, published: 3, existing: 0, skipped: 0 });
    expect(result.periods.map((entry) => [entry.period.kind, entry.status])).toEqual([
      ["monthly", "published"],
      ["quarterly", "published"],
      ["annual", "published"],
    ]);
    expect(state.publishCalls).toHaveLength(3);
  });
});
