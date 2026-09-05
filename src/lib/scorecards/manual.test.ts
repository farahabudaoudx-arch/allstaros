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

import { generateManualScorecardWithClient, generateScorecardCorrectionWithClient } from "./manual";
import { parsePublishedScorecardSnapshotPayload } from "./published-snapshot";

type ImportRow = {
  id: string;
  person_id: string;
  source_kind: "personal_gateway";
  pull_kind: "monday" | "reconnect" | "first_connect";
  period_type: "wtd";
  status: "imported" | "no_new_report" | "failed";
  report_date: string;
  period_start: string;
  scorecard_period_start: string;
  scorecard_period_end: string;
  gateway_week_ordinal: number;
  gateway_period_final: boolean;
  gateway_label: string | null;
  source_checksum: string;
  matched_count: number;
  unmatched_count: number;
  ambiguous_count: number;
  summary: unknown;
  created_at: string;
};

type SnapshotRow = {
  id: string;
  person_id: string;
  card_type: "producer" | "builder";
  period_kind: "monthly" | "quarterly" | "annual";
  period_start: string;
  period_end: string;
  lifecycle_status: "final" | "corrected";
  revision: number;
  prior_revision_id: string | null;
  finalized_at: string;
  metric_run_id: string;
  kpi_results: unknown;
  correction_reason: string | null;
};

function correctionComparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(correctionComparable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "generatedAt")
      .map(([key, entry]) => [key, correctionComparable(entry)]));
  }
  return value;
}

type FakeState = {
  adminAllowed: boolean;
  people: Set<string>;
  imports: ImportRow[];
  contexts: Record<string, Array<Record<string, unknown>>>;
  gatewayRows: Array<Record<string, unknown>>;
  published: Map<string, { snapshotId: string; runId: string; deliveryId: string; payload: unknown }>;
  snapshots: SnapshotRow[];
  counts: { runs: number; snapshots: number; deliveries: number };
  publishCalls: Array<Record<string, unknown>>;
  correctionCalls: Array<Record<string, unknown>>;
  correctionPublishError: string | null;
};

class FakeQuery {
  private filters = new Map<string, unknown>();
  private lower: string | null = null;
  private upper: string | null = null;
  private selection = "";
  private inFilters = new Map<string, unknown[]>();
  private nonNull = new Set<string>();

  constructor(private table: string, private state: FakeState) {}
  select(value: string) { this.selection = value; return this; }
  eq(column: string, value: unknown) { this.filters.set(column, value); return this; }
  not(column: string, operator: string, value: unknown) {
    if (operator === "is" && value === null) this.nonNull.add(column);
    return this;
  }
  gte(_column: string, value: string) { this.lower = value; return this; }
  lte(_column: string, value: string) { this.upper = value; return this; }
  or() { return this; }
  order() { return this; }
  limit() { return this; }
  in(column: string, values: unknown[]) { this.inFilters.set(column, values); return this; }

  async maybeSingle() {
    if (this.table === "scorecard_snapshot") {
      let rows = this.state.snapshots.filter((row) => {
        for (const [column, value] of this.filters) {
          if ((row as unknown as Record<string, unknown>)[column] !== value) return false;
        }
        for (const [column, values] of this.inFilters) {
          if (!values.includes((row as unknown as Record<string, unknown>)[column])) return false;
        }
        for (const column of this.nonNull) {
          if ((row as unknown as Record<string, unknown>)[column] == null) return false;
        }
        return true;
      });
      rows = rows.sort((left, right) => right.revision - left.revision);
      return { data: rows[0] ?? null, error: null };
    }
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
      const rows = this.state.imports.filter((row) => {
        if (this.lower && row.report_date < this.lower) return false;
        if (this.upper && row.report_date > this.upper) return false;
        for (const [column, value] of this.filters) {
          if ((row as unknown as Record<string, unknown>)[column] !== value) return false;
        }
        for (const [column, values] of this.inFilters) {
          if (!values.includes((row as unknown as Record<string, unknown>)[column])) return false;
        }
        for (const column of this.nonNull) {
          if ((row as unknown as Record<string, unknown>)[column] == null) return false;
        }
        return true;
      });
      return { data: rows, error: null };
    }
    if (this.table === "scorecard_snapshot") {
      const rows = this.state.snapshots.filter((row) => {
        for (const [column, value] of this.filters) {
          if ((row as unknown as Record<string, unknown>)[column] !== value) return false;
        }
        for (const [column, values] of this.inFilters) {
          if (!values.includes((row as unknown as Record<string, unknown>)[column])) return false;
        }
        for (const column of this.nonNull) {
          if ((row as unknown as Record<string, unknown>)[column] == null) return false;
        }
        return true;
      });
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


function builderPeerSnapshot({
  id,
  personId,
  revision = 1,
  teamIpCents,
  representedInGateway = true,
  recruitsAdded,
  recruitingPopulation = 3,
}: {
  id: string;
  personId: string;
  revision?: number;
  teamIpCents: number;
  representedInGateway?: boolean;
  recruitsAdded: number;
  recruitingPopulation?: number;
}): SnapshotRow {
  return {
    id,
    person_id: personId,
    card_type: "builder",
    period_kind: "monthly",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    lifecycle_status: revision === 1 ? "final" : "corrected",
    revision,
    prior_revision_id: revision === 1 ? null : `${personId}-revision-${revision - 1}`,
    finalized_at: `2026-09-0${Math.min(revision + 1, 9)}T12:00:00.000Z`,
    metric_run_id: `run-${id}`,
    correction_reason: revision === 1 ? null : "Peer correction",
    kpi_results: {
      schemaVersion: "scorecard-published-v1",
      cardType: "builder",
      metricPayload: {
        teamIpCents,
        teamRank: representedInGateway ? { rank: 1, population: recruitingPopulation } : null,
        teamRankUnavailableReason: representedInGateway ? null : "not_represented_in_gateway",
        recruitsAdded,
        recruitingRank: { rank: 1, population: recruitingPopulation },
      },
    },
  };
}

function seedBuilderRankPeers(state: FakeState) {
  state.snapshots.push(
    builderPeerSnapshot({ id: "peer-c", personId: "person-c", teamIpCents: 5_000_000, recruitsAdded: 2 }),
    builderPeerSnapshot({ id: "peer-d", personId: "person-d", teamIpCents: 1_000_000, recruitsAdded: 0 }),
  );
}

function mondayDates(start: string, end: string): string[] {
  const result: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const stop = new Date(`${end}T00:00:00.000Z`);
  while (cursor <= stop) {
    if (cursor.getUTCDay() === 1) result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function seedPersonalGatewayEvidence(
  imports: ImportRow[],
  gatewayRows: Array<Record<string, unknown>>,
  personId: string,
  start: string,
  end: string,
) {
  for (const reportDate of mondayDates(start, end)) {
    const importId = `import-${personId}-${reportDate}`;
    const monthStart = `${reportDate.slice(0, 7)}-01`;
    const [year, month] = reportDate.slice(0, 7).split("-").map(Number);
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const monthMondays = mondayDates(monthStart, monthEnd);
    const weekOrdinal = monthMondays.indexOf(reportDate) + 1;
    imports.push({
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
    gatewayRows.push({
      id: `premium-${personId}-${reportDate}`,
      import_id: importId,
      person_id: personId,
      source_kind: "personal_gateway",
      report_date: reportDate,
      period_start: reportDate,
      scorecard_period_start: monthStart,
      scorecard_period_end: monthEnd,
      gateway_week_ordinal: weekOrdinal,
      gateway_period_final: weekOrdinal === monthMondays.length,
      personal_ip_cents: 0,
      team_ip_cents: 0,
      first_leg_percent: null,
    });
  }
}

function setGatewayValues(
  rows: Array<Record<string, unknown>>,
  personId: string,
  reportDate: string,
  values: { personalIpCents?: number; teamIpCents?: number; firstLegPercent?: number | null },
) {
  const row = rows.find((candidate) => candidate.person_id === personId && candidate.report_date === reportDate);
  if (!row) throw new Error(`Missing seeded Gateway row for ${personId} on ${reportDate}.`);
  if (values.personalIpCents != null) row.personal_ip_cents = values.personalIpCents;
  if (values.teamIpCents != null) row.team_ip_cents = values.teamIpCents;
  if (Object.prototype.hasOwnProperty.call(values, "firstLegPercent")) row.first_leg_percent = values.firstLegPercent ?? null;
}

function fakeState(): FakeState {
  const imports: ImportRow[] = [];
  const gatewayRows: Array<Record<string, unknown>> = [];
  seedPersonalGatewayEvidence(imports, gatewayRows, "person-a", "2025-01-01", "2026-08-31");
  seedPersonalGatewayEvidence(imports, gatewayRows, "person-b", "2026-07-01", "2026-08-31");

  setGatewayValues(gatewayRows, "person-a", "2026-07-27", { teamIpCents: 2_000_000, firstLegPercent: 40 });
  setGatewayValues(gatewayRows, "person-a", "2026-08-03", { teamIpCents: 1_000_000, firstLegPercent: 50 });
  setGatewayValues(gatewayRows, "person-a", "2026-08-10", { teamIpCents: 3_000_000, firstLegPercent: 25 });
  setGatewayValues(gatewayRows, "person-a", "2026-08-31", { personalIpCents: 2_000_000 });
  setGatewayValues(gatewayRows, "person-b", "2026-08-10", { personalIpCents: 100_000, teamIpCents: 100_000, firstLegPercent: 10 });

  return {
    adminAllowed: true,
    people: new Set(["admin", "person-a", "person-b"]),
    imports,
    contexts: {
      "person-a": context("person-a"),
      "person-b": context("person-b", false).slice(0, 1),
    },
    gatewayRows,
    published: new Map(),
    snapshots: [],
    counts: { runs: 0, snapshots: 0, deliveries: 0 },
    publishCalls: [],
    correctionCalls: [],
    correctionPublishError: null,
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
        state.snapshots.push({
          id: created.snapshotId,
          person_id: String(args.p_person_id),
          card_type: args.p_card_type as "producer" | "builder",
          period_kind: args.p_period_kind as "monthly" | "quarterly" | "annual",
          period_start: String(args.p_period_start),
          period_end: String(args.p_period_end),
          lifecycle_status: "final",
          revision: Number(args.p_revision),
          prior_revision_id: null,
          finalized_at: "2026-09-03T12:00:00.000Z",
          metric_run_id: created.runId,
          kpi_results: args.p_published_payload,
          correction_reason: null,
        });
        state.counts.runs += 1;
        state.counts.snapshots += 1;
        state.counts.deliveries += 1;
        return { data: [{ snapshot_id: created.snapshotId, run_id: created.runId, delivery_id: created.deliveryId, existing: false }], error: null };
      }
      if (name === "publish_manual_scorecard_correction") {
        state.correctionCalls.push(args);
        if (state.correctionPublishError) {
          return { data: null, error: { message: state.correctionPublishError, code: "P0001", details: null, hint: null } };
        }
        const prior = state.snapshots.find((row) => row.id === String(args.p_prior_snapshot_id));
        if (!prior) return { data: null, error: { message: "Correction requires a finalized prior Scorecard.", code: "P0001", details: null, hint: null } };
        const nextRevision = prior.revision + 1;
        const existingChild = state.snapshots.find((row) =>
          row.person_id === prior.person_id && row.card_type === prior.card_type && row.period_kind === prior.period_kind &&
          row.period_start === prior.period_start && row.period_end === prior.period_end && row.revision === nextRevision &&
          row.prior_revision_id === prior.id && row.lifecycle_status === "corrected");
        if (existingChild) {
          const samePayload = JSON.stringify(correctionComparable(existingChild.kpi_results)) === JSON.stringify(correctionComparable(args.p_published_payload));
          const sameReason = existingChild.correction_reason === String(args.p_correction_reason).trim();
          if (!samePayload || !sameReason) {
            return { data: null, error: { message: "A newer Scorecard revision already exists. Correct the latest revision.", code: "P0001", details: null, hint: null } };
          }
          return { data: [{ snapshot_id: existingChild.id, run_id: existingChild.metric_run_id, delivery_id: `delivery-${existingChild.id}`, existing: true }], error: null };
        }
        const latest = state.snapshots
          .filter((row) => row.person_id === prior.person_id && row.card_type === prior.card_type && row.period_kind === prior.period_kind && row.period_start === prior.period_start && row.period_end === prior.period_end)
          .sort((left, right) => right.revision - left.revision)[0];
        if (!latest || latest.id !== prior.id) {
          return { data: null, error: { message: "A newer Scorecard revision already exists. Correct the latest revision.", code: "P0001", details: null, hint: null } };
        }
        if (JSON.stringify(correctionComparable(prior.kpi_results)) === JSON.stringify(correctionComparable(args.p_published_payload))) {
          return { data: null, error: { message: "Correction did not change published Scorecard values.", code: "P0001", details: null, hint: null } };
        }
        const sequence = state.snapshots.length + 1;
        const created: SnapshotRow = {
          id: `snapshot-${sequence}`,
          person_id: prior.person_id,
          card_type: prior.card_type,
          period_kind: prior.period_kind,
          period_start: prior.period_start,
          period_end: prior.period_end,
          lifecycle_status: "corrected",
          revision: nextRevision,
          prior_revision_id: prior.id,
          finalized_at: "2026-09-03T12:05:00.000Z",
          metric_run_id: `run-${sequence}`,
          kpi_results: args.p_published_payload,
          correction_reason: String(args.p_correction_reason).trim(),
        };
        state.snapshots.push(created);
        state.counts.runs += 1;
        state.counts.snapshots += 1;
        state.counts.deliveries += 1;
        return { data: [{ snapshot_id: created.id, run_id: created.metric_run_id, delivery_id: `delivery-${sequence}`, existing: false }], error: null };
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
    seedBuilderRankPeers(state);
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
    expect(published.metricPayload.teamRank).toEqual({ rank: 2, population: 3 });
    expect(published.metricPayload.recruitingRank).toEqual({ rank: 2, population: 3 });
    expect(published.metricPayload.performance.teamDials.value).toBe(8);
    expect(state.publishCalls.some((entry) => entry.p_person_id === "person-b")).toBe(false);
  });

  it("keeps dual-role Producer and Builder publications distinct for the same person and period", async () => {
    const state = fakeState();
    seedBuilderRankPeers(state);
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


describe("published Scorecard correction", () => {
  it("publishes the next immutable revision from current canonical source truth", async () => {
    const state = fakeState();
    const client = fakeClient(state);
    const first = await generateManualScorecardWithClient(client, {
      initiatedBy: "admin",
      personId: "person-a",
      cardType: "producer",
      period: monthly,
    });
    expect(first).toMatchObject({ status: "success", snapshotId: "snapshot-1" });
    if (!("snapshotId" in first)) throw new Error("Expected initial publication.");
    const frozenFirst = structuredClone(state.snapshots[0]);

    sourceState.noIp = true;
    const correction = await generateScorecardCorrectionWithClient(client, {
      initiatedBy: "admin",
      snapshotId: first.snapshotId,
      correctionReason: "Gateway source row corrected after reconciliation",
    });

    expect(correction).toMatchObject({ status: "success", snapshotId: "snapshot-2", runId: "run-2" });
    expect(state.correctionCalls).toHaveLength(1);
    expect(state.correctionCalls[0]).toMatchObject({
      p_prior_snapshot_id: "snapshot-1",
      p_correction_reason: "Gateway source row corrected after reconciliation",
    });
    expect(state.snapshots[0]).toEqual(frozenFirst);
    expect(state.snapshots[1]).toMatchObject({
      id: "snapshot-2",
      revision: 2,
      lifecycle_status: "corrected",
      prior_revision_id: "snapshot-1",
      correction_reason: "Gateway source row corrected after reconciliation",
    });
    const corrected = parsePublishedScorecardSnapshotPayload(state.snapshots[1].kpi_results)!;
    if (corrected.cardType !== "producer") throw new Error("Expected corrected Producer payload.");
    expect(corrected.metricPayload.preview.totalIssuedIpCents).toBe(0);
    expect(state.counts).toEqual({ runs: 2, snapshots: 2, deliveries: 2 });
  });

  it("suppresses a correction when canonical published values did not change", async () => {
    const state = fakeState();
    const client = fakeClient(state);
    const first = await generateManualScorecardWithClient(client, {
      initiatedBy: "admin",
      personId: "person-a",
      cardType: "producer",
      period: monthly,
    });
    if (!("snapshotId" in first)) throw new Error("Expected initial publication.");
    const countsAfterFirst = { ...state.counts };

    const correction = await generateScorecardCorrectionWithClient(client, {
      initiatedBy: "admin",
      snapshotId: first.snapshotId,
      correctionReason: "Rechecked source truth with no visible changes",
    });

    expect(correction.status).toBe("no_changes");
    expect(state.correctionCalls).toEqual([]);
    expect(state.counts).toEqual(countsAfterFirst);
    expect(state.snapshots).toHaveLength(1);
  });

  it("rejects a stale selected revision before recapturing or publishing", async () => {
    const state = fakeState();
    const client = fakeClient(state);
    const first = await generateManualScorecardWithClient(client, {
      initiatedBy: "admin",
      personId: "person-a",
      cardType: "producer",
      period: monthly,
    });
    if (!("snapshotId" in first)) throw new Error("Expected initial publication.");
    state.snapshots.push({
      ...structuredClone(state.snapshots[0]),
      id: "snapshot-newer",
      revision: 2,
      lifecycle_status: "corrected",
      prior_revision_id: first.snapshotId,
      metric_run_id: "run-newer",
      correction_reason: "Already corrected by another admin",
      finalized_at: "2026-09-03T12:10:00.000Z",
    });

    sourceState.noIp = true;
    const correction = await generateScorecardCorrectionWithClient(client, {
      initiatedBy: "admin",
      snapshotId: first.snapshotId,
      correctionReason: "Attempt to branch from stale revision",
    });

    expect(correction.status).toBe("stale_revision");
    expect(state.correctionCalls).toEqual([]);
    expect(state.counts).toEqual({ runs: 1, snapshots: 1, deliveries: 1 });
  });

  it("maps a database race that creates a newer revision to stale_revision", async () => {
    const state = fakeState();
    const client = fakeClient(state);
    const first = await generateManualScorecardWithClient(client, {
      initiatedBy: "admin",
      personId: "person-a",
      cardType: "producer",
      period: monthly,
    });
    if (!("snapshotId" in first)) throw new Error("Expected initial publication.");
    state.correctionPublishError = "A newer Scorecard revision already exists. Correct the latest revision.";
    sourceState.noIp = true;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const correction = await generateScorecardCorrectionWithClient(client, {
      initiatedBy: "admin",
      snapshotId: first.snapshotId,
      correctionReason: "Concurrent correction race from another admin",
    });
    errorSpy.mockRestore();

    expect(correction.status).toBe("stale_revision");
    expect(state.correctionCalls).toHaveLength(1);
    expect(state.counts).toEqual({ runs: 1, snapshots: 1, deliveries: 1 });
  });

  it("converges concurrent exact correction retries on one immutable child revision", async () => {
    const state = fakeState();
    const client = fakeClient(state);
    const first = await generateManualScorecardWithClient(client, {
      initiatedBy: "admin",
      personId: "person-a",
      cardType: "producer",
      period: monthly,
    });
    if (!("snapshotId" in first)) throw new Error("Expected initial publication.");
    sourceState.noIp = true;

    const [left, right] = await Promise.all([
      generateScorecardCorrectionWithClient(client, {
        initiatedBy: "admin",
        snapshotId: first.snapshotId,
        correctionReason: "Same corrected Gateway row after reconciliation",
      }),
      generateScorecardCorrectionWithClient(client, {
        initiatedBy: "admin",
        snapshotId: first.snapshotId,
        correctionReason: "Same corrected Gateway row after reconciliation",
      }),
    ]);

    expect(new Set([left.status, right.status])).toEqual(new Set(["success", "existing"]));
    expect("snapshotId" in left ? left.snapshotId : null).toBe("snapshot-2");
    expect("snapshotId" in right ? right.snapshotId : null).toBe("snapshot-2");
    expect(state.snapshots).toHaveLength(2);
    expect(state.counts).toEqual({ runs: 2, snapshots: 2, deliveries: 2 });
  });

  it("allows only one of two conflicting concurrent corrections to create the next revision", async () => {
    const state = fakeState();
    const client = fakeClient(state);
    const first = await generateManualScorecardWithClient(client, {
      initiatedBy: "admin",
      personId: "person-a",
      cardType: "producer",
      period: monthly,
    });
    if (!("snapshotId" in first)) throw new Error("Expected initial publication.");
    sourceState.noIp = true;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const [left, right] = await Promise.all([
      generateScorecardCorrectionWithClient(client, {
        initiatedBy: "admin",
        snapshotId: first.snapshotId,
        correctionReason: "Correction reason from request A",
      }),
      generateScorecardCorrectionWithClient(client, {
        initiatedBy: "admin",
        snapshotId: first.snapshotId,
        correctionReason: "Correction reason from request B",
      }),
    ]);
    errorSpy.mockRestore();

    expect(new Set([left.status, right.status])).toEqual(new Set(["success", "stale_revision"]));
    expect(state.snapshots).toHaveLength(2);
    expect(state.snapshots[1].revision).toBe(2);
    expect(["Correction reason from request A", "Correction reason from request B"]).toContain(state.snapshots[1].correction_reason);
    expect(state.counts).toEqual({ runs: 2, snapshots: 2, deliveries: 2 });
  });

  it("recomputes a Builder correction rank against latest frozen peer revisions while publishing only the target", async () => {
    const state = fakeState();
    state.snapshots.push(
      builderPeerSnapshot({ id: "peer-c-old", personId: "person-c", revision: 1, teamIpCents: 10_000_000, recruitsAdded: 2 }),
      builderPeerSnapshot({ id: "peer-c-new", personId: "person-c", revision: 2, teamIpCents: 5_000_000, recruitsAdded: 2 }),
      builderPeerSnapshot({ id: "peer-d", personId: "person-d", teamIpCents: 1_000_000, recruitsAdded: 0 }),
    );
    const client = fakeClient(state);
    const initial = await generateManualScorecardWithClient(client, {
      initiatedBy: "admin",
      personId: "person-a",
      cardType: "builder",
      period: monthly,
    });
    expect(initial.status).toBe("success");
    if (!("snapshotId" in initial)) throw new Error("Expected initial Builder publication.");
    const initialSnapshot = state.snapshots.find((row) => row.id === initial.snapshotId)!;
    const initialPayload = parsePublishedScorecardSnapshotPayload(initialSnapshot.kpi_results)!;
    if (initialPayload.cardType !== "builder") throw new Error("Expected Builder payload.");
    expect(initialPayload.metricPayload.teamRank).toEqual({ rank: 2, population: 3 });
    expect(initialPayload.metricPayload.recruitingRank).toEqual({ rank: 2, population: 3 });

    const targetGatewayRow = state.gatewayRows.find((row) =>
      row.person_id === "person-a" && row.report_date === "2026-08-03")!;
    targetGatewayRow.team_ip_cents = 4_000_000;
    const peerSnapshotsBefore = state.snapshots
      .filter((row) => row.person_id === "person-c" || row.person_id === "person-d")
      .map((row) => structuredClone(row));

    const correction = await generateScorecardCorrectionWithClient(client, {
      initiatedBy: "admin",
      snapshotId: initial.snapshotId,
      correctionReason: "Corrected Builder Team IP after Gateway reconciliation",
    });
    expect(correction.status).toBe("success");
    if (!("snapshotId" in correction)) throw new Error("Expected corrected Builder publication.");
    const correctedSnapshot = state.snapshots.find((row) => row.id === correction.snapshotId)!;
    const correctedPayload = parsePublishedScorecardSnapshotPayload(correctedSnapshot.kpi_results)!;
    if (correctedPayload.cardType !== "builder") throw new Error("Expected corrected Builder payload.");
    expect(correctedPayload.metricPayload.teamIpCents).toBe(7_000_000);
    expect(correctedPayload.metricPayload.teamRank).toEqual({ rank: 1, population: 3 });
    expect(correctedPayload.metricPayload.recruitingRank).toEqual({ rank: 2, population: 3 });
    expect(state.snapshots.filter((row) => row.person_id === "person-a" && row.card_type === "builder")).toHaveLength(2);
    expect(state.snapshots.filter((row) => row.person_id === "person-c" || row.person_id === "person-d")).toEqual(peerSnapshotsBefore);
    expect(state.counts).toEqual({ runs: 2, snapshots: 2, deliveries: 2 });
  });

  it("requires an authorized admin before loading a correction target", async () => {
    const state = fakeState();
    state.adminAllowed = false;
    const result = await generateScorecardCorrectionWithClient(fakeClient(state), {
      initiatedBy: "admin",
      snapshotId: "snapshot-does-not-matter",
      correctionReason: "Valid audit reason",
    });

    expect(result.status).toBe("unauthorized");
    expect(state.correctionCalls).toEqual([]);
  });
});
