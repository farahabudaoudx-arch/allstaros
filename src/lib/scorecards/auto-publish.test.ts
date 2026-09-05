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
  loadManualProducerOverviewForPeriod: vi.fn(async (_service, person, _currentIp, priorIp) => ({
    producer: { fullName: person.full_name, photoUrl: null, role: "Producer" },
    submittedApCents: 0,
    priorSubmittedApCents: 0,
    priorLeadSpendCents: 0,
    priorIssuedIpCents: priorIp,
    priorActivityTotals: null,
    growth: priorIp > 0
      ? { kind: "percentage", percentage: -100 }
      : { kind: "new_baseline", percentage: null },
    rank: { rank: null, population: 0, percentile: 0, movement: null },
    organizationRanks: {
      submittedAp: { rank: null, population: 0 },
      leadSpend: { rank: null, population: 0 },
      dials: { rank: null, population: 0 },
      contacts: { rank: null, population: 0 },
      presentations: { rank: null, population: 0 },
      sales: { rank: null, population: 0 },
      trackingConsistency: { rank: null, population: 0 },
    },
    activity: {
      availability: "missing",
      trackedDays: 0,
      leadSpendCents: 0,
      loggedDates: [],
      expectedDates: null,
      consistency: null,
      totals: null,
      perTrackedDay: null,
    },
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
  source_kind: string;
  pull_kind: string;
  period_type: string;
  status: string;
  report_date: string;
  period_start: string;
  scorecard_period_start: string;
  scorecard_period_end: string;
  gateway_week_ordinal: number;
  gateway_period_final: boolean;
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
  source_kind: string;
  period_type: string;
  report_date: string;
  period_start: string;
  scorecard_period_start: string;
  scorecard_period_end: string;
  gateway_week_ordinal: number;
  gateway_period_final: boolean;
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
  ledger: Map<string, Record<string, unknown>>;
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

function addMatchedEvidence(state: FakeState, start: string, end: string, personId = "producer-1") {
  for (const reportDate of mondays(start, end)) {
    const month = reportDate.slice(0, 7);
    const monthStart = `${month}-01`;
    const [year, monthNumber] = month.split("-").map(Number);
    const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
    const monthMondays = mondays(monthStart, monthEnd);
    const weekOrdinal = monthMondays.indexOf(reportDate) + 1;
    const importId = `import-${personId}-${reportDate}`;
    state.imports.push({
      id: importId,
      person_id: personId,
      source_kind: "personal_gateway",
      pull_kind: "monday",
      period_type: "wtd",
      status: "imported",
      report_date: reportDate,
      period_start: reportDate,
      scorecard_period_start: monthStart,
      scorecard_period_end: monthEnd,
      gateway_week_ordinal: weekOrdinal,
      gateway_period_final: weekOrdinal === monthMondays.length,
      gateway_label: reportDate,
      source_checksum: `checksum-${personId}-${reportDate}`,
      matched_count: 1,
      unmatched_count: 0,
      ambiguous_count: 0,
      summary: { samples: { matchReason: null } },
      created_at: `${reportDate}T12:00:00.000Z`,
    });
    state.premiumRows.push({
      id: `premium-${personId}-${reportDate}`,
      import_id: importId,
      person_id: personId,
      source_kind: "personal_gateway",
      period_type: "wtd",
      report_date: reportDate,
      period_start: reportDate,
      scorecard_period_start: monthStart,
      scorecard_period_end: monthEnd,
      gateway_week_ordinal: weekOrdinal,
      gateway_period_final: weekOrdinal === monthMondays.length,
      personal_ip_cents: 100,
      team_ip_cents: 100,
      first_leg_percent: 10,
    });
  }
}

function addCanonicalEvidence(state: FakeState, args: {
  personId?: string;
  fileDate: string;
  coveredStart: string;
  coveredEnd: string;
  weekOrdinal: number;
  periodFinal: boolean;
}) {
  const personId = args.personId ?? "producer-1";
  const importId = `import-${personId}-${args.coveredStart}-w${args.weekOrdinal}-${args.fileDate}`;
  state.imports.push({
    id: importId,
    person_id: personId,
    source_kind: "personal_gateway",
    pull_kind: "monday",
    period_type: "wtd",
    status: "imported",
    report_date: args.fileDate,
    period_start: args.fileDate,
    scorecard_period_start: args.coveredStart,
    scorecard_period_end: args.coveredEnd,
    gateway_week_ordinal: args.weekOrdinal,
    gateway_period_final: args.periodFinal,
    gateway_label: `${args.coveredStart}:w${args.weekOrdinal}`,
    source_checksum: `checksum-${importId}`,
    matched_count: 1,
    unmatched_count: 0,
    ambiguous_count: 0,
    summary: { samples: { matchReason: null } },
    created_at: `${args.fileDate}T12:00:00.000Z`,
  });
  state.premiumRows.push({
    id: `premium-${importId}`,
    import_id: importId,
    person_id: personId,
    source_kind: "personal_gateway",
    period_type: "wtd",
    report_date: args.fileDate,
    period_start: args.fileDate,
    scorecard_period_start: args.coveredStart,
    scorecard_period_end: args.coveredEnd,
    gateway_week_ordinal: args.weekOrdinal,
    gateway_period_final: args.periodFinal,
    personal_ip_cents: 100,
    team_ip_cents: 100,
    first_leg_percent: 10,
  });
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
      status: "connected",
    }],
    imports: [],
    premiumRows: [],
    existingRuns: new Map(),
    ledger: new Map(),
    publishCalls: [],
  };
}

class FakeQuery {
  private filters = new Map<string, unknown>();
  private lower: string | null = null;
  private upper: string | null = null;
  private lowerColumn: string | null = null;
  private upperColumn: string | null = null;
  private updatePayload: Record<string, unknown> | null = null;

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
  gte(column: string, value: string) { this.lowerColumn = column; this.lower = value; return this; }
  lte(column: string, value: string) { this.upperColumn = column; this.upper = value; return this; }
  update(payload: Record<string, unknown>) { this.updatePayload = payload; return this; }

  async upsert(rows: Array<Record<string, unknown>>) {
    if (this.table !== "scorecard_auto_publish_period") throw new Error(`Unexpected upsert ${this.table}`);
    for (const row of rows) {
      const key = `${String(row.period_kind)}:${String(row.period_start)}`;
      if (!this.state.ledger.has(key)) this.state.ledger.set(key, { ...row, run_id: null });
    }
    return { data: null, error: null };
  }

  private matches(row: Record<string, unknown>) {
    const lowerValue = this.lowerColumn ? row[this.lowerColumn] : null;
    const upperValue = this.upperColumn ? row[this.upperColumn] : null;
    if (this.lower && typeof lowerValue === "string" && lowerValue < this.lower) return false;
    if (this.upper && typeof upperValue === "string" && upperValue > this.upper) return false;
    for (const [column, value] of this.filters) {
      if (column.startsWith("in:")) {
        const actualColumn = column.slice(3);
        if (!(value as unknown[]).includes(row[actualColumn])) return false;
      } else if (row[column] !== value) return false;
    }
    return true;
  }

  private async execute() {
    if (this.table === "scorecard_auto_publish_period") {
      const rows = [...this.state.ledger.values()].filter((row) => this.matches(row));
      if (this.updatePayload) {
        for (const row of rows) Object.assign(row, this.updatePayload);
        return { data: null, error: null };
      }
      return { data: rows, error: null };
    }
    return { data: [], error: null };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

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
      return this.matches(row);
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
      if (name === "publish_gateway_eligible_scorecard_population") {
        state.publishCalls.push(args);
        return {
          data: [{
            run_id: String(args.p_run_id),
            snapshot_count: Array.isArray(args.p_snapshots) ? args.p_snapshots.length : 0,
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
      finalGatewayWeeks: [{
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        weekOrdinal: 5,
        periodFinal: true,
      }],
    });
    expect(state.publishCalls[0]).not.toHaveProperty("p_people");
  });

  it("publishes an eligible producer without letting another member's missing weeks block them", async () => {
    const state = fakeState();
    state.context.push({
      ...state.context[0],
      person_id: "producer-2",
      full_name: "Producer Two",
      email: "producer2@example.com",
      npn: "87654321",
    });
    state.connections.push({
      person_id: "producer-2",
      first_connected_at: "2025-01-01T12:00:00.000Z",
      status: "connected",
    });
    addMatchedEvidence(state, "2026-08-01", "2026-08-31", "producer-1");
    harness.service = fakeClient(state);

    const result = await processCompletedScorecardPeriods({ now: "2026-09-04T18:00:00.000Z" });

    expect(result.published).toBe(1);
    expect(state.publishCalls).toHaveLength(1);
    expect(state.publishCalls[0].p_producer_metrics).toHaveLength(1);
    expect(state.publishCalls[0].p_source_manifest).toMatchObject({
      memberDecisions: expect.arrayContaining([
        expect.objectContaining({ personId: "producer-1", cardType: "producer", status: "eligible" }),
        expect.objectContaining({ personId: "producer-2", cardType: "producer", status: "excluded" }),
      ]),
    });
  });

  it("publishes a reconnected member with holes when earlier Mondays were missed but the final week exists", async () => {
    const state = fakeState();
    addMatchedEvidence(state, "2026-08-01", "2026-08-31");
    const missedMondays = new Set(["2026-08-10", "2026-08-17"]);
    state.imports = state.imports.filter((row) => !missedMondays.has(row.report_date));
    state.premiumRows = state.premiumRows.filter((row) => !missedMondays.has(row.report_date));
    harness.service = fakeClient(state);

    const result = await processCompletedScorecardPeriods({ now: "2026-09-04T18:00:00.000Z" });

    expect(result).toMatchObject({ evaluated: 1, published: 1, skipped: 0 });
    expect(result.periods[0]).toMatchObject({ status: "published" });
    expect(result.periods[0].memberDecisions).toEqual([expect.objectContaining({
      personId: "producer-1",
      cardType: "producer",
      status: "eligible",
    })]);
    expect(state.publishCalls).toHaveLength(1);
    expect(state.imports.some((row) => missedMondays.has(row.report_date))).toBe(false);
    expect(state.premiumRows.some((row) => missedMondays.has(row.report_date))).toBe(false);
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

  it("keeps an incomplete closed period durable and retries it after the calendar window moves on", async () => {
    const state = fakeState();
    harness.service = fakeClient(state);

    const first = await processCompletedScorecardPeriods({ now: "2026-09-04T18:00:00.000Z" });
    expect(first.periods[0]).toMatchObject({
      period: { kind: "monthly", start: "2026-08-01" },
      status: "incomplete",
    });

    addMatchedEvidence(state, "2026-08-01", "2026-08-31");
    const retried = await processCompletedScorecardPeriods({
      now: "2026-10-04T18:00:00.000Z",
      limit: 1,
    });

    expect(retried.periods).toHaveLength(1);
    expect(retried.periods[0]).toMatchObject({
      period: { kind: "monthly", start: "2026-08-01" },
      status: "published",
    });
  });

  it("never creates historical auto-publish ledger rows merely because first-connect backfill exists", async () => {
    const state = fakeState();
    addMatchedEvidence(state, "2026-06-01", "2026-06-30");
    for (const row of state.imports) row.pull_kind = "first_connect";
    harness.service = fakeClient(state);

    await processCompletedScorecardPeriods({ now: "2026-09-04T18:00:00.000Z" });

    expect([...state.ledger.keys()]).toEqual(["monthly:2026-08-01"]);
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

  it("reaches real prepare/verifier/artifact generation for a subset Builder with six canonical buckets on only two File Dates", async () => {
    vi.resetModules();
    vi.doUnmock("./run");
    vi.doUnmock("./lifecycle");
    vi.doUnmock("./published-snapshot");
    const actualRun = await import("./run");
    expect(vi.isMockFunction(actualRun.prepareScorecardRun)).toBe(false);
    const { processCompletedScorecardPeriods: processWithRealRun } = await import("./auto-publish");

    const state = fakeState();
    state.context[0].builder_at_period_end = true;
    state.context.push({
      ...state.context[0],
      person_id: "producer-excluded",
      full_name: "Excluded Producer",
      email: "excluded@example.com",
      npn: "99999999",
      builder_at_period_end: false,
    });
    state.connections.push({
      person_id: "producer-excluded",
      first_connected_at: "2025-01-01T12:00:00.000Z",
      status: "connected",
    });

    for (const [ordinal, fileDate] of [
      [1, "2026-07-06"],
      [2, "2026-07-13"],
      [3, "2026-07-20"],
      [4, "2026-07-27"],
    ] as const) {
      addCanonicalEvidence(state, {
        fileDate,
        coveredStart: "2026-07-01",
        coveredEnd: "2026-07-31",
        weekOrdinal: ordinal,
        periodFinal: ordinal === 4,
      });
    }
    for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
      addCanonicalEvidence(state, {
        fileDate: "2026-08-03",
        coveredStart: "2026-08-01",
        coveredEnd: "2026-08-31",
        weekOrdinal: ordinal,
        periodFinal: ordinal === 5,
      });
    }
    harness.service = fakeClient(state);

    const result = await processWithRealRun({ now: "2026-09-04T18:00:00.000Z" });

    expect(result.periods[0], JSON.stringify(result.periods[0], null, 2)).toMatchObject({ status: "published" });
    expect(result).toMatchObject({ evaluated: 1, published: 1, existing: 0, skipped: 0 });
    expect(result.periods[0].memberDecisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ personId: "producer-1", cardType: "producer", status: "eligible" }),
      expect.objectContaining({ personId: "producer-1", cardType: "builder", status: "eligible" }),
      expect.objectContaining({ personId: "producer-excluded", cardType: "producer", status: "excluded" }),
    ]));
    expect(state.publishCalls).toHaveLength(1);
    const publishCall = state.publishCalls[0] as {
      p_producer_metrics: unknown[];
      p_builder_metrics: Array<{
        sourceCoverage: {
          activeWriterReportKeys: string[];
          activeWriterReportIds: string[];
          activeWriterSourceChecksums: string[];
          activeWriterReportDates: string[];
        };
      }>;
      p_source_manifest: { gatewayReportIds: string[] };
    };
    expect(publishCall.p_producer_metrics).toHaveLength(1);
    expect(publishCall.p_builder_metrics).toHaveLength(1);
    const builderCoverage = publishCall.p_builder_metrics[0].sourceCoverage;
    expect(builderCoverage.activeWriterReportKeys).toHaveLength(6);
    expect(new Set(builderCoverage.activeWriterReportKeys).size).toBe(6);
    expect(builderCoverage.activeWriterReportIds).toHaveLength(6);
    expect(new Set(builderCoverage.activeWriterReportIds).size).toBe(6);
    expect(builderCoverage.activeWriterSourceChecksums).toHaveLength(6);
    expect(new Set(builderCoverage.activeWriterSourceChecksums).size).toBe(6);
    expect(new Set(builderCoverage.activeWriterReportDates)).toEqual(new Set(["2026-07-27", "2026-08-03"]));
    expect(publishCall.p_source_manifest.gatewayReportIds).toHaveLength(5);

    // Re-run the real orchestration with missed reconnect weeks. The final August bucket is
    // present, but weeks 2 and 3 are genuine holes. Enough prior canonical buckets remain for
    // the Builder six-week window, so publication must proceed without manufacturing evidence.
    const holeState = fakeState();
    holeState.context[0].builder_at_period_end = true;
    for (const [ordinal, fileDate] of [
      [1, "2026-07-06"],
      [2, "2026-07-13"],
      [3, "2026-07-20"],
      [4, "2026-07-27"],
    ] as const) {
      addCanonicalEvidence(holeState, {
        fileDate,
        coveredStart: "2026-07-01",
        coveredEnd: "2026-07-31",
        weekOrdinal: ordinal,
        periodFinal: ordinal === 4,
      });
    }
    for (const ordinal of [1, 4, 5]) {
      addCanonicalEvidence(holeState, {
        fileDate: "2026-08-03",
        coveredStart: "2026-08-01",
        coveredEnd: "2026-08-31",
        weekOrdinal: ordinal,
        periodFinal: ordinal === 5,
      });
    }
    harness.service = fakeClient(holeState);

    const holeResult = await processWithRealRun({ now: "2026-09-04T18:00:00.000Z" });

    expect(holeResult.periods[0], JSON.stringify(holeResult.periods[0], null, 2)).toMatchObject({ status: "published" });
    expect(holeState.publishCalls).toHaveLength(1);
    const holePublish = holeState.publishCalls[0] as {
      p_builder_metrics: Array<{ sourceCoverage: { reportIds: string[] } }>;
      p_source_manifest: { gatewayReportIds: string[] };
    };
    expect(holePublish.p_source_manifest.gatewayReportIds).toHaveLength(3);
    expect(holePublish.p_builder_metrics[0].sourceCoverage.reportIds).toHaveLength(3);
    expect(holePublish.p_source_manifest.gatewayReportIds.join(" ")).not.toMatch(/w2|w3/);

    // One ambiguous direct must exclude only the affected Builder, not eligible Producers.
    const boundaryState = fakeState();
    boundaryState.context = [...holeState.context, { ...holeState.context[0], person_id: "boundary-direct",
      full_name: "Boundary Direct", email: "boundary@example.com", upline_id: "producer-1", builder_at_period_end: false }];
    boundaryState.imports = [...holeState.imports];
    boundaryState.premiumRows = [...holeState.premiumRows];
    addCanonicalEvidence(boundaryState, { personId: "boundary-direct", fileDate: "2026-07-27",
      coveredStart: "2026-07-01", coveredEnd: "2026-07-31", weekOrdinal: 4, periodFinal: true });
    harness.service = fakeClient(boundaryState);
    const boundaryResult = await processWithRealRun({ now: "2026-09-04T18:00:00.000Z" });
    expect(boundaryResult.periods[0]).toMatchObject({ status: "published" });
    expect(boundaryResult.periods[0].memberDecisions).toContainEqual(expect.objectContaining({
      personId: "producer-1", cardType: "builder", status: "excluded", reason: expect.stringContaining("Active Direct coverage") }));
    expect(boundaryState.publishCalls[0]).toMatchObject({ p_builder_metrics: [], p_producer_metrics: [expect.anything()] });

  });
});
