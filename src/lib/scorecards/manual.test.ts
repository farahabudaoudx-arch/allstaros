import { beforeEach, describe, expect, it, vi } from "vitest";

const sourceState = vi.hoisted(() => ({
  currentStart: "2026-08-01",
  noIp: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("./source", () => {
  const loggedDates = (start: string) => {
    const result: string[] = [];
    const date = new Date(`${start}T00:00:00.000Z`);
    while (result.length < 20) {
      if (date.getUTCDay() !== 0) result.push(date.toISOString().slice(0, 10));
      date.setUTCDate(date.getUTCDate() + 1);
    }
    return result;
  };

  return {
    loadProducerSourceForPeriod: vi.fn(async (_service, personId: string, period, generatedAt: Date) => {
      const current = period.start === sourceState.currentStart;
      const personalIpCents = current ? (sourceState.noIp ? 0 : 2_000_000) : 1_000_000;
      return {
        producerId: personId,
        periodStart: period.start,
        periodEnd: period.end,
        periodLabel: period.label,
        reportDates: [{ reportDate: period.end, label: "Closed period" }],
        producerRows: personalIpCents === 0 ? [] : [{ reportDate: period.end, personalIpCents }],
        generatedAt: generatedAt.toISOString(),
      };
    }),
    loadManualProducerOverviewForPeriod: vi.fn(async (
      _service,
      producer,
      currentIssuedIpCents: number,
      priorIssuedIpCents: number | null,
      period,
    ) => {
      const dates = loggedDates(period.start);
      return {
        producer: { fullName: producer.full_name, photoUrl: null, role: "Producer" as const },
        submittedApCents: 1_200_000,
        priorSubmittedApCents: 900_000,
        priorLeadSpendCents: 400_000,
        priorIssuedIpCents,
        priorActivityTotals: { leads: 30, dials: 300, contacts: 90, appointments: 20, presentations: 15, sales: 7 },
        growth: priorIssuedIpCents && priorIssuedIpCents > 0
          ? { kind: "percentage" as const, percentage: Math.round(((currentIssuedIpCents - priorIssuedIpCents) / priorIssuedIpCents) * 1_000) / 10 }
          : { kind: "new_baseline" as const, percentage: null },
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
          availability: "tracked" as const,
          trackedDays: dates.length,
          leadSpendCents: 600_000,
          loggedDates: dates,
          expectedDates: dates,
          consistency: { loggedDays: dates.length, expectedDays: dates.length, percentage: 100 },
          totals: { leads: 50, dials: 500, contacts: 150, appointments: 35, presentations: 25, sales: 10 },
          perTrackedDay: { leads: 2.5, dials: 25, contacts: 7.5, appointments: 1.8, presentations: 1.3, sales: 0.5 },
        },
      };
    }),
  };
});

import { generateManualScorecardWithClient } from "./manual";
import { parsePublishedScorecardSnapshotPayload } from "./published-snapshot";

type ImportRow = {
  id: string;
  report_date: string;
  source_checksum: string;
  unmatched_count: number;
  ambiguous_count: number;
};

type FakeState = {
  adminAllowed: boolean;
  people: Set<string>;
  imports: ImportRow[];
  contexts: Record<string, Array<Record<string, unknown>>>;
  gatewayRows: Array<Record<string, unknown>>;
  published: Map<string, { snapshotId: string; runId: string; deliveryId: string; payload: unknown }>;
  counts: { runs: number; snapshots: number; deliveries: number };
  publishCalls: Array<Record<string, unknown>>;
};

class FakeQuery {
  private filters = new Map<string, unknown>();
  private lower: string | null = null;
  private upper: string | null = null;
  private selection = "";

  constructor(private table: string, private state: FakeState) {}
  select(value: string) { this.selection = value; return this; }
  eq(column: string, value: unknown) { this.filters.set(column, value); return this; }
  not() { return this; }
  gte(_column: string, value: string) { this.lower = value; return this; }
  lte(_column: string, value: string) { this.upper = value; return this; }
  order() { return this; }
  in() { return this; }

  async maybeSingle() {
    if (this.table !== "person") return { data: null, error: null };
    const id = String(this.filters.get("id") ?? "");
    if (this.selection.includes("is_admin")) {
      return {
        data: this.state.people.has(id)
          ? { id, is_admin: this.state.adminAllowed, is_super_admin: false }
          : null,
        error: null,
      };
    }
    return { data: this.state.people.has(id) ? { id } : null, error: null };
  }

  private result() {
    if (this.table === "gateway_issued_premium_import") {
      const rows = this.state.imports.filter((row) =>
        (!this.lower || row.report_date >= this.lower) && (!this.upper || row.report_date <= this.upper));
      return { data: rows, error: null };
    }
    return { data: [], error: null };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.result()).then(onfulfilled, onrejected);
  }
}

function context(personId: string, builder = true) {
  return [
    {
      person_id: personId,
      full_name: "Alex Target",
      email: "alex@example.com",
      photo_url: null,
      photo_review_status: "approved",
      npn: null,
      npn_status: "missing",
      npn_verified_at: null,
      recruit_id: null,
      recruit_created_at: null,
      recruit_removed_at: null,
      upline_id: null,
      active_at_period_end: true,
      producer_at_period_end: true,
      builder_at_period_end: builder,
      depth: 0,
    },
    {
      person_id: "person-b",
      full_name: "Blair Support",
      email: "blair@example.com",
      photo_url: null,
      photo_review_status: null,
      npn: "12345678",
      npn_status: "verified",
      npn_verified_at: "2026-08-10T12:00:00.000Z",
      recruit_id: "recruit-b",
      recruit_created_at: "2026-07-01T12:00:00.000Z",
      recruit_removed_at: null,
      upline_id: personId,
      active_at_period_end: true,
      producer_at_period_end: true,
      builder_at_period_end: false,
      depth: 1,
    },
  ];
}

function fakeState(): FakeState {
  return {
    adminAllowed: true,
    people: new Set(["admin", "person-a", "person-b"]),
    imports: [
      { id: "jul-24", report_date: "2026-07-24", source_checksum: "jul24", unmatched_count: 0, ambiguous_count: 0 },
      { id: "jul-31", report_date: "2026-07-31", source_checksum: "jul31", unmatched_count: 0, ambiguous_count: 0 },
      { id: "aug-07", report_date: "2026-08-07", source_checksum: "aug07", unmatched_count: 0, ambiguous_count: 0 },
      { id: "aug-14", report_date: "2026-08-14", source_checksum: "aug14", unmatched_count: 0, ambiguous_count: 0 },
      { id: "aug-21", report_date: "2026-08-21", source_checksum: "aug21", unmatched_count: 0, ambiguous_count: 0 },
      { id: "aug-28", report_date: "2026-08-28", source_checksum: "aug28", unmatched_count: 0, ambiguous_count: 0 },
      { id: "q2", report_date: "2026-06-26", source_checksum: "q2", unmatched_count: 0, ambiguous_count: 0 },
      { id: "annual", report_date: "2025-12-26", source_checksum: "annual", unmatched_count: 0, ambiguous_count: 0 },
    ],
    contexts: {
      "person-a": context("person-a"),
      "person-b": context("person-b", false).slice(0, 1),
    },
    gatewayRows: [
      { id: "g1", import_id: "jul-24", person_id: "person-a", report_date: "2026-07-24", personal_ip_cents: 0, team_ip_cents: 2_000_000, first_leg_percent: 40 },
      { id: "g2", import_id: "aug-07", person_id: "person-a", report_date: "2026-08-07", personal_ip_cents: 0, team_ip_cents: 1_000_000, first_leg_percent: 50 },
      { id: "g3", import_id: "aug-14", person_id: "person-a", report_date: "2026-08-14", personal_ip_cents: 0, team_ip_cents: 3_000_000, first_leg_percent: 25 },
      { id: "g4", import_id: "aug-14", person_id: "person-b", report_date: "2026-08-14", personal_ip_cents: 100_000, team_ip_cents: 100_000, first_leg_percent: 10 },
      { id: "g5", import_id: "aug-28", person_id: "person-a", report_date: "2026-08-28", personal_ip_cents: 2_000_000, team_ip_cents: 0, first_leg_percent: null },
      { id: "g6", import_id: "q2", person_id: "person-a", report_date: "2026-06-26", personal_ip_cents: 2_000_000, team_ip_cents: 0, first_leg_percent: null },
      { id: "g7", import_id: "annual", person_id: "person-a", report_date: "2025-12-26", personal_ip_cents: 2_000_000, team_ip_cents: 0, first_leg_percent: null },
    ],
    published: new Map(),
    counts: { runs: 0, snapshots: 0, deliveries: 0 },
    publishCalls: [],
  };
}

function fakeClient(state: FakeState) {
  return {
    from(table: string) {
      return new FakeQuery(table, state);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "scorecard_manual_target_context") {
        const rows = state.contexts[String(args.p_person_id)] ?? [];
        return {
          data: args.p_include_subtree ? rows : rows.filter((row) => row.depth === 0),
          error: null,
        };
      }
      if (name === "scorecard_manual_gateway_rows") {
        const start = String(args.p_report_start);
        const end = String(args.p_report_end);
        const personId = String(args.p_person_id);
        const contextIds = new Set((state.contexts[personId] ?? []).map((row) => String(row.person_id)));
        const rows = state.gatewayRows
          .filter((row) => String(row.report_date) >= start && String(row.report_date) <= end)
          .filter((row) => args.p_include_subtree ? contextIds.has(String(row.person_id)) : row.person_id === personId)
          .map((row) => sourceState.noIp && personId === "person-a"
            ? { ...row, personal_ip_cents: row.person_id === personId ? 0 : row.personal_ip_cents }
            : row);
        return { data: rows, error: null };
      }
      if (name === "scorecard_manual_builder_production_support") {
        return {
          data: [
            {
              person_id: String(args.p_builder_id),
              current_dials: 1, current_contacts: 1, current_presentations: 1, current_sales: 1, current_ap_cents: 25_000,
              prior_dials: 1, prior_contacts: 1, prior_presentations: 1, prior_sales: 1, prior_ap_cents: 20_000,
            },
            {
              person_id: "person-b",
              current_dials: 7, current_contacts: 5, current_presentations: 3, current_sales: 2, current_ap_cents: 90_000,
              prior_dials: 4, prior_contacts: 3, prior_presentations: 2, prior_sales: 1, prior_ap_cents: 50_000,
            },
          ],
          error: null,
        };
      }
      if (name === "publish_manual_scorecard") {
        state.publishCalls.push(args);
        const key = [args.p_person_id, args.p_card_type, args.p_period_kind, args.p_period_start, args.p_revision].join(":");
        const prior = state.published.get(key);
        if (prior) {
          return { data: [{ snapshot_id: prior.snapshotId, run_id: prior.runId, delivery_id: prior.deliveryId, existing: true }], error: null };
        }
        const sequence = state.published.size + 1;
        const created = {
          snapshotId: `snapshot-${sequence}`,
          runId: `run-${sequence}`,
          deliveryId: `delivery-${sequence}`,
          payload: args.p_published_payload,
        };
        state.published.set(key, created);
        state.counts.runs += 1;
        state.counts.snapshots += 1;
        state.counts.deliveries += 1;
        return { data: [{ snapshot_id: created.snapshotId, run_id: created.runId, delivery_id: created.deliveryId, existing: false }], error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  } as never;
}

const monthly = { kind: "monthly" as const, start: "2026-08-01", end: "2026-08-31", label: "August 2026" };

beforeEach(() => {
  sourceState.currentStart = monthly.start;
  sourceState.noIp = false;
});

describe("manual one-person Scorecard generation", () => {
  it("publishes one full-data Producer with current fixed ratings and no unrelated mutation", async () => {
    const state = fakeState();
    const beforeB = { ...state.counts };
    const result = await generateManualScorecardWithClient(fakeClient(state), {
      initiatedBy: "admin",
      personId: "person-a",
      cardType: "producer",
      period: monthly,
    });

    expect(result).toMatchObject({ status: "success", snapshotId: "snapshot-1" });
    expect(state.counts).toEqual({ runs: beforeB.runs + 1, snapshots: beforeB.snapshots + 1, deliveries: beforeB.deliveries + 1 });
    const call = state.publishCalls[0];
    expect(call.p_person_id).toBe("person-a");
    expect(call.p_card_type).toBe("producer");
    const published = parsePublishedScorecardSnapshotPayload(call.p_published_payload)!;
    expect(published.cardType).toBe("producer");
    if (published.cardType !== "producer") throw new Error("Expected Producer published payload.");
    expect(published.member.fullName).toBe("Alex Target");
    expect(published.metricPayload.preview.totalIssuedIpCents).toBe(2_000_000);
    expect(published.score).toEqual({
      ratings: { issuedIp: 3, trackingConsistency: 4, leadSpend: 3 },
      overall: 3.25,
    });
    expect(state.publishCalls.some((entry) => entry.p_person_id === "person-b")).toBe(false);
  });

  it("generates a valid Producer with Personal IP 0 and 0 stars even when Team IP is non-zero", async () => {
    const state = fakeState();
    sourceState.noIp = true;
    const result = await generateManualScorecardWithClient(fakeClient(state), {
      initiatedBy: "admin",
      personId: "person-a",
      cardType: "producer",
      period: monthly,
    });

    expect(result.status).toBe("success");
    const call = state.publishCalls[0];
    const published = parsePublishedScorecardSnapshotPayload(call.p_published_payload)!;
    if (published.cardType !== "producer") throw new Error("Expected Producer published payload.");
    expect(published.metricPayload.preview.totalIssuedIpCents).toBe(0);
    expect(published.score.ratings.issuedIp).toBe(0);
    expect(state.gatewayRows.some((row) => row.person_id === "person-a" && Number(row.team_ip_cents) > 0)).toBe(true);
    expect(state.counts).toEqual({ runs: 1, snapshots: 1, deliveries: 1 });
  });

  it("publishes one targeted Builder using subtree support without subtree Scorecard artifacts", async () => {
    const state = fakeState();
    const result = await generateManualScorecardWithClient(fakeClient(state), {
      initiatedBy: "admin",
      personId: "person-a",
      cardType: "builder",
      period: monthly,
    });

    expect(result.status).toBe("success");
    expect(state.publishCalls).toHaveLength(1);
    const call = state.publishCalls[0];
    expect(call.p_person_id).toBe("person-a");
    expect(call.p_card_type).toBe("builder");
    const published = parsePublishedScorecardSnapshotPayload(call.p_published_payload)!;
    expect(published.cardType).toBe("builder");
    if (published.cardType !== "builder") throw new Error("Expected Builder published payload.");
    expect(published.metricPayload.growth).toMatchObject({ priorTeamIpCents: 2_000_000, currentTeamIpCents: 4_000_000, percentage: 100 });
    expect(published.metricPayload.firstLegPercent).toBe(31.25);
    expect(published.metricPayload.activeWriters).toBe(1);
    expect(published.metricPayload.averageMonthlyIpPerWriterCents).toBe(2_000_000);
    expect(published.metricPayload.recruitsAdded).toBe(1);
    expect(published.metricPayload.performance.teamDials.value).toBe(8);
    expect(state.publishCalls.some((entry) => entry.p_person_id === "person-b")).toBe(false);
  });

  it("keeps dual-role Producer and Builder publications distinct for the same person and period", async () => {
    const state = fakeState();
    const client = fakeClient(state);
    const producer = await generateManualScorecardWithClient(client, { initiatedBy: "admin", personId: "person-a", cardType: "producer", period: monthly });
    const builder = await generateManualScorecardWithClient(client, { initiatedBy: "admin", personId: "person-a", cardType: "builder", period: monthly });

    expect(producer).toMatchObject({ status: "success", snapshotId: "snapshot-1" });
    expect(builder).toMatchObject({ status: "success", snapshotId: "snapshot-2" });
    expect(state.counts).toEqual({ runs: 2, snapshots: 2, deliveries: 2 });
  });

  it("returns the existing canonical artifact for an exact duplicate without increasing counts", async () => {
    const state = fakeState();
    const client = fakeClient(state);
    const first = await generateManualScorecardWithClient(client, { initiatedBy: "admin", personId: "person-a", cardType: "producer", period: monthly });
    const countsAfterFirst = { ...state.counts };
    const second = await generateManualScorecardWithClient(client, { initiatedBy: "admin", personId: "person-a", cardType: "producer", period: monthly });

    expect(first).toMatchObject({ status: "success", snapshotId: "snapshot-1" });
    expect(second).toMatchObject({ status: "existing", snapshotId: "snapshot-1" });
    expect(state.counts).toEqual(countsAfterFirst);
  });

  it("keeps the first manually published frozen payload unchanged when later source truth changes", async () => {
    const state = fakeState();
    const client = fakeClient(state);
    const first = await generateManualScorecardWithClient(client, {
      initiatedBy: "admin",
      personId: "person-a",
      cardType: "producer",
      period: monthly,
    });
    const storedBefore = structuredClone([...state.published.values()][0].payload);

    sourceState.noIp = true;
    const duplicate = await generateManualScorecardWithClient(client, {
      initiatedBy: "admin",
      personId: "person-a",
      cardType: "producer",
      period: monthly,
    });

    expect(first.status).toBe("success");
    expect(duplicate).toMatchObject({ status: "existing", snapshotId: "snapshot-1" });
    expect([...state.published.values()][0].payload).toEqual(storedBefore);
    const frozen = parsePublishedScorecardSnapshotPayload(storedBefore)!;
    expect(frozen.schemaVersion).toBe("scorecard-published-v1");
    if (frozen.cardType !== "producer") throw new Error("Expected Producer published payload.");
    expect(frozen.metricPayload.preview.totalIssuedIpCents).toBe(2_000_000);
  });
  it("converges simultaneous duplicate requests on one canonical publication", async () => {
    const state = fakeState();
    const client = fakeClient(state);
    const [left, right] = await Promise.all([
      generateManualScorecardWithClient(client, { initiatedBy: "admin", personId: "person-a", cardType: "producer", period: monthly }),
      generateManualScorecardWithClient(client, { initiatedBy: "admin", personId: "person-a", cardType: "producer", period: monthly }),
    ]);

    expect(new Set([left.status, right.status])).toEqual(new Set(["success", "existing"]));
    expect("snapshotId" in left ? left.snapshotId : null).toBe("snapshot-1");
    expect("snapshotId" in right ? right.snapshotId : null).toBe("snapshot-1");
    expect(state.counts).toEqual({ runs: 1, snapshots: 1, deliveries: 1 });
  });

  it("rejects an unauthorized direct service invocation before any publication mutation", async () => {
    const state = fakeState();
    state.adminAllowed = false;
    const result = await generateManualScorecardWithClient(fakeClient(state), {
      initiatedBy: "admin",
      personId: "person-a",
      cardType: "producer",
      period: monthly,
    });

    expect(result.status).toBe("unauthorized");
    expect(state.counts).toEqual({ runs: 0, snapshots: 0, deliveries: 0 });
    expect(state.publishCalls).toEqual([]);
  });

  it("leaves Person B publication state untouched when generating for Person A", async () => {
    const state = fakeState();
    const beforeB = state.publishCalls.filter((call) => call.p_person_id === "person-b").length;
    await generateManualScorecardWithClient(fakeClient(state), {
      initiatedBy: "admin",
      personId: "person-a",
      cardType: "producer",
      period: monthly,
    });
    const afterB = state.publishCalls.filter((call) => call.p_person_id === "person-b").length;

    expect(afterB).toBe(beforeB);
    expect(state.published.size).toBe(1);
  });

  it("fails safely for missing people and inapplicable cards without partial artifacts", async () => {
    const missingState = fakeState();
    const missing = await generateManualScorecardWithClient(fakeClient(missingState), {
      initiatedBy: "admin",
      personId: "missing-person",
      cardType: "producer",
      period: monthly,
    });
    expect(missing.status).toBe("person_not_found");
    expect(missingState.counts).toEqual({ runs: 0, snapshots: 0, deliveries: 0 });

    const inapplicableState = fakeState();
    const inapplicable = await generateManualScorecardWithClient(fakeClient(inapplicableState), {
      initiatedBy: "admin",
      personId: "person-b",
      cardType: "builder",
      period: monthly,
    });
    expect(inapplicable.status).toBe("card_not_applicable");
    expect(inapplicableState.counts).toEqual({ runs: 0, snapshots: 0, deliveries: 0 });
  });

  it.each([
    ["Monthly", monthly],
    ["Quarterly", { kind: "quarterly" as const, start: "2026-04-01", end: "2026-06-30", label: "Q2 2026" }],
    ["Annual", { kind: "annual" as const, start: "2025-01-01", end: "2025-12-31", label: "2025" }],
  ])("reuses canonical %s period semantics", async (_label, period) => {
    const state = fakeState();
    sourceState.currentStart = period.start;
    const result = await generateManualScorecardWithClient(fakeClient(state), {
      initiatedBy: "admin",
      personId: "person-a",
      cardType: "producer",
      period,
    });

    expect(result.status).toBe("success");
    const published = parsePublishedScorecardSnapshotPayload(state.publishCalls[0].p_published_payload)!;
    expect(published.period).toMatchObject({
      kind: period.kind,
      start: period.start,
      end: period.end,
      label: period.label,
    });
  });

  it("rejects a non-canonical period before any publication mutation", async () => {
    const state = fakeState();
    const result = await generateManualScorecardWithClient(fakeClient(state), {
      initiatedBy: "admin",
      personId: "person-a",
      cardType: "producer",
      period: { kind: "monthly", start: "2026-08-02", end: "2026-08-31", label: "August 2026" },
    });

    expect(result.status).toBe("invalid_period");
    expect(state.counts).toEqual({ runs: 0, snapshots: 0, deliveries: 0 });
  });
});