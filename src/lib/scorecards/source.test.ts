import { describe, expect, it } from "vitest";
import { createMonthlyProducerPreview } from "./lifecycle";
import {
  currentMonthlyPeriod,
  expectedDatesForSchedule,
  expectedDatesForScheduleHistory,
  loadCurrentMonthlyProducerSource,
  loadProducerLeadSpendCents,
  loadProducerSourceForPeriod,
  loadProducerTrackingRows,
  monthlyLeadSpendTotals,
  monthlyProducerSourceFromRows,
  rankForPositiveTotal,
  rankForTotal,
} from "./source";

function fakeTrackingSource(args: {
  rows?: unknown[];
  error?: { message: string } | null;
  reject?: Error;
}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const query = {
    select(columns: string) {
      calls.push(["select", columns]);
      return this;
    },
    eq(column: string, value: unknown) {
      calls.push(["eq", column, value]);
      return this;
    },
    gte(column: string, value: unknown) {
      calls.push(["gte", column, value]);
      return this;
    },
    lte(column: string, value: unknown) {
      calls.push(["lte", column, value]);
      if (args.reject) return Promise.reject(args.reject);
      return Promise.resolve({ data: args.rows ?? [], error: args.error ?? null });
    },
  };
  return {
    client: {
      from(table: string) {
        calls.push(["from", table]);
        return query;
      },
    },
    calls,
  };
}

function fakeAnalyticsSource(args: {
  data?: unknown;
  error?: { message: string } | null;
  reject?: Error;
}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    client: {
      from() {
        throw new Error("Lead Spend source must use the canonical analytics RPC");
      },
      rpc(name: string, rpcArgs: Record<string, unknown>) {
        calls.push({ name, args: rpcArgs });
        if (args.reject) return Promise.reject(args.reject);
        return Promise.resolve({ data: args.data ?? null, error: args.error ?? null });
      },
    },
    calls,
  };
}

function fakeMonthlyProducerSource(args: {
  imports?: unknown[];
  premiumRows?: unknown[];
  importError?: { message: string } | null;
  premiumError?: { message: string } | null;
  rejectTable?: string;
}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const resultFor = (table: string) => table === "gateway_issued_premium_import"
    ? { data: args.imports ?? [], error: args.importError ?? null }
    : { data: args.premiumRows ?? [], error: args.premiumError ?? null };

  const queryFor = (table: string) => ({
    select(columns: string) {
      calls.push(["select", table, columns]);
      return this;
    },
    eq(column: string, value: unknown) {
      calls.push(["eq", table, column, value]);
      return this;
    },
    gte(column: string, value: unknown) {
      calls.push(["gte", table, column, value]);
      return this;
    },
    lte(column: string, value: unknown) {
      calls.push(["lte", table, column, value]);
      return this;
    },
    order(column: string) {
      calls.push(["order", table, column]);
      if (args.rejectTable === table) return Promise.reject(new Error(`${table} unavailable`));
      return Promise.resolve(resultFor(table));
    },
  });

  return {
    client: {
      from(table: string) {
        calls.push(["from", table]);
        return queryFor(table);
      },
    },
    calls,
  };
}

describe("monthly Producer source adapter", () => {
  it("ranks Lead Spend across the active population for the requested month", () => {
    expect([...monthlyLeadSpendTotals({
      activeIds: ["producer-a", "producer-b", "producer-c"],
      period: { start: "2026-07-01", end: "2026-07-31" },
      rows: [
        { person_id: "producer-a", amount: 1_250, purchase_date: "2026-07-10", created_at: "2026-08-01T00:00:00Z" },
        { person_id: "producer-a", amount: 250, purchase_date: "2026-07-20", created_at: "2026-07-20T12:00:00Z" },
        { person_id: "producer-b", amount: 500, purchase_date: null, created_at: "2026-08-01T04:30:00Z" },
        { person_id: "producer-b", amount: 900, purchase_date: "2026-08-01", created_at: "2026-07-15T00:00:00Z" },
        { person_id: "not-active", amount: 5_000, purchase_date: "2026-07-10", created_at: "2026-07-10T00:00:00Z" },
      ],
    }).entries()]).toEqual([
      ["producer-a", 150_000],
      ["producer-b", 50_000],
      ["producer-c", 0],
    ]);
  });

  it("uses competition ranking across producers with positive recorded performance", () => {
    expect(rankForPositiveTotal(50, [100, 50, 50, 20, 0])).toEqual({ rank: 2, population: 4 });
    expect(rankForPositiveTotal(0, [100, 50, 50, 20, 0])).toEqual({ rank: null, population: 4 });
  });

  it("retains complete-population ranking for Builder metrics", () => {
    expect(rankForTotal(50, [100, 50, 50, 20, 0])).toEqual({ rank: 2, population: 5 });
    expect(rankForTotal(0, [100, 50, 50, 20, 0])).toEqual({ rank: 5, population: 5 });
  });

  it("applies workday exceptions without marking ordinary days off", () => {
    expect(
      expectedDatesForSchedule({
        periodStart: "2026-08-01",
        periodEnd: "2026-08-07",
        workingWeekdays: [1, 2, 3, 4, 5],
        exceptions: [
          { exception_date: "2026-08-03", is_working_day: false },
          { exception_date: "2026-08-02", is_working_day: true },
        ],
      }),
    ).toEqual(["2026-08-02", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"]);
  });

  it("uses the schedule effective on each date when a schedule changes mid-month", () => {
    expect(
      expectedDatesForScheduleHistory({
        periodStart: "2026-08-03",
        periodEnd: "2026-08-07",
        schedules: [
          { id: "old", effective_from: "2026-08-01", effective_to: "2026-08-04", working_weekdays: [1, 2, 3, 4, 5], created_at: "2026-08-01T00:00:00Z" },
          { id: "new", effective_from: "2026-08-05", effective_to: null, working_weekdays: [1, 3, 5], created_at: "2026-08-05T00:00:00Z" },
        ],
        exceptions: [
          { schedule_id: "new", exception_date: "2026-08-07", is_working_day: false },
        ],
      }),
    ).toEqual(["2026-08-03", "2026-08-04", "2026-08-05"]);
  });

  it("uses America/Chicago when selecting the current month", () => {
    expect(currentMonthlyPeriod(new Date("2026-09-01T04:30:00.000Z"))).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
      label: "August 2026",
    });
  });

  it("loads Gateway WTD rows across an explicit quarterly Scorecard period", async () => {
    const fake = fakeMonthlyProducerSource({
      imports: [{
        id: "import-q3",
        person_id: "producer-1",
        period_type: "wtd",
        status: "imported",
        report_date: "2026-09-21",
        gateway_label: "Q3 Week",
        source_checksum: "q3-checksum",
        matched_count: 1,
        unmatched_count: 0,
        ambiguous_count: 0,
        summary: { samples: { matchReason: null } },
        created_at: "2026-09-21T12:00:00.000Z",
      }],
      premiumRows: [{
        import_id: "import-q3",
        person_id: "producer-1",
        report_date: "2026-09-21",
        gateway_label: "Q3 Week",
        personal_ip_cents: 1_000_000,
        team_ip_cents: 2_000_000,
        first_leg_percent: 20,
      }],
    });

    const source = await loadProducerSourceForPeriod(
      fake.client as never,
      "producer-1",
      { start: "2026-07-01", end: "2026-09-30", label: "Q3 2026" },
      new Date("2026-10-01T12:00:00.000Z"),
    );

    expect(source).toMatchObject({
      periodStart: "2026-07-01",
      periodEnd: "2026-09-30",
      periodLabel: "Q3 2026",
    });
    expect(fake.calls).toContainEqual(["gte", "gateway_issued_premium_import", "report_date", "2026-07-01"]);
    expect(fake.calls).toContainEqual(["lte", "gateway_issued_premium_import", "report_date", "2026-09-30"]);
    expect(fake.calls).toContainEqual(["gte", "producer_issued_premium", "report_date", "2026-07-01"]);
    expect(fake.calls).toContainEqual(["lte", "producer_issued_premium", "report_date", "2026-09-30"]);
  });

  it("keeps organization report dates while exposing only the requested producer", () => {
    const source = monthlyProducerSourceFromRows({
      producerId: "producer-1",
      period: { start: "2026-08-01", end: "2026-08-31", label: "August 2026" },
      generatedAt: "2026-08-20T12:00:00.000Z",
      reportImports: [
        { report_date: "2026-08-07", gateway_label: "August Week 1" },
        { report_date: "2026-08-14", gateway_label: "August Week 2" },
      ],
      rows: [
        { person_id: "other", report_date: "2026-08-07", gateway_label: "August Week 1", personal_ip_cents: 999 },
        { person_id: "producer-1", report_date: "2026-08-14", gateway_label: "August Week 2", personal_ip_cents: 2500000 },
        { person_id: "other", report_date: "2026-08-14", gateway_label: "August Week 2", personal_ip_cents: 888 },
      ],
    });

    expect(source.reportDates).toEqual([
      { reportDate: "2026-08-07", label: "August Week 1" },
      { reportDate: "2026-08-14", label: "August Week 2" },
    ]);
    expect(source.producerRows).toEqual([
      { reportDate: "2026-08-14", personalIpCents: 2500000 },
    ]);
  });

  it("includes an imported report even when it produced no premium rows", () => {
    const source = monthlyProducerSourceFromRows({
      producerId: "producer-1",
      period: { start: "2026-08-01", end: "2026-08-31", label: "August 2026" },
      generatedAt: "2026-08-08T12:00:00.000Z",
      reportImports: [
        { report_date: "2026-08-07", gateway_label: "August Week 1" },
      ],
      rows: [],
    });

    expect(source.reportDates).toEqual([
      { reportDate: "2026-08-07", label: "August Week 1" },
    ]);
    expect(source.producerRows).toEqual([]);
  });
});


describe("Producer scored metric source wiring", () => {
  it("locks Issued Paid to personal_ip_cents even when team_ip_cents is much larger", () => {
    const source = monthlyProducerSourceFromRows({
      producerId: "producer-1",
      period: { start: "2026-08-01", end: "2026-08-31", label: "August 2026" },
      generatedAt: "2026-09-01T12:00:00.000Z",
      reportImports: [{ report_date: "2026-08-07", gateway_label: "August Week 1" }],
      rows: [{
        person_id: "producer-1",
        report_date: "2026-08-07",
        gateway_label: "August Week 1",
        personal_ip_cents: 1_200_000,
        team_ip_cents: 9_900_000,
      } as never],
    });

    expect(createMonthlyProducerPreview(source).totalIssuedIpCents).toBe(1_200_000);
  });

  it("never falls back to team IP when personal IP is missing", () => {
    const source = monthlyProducerSourceFromRows({
      producerId: "producer-1",
      period: { start: "2026-08-01", end: "2026-08-31", label: "August 2026" },
      generatedAt: "2026-09-01T12:00:00.000Z",
      reportImports: [{ report_date: "2026-08-07", gateway_label: "August Week 1" }],
      rows: [{
        person_id: "producer-1",
        report_date: "2026-08-07",
        gateway_label: "August Week 1",
        personal_ip_cents: null,
        team_ip_cents: 9_900_000,
      } as never],
    });

    expect(source.producerRows).toEqual([]);
    expect(createMonthlyProducerPreview(source).totalIssuedIpCents).toBe(0);
  });


  it("scopes personal Gateway evidence and its premium row to the requested producer/month", async () => {
    const fake = fakeMonthlyProducerSource({
      imports: [{
        id: "import-1",
        person_id: "producer-1",
        period_type: "wtd",
        status: "imported",
        report_date: "2026-08-03",
        gateway_label: "August Week 1",
        source_checksum: "checksum-1",
        matched_count: 1,
        unmatched_count: 0,
        ambiguous_count: 0,
        summary: { samples: { matchReason: null } },
        created_at: "2026-08-03T12:00:00.000Z",
      }],
      premiumRows: [{
        import_id: "import-1",
        person_id: "producer-1",
        report_date: "2026-08-03",
        gateway_label: "August Week 1",
        personal_ip_cents: 1_200_000,
        team_ip_cents: 9_900_000,
        first_leg_percent: 30,
      }],
    });

    const source = await loadCurrentMonthlyProducerSource(
      fake.client as never,
      "producer-1",
      new Date("2026-08-20T12:00:00.000Z"),
    );

    expect(createMonthlyProducerPreview(source).totalIssuedIpCents).toBe(1_200_000);
    expect(fake.calls).toContainEqual([
      "select",
      "producer_issued_premium",
      "id, import_id, person_id, report_date, gateway_label, personal_ip_cents, team_ip_cents, first_leg_percent",
    ]);
    expect(fake.calls).toContainEqual(["eq", "gateway_issued_premium_import", "person_id", "producer-1"]);
    expect(fake.calls).toContainEqual(["eq", "producer_issued_premium", "person_id", "producer-1"]);
    expect(fake.calls).toContainEqual(["eq", "producer_issued_premium", "period_type", "wtd"]);
    expect(fake.calls).toContainEqual(["gte", "producer_issued_premium", "report_date", "2026-08-01"]);
    expect(fake.calls).toContainEqual(["lte", "producer_issued_premium", "report_date", "2026-08-31"]);
  });

  it("turns Producer IP source error objects and rejected queries into controlled errors", async () => {
    const sourceError = fakeMonthlyProducerSource({ premiumError: { message: "permission denied" } });
    await expect(loadCurrentMonthlyProducerSource(
      sourceError.client as never,
      "producer-1",
      new Date("2026-08-20T12:00:00.000Z"),
    )).rejects.toThrow("Unable to load Scorecard Producer personal IP: permission denied");

    const rejected = fakeMonthlyProducerSource({ rejectTable: "producer_issued_premium" });
    await expect(loadCurrentMonthlyProducerSource(
      rejected.client as never,
      "producer-1",
      new Date("2026-08-20T12:00:00.000Z"),
    )).rejects.toThrow("Unable to load Scorecard Gateway issued premium: producer_issued_premium unavailable");
  });

  it("loads Tracking from tracker_entry for only the scored person and requested period", async () => {
    const fake = fakeTrackingSource({
      rows: [
        { person_id: "producer-1", entry_date: "2026-08-10", leads: 1, dials: 2, contacts: 3, appointments: 4, presentations: 5, sales: 6 },
        { person_id: "other", entry_date: "2026-08-11", leads: 9, dials: 9, contacts: 9, appointments: 9, presentations: 9, sales: 9 },
        { person_id: "producer-1", entry_date: "2026-09-01", leads: 7, dials: 7, contacts: 7, appointments: 7, presentations: 7, sales: 7 },
      ],
    });

    const rows = await loadProducerTrackingRows(fake.client as never, "producer-1", {
      start: "2026-08-01",
      end: "2026-08-31",
    });

    expect(rows).toEqual([{ entryDate: "2026-08-10", leads: 1, dials: 2, contacts: 3, appointments: 4, presentations: 5, sales: 6 }]);
    expect(fake.calls).toContainEqual(["from", "tracker_entry"]);
    expect(fake.calls).toContainEqual(["eq", "person_id", "producer-1"]);
    expect(fake.calls).toContainEqual(["gte", "entry_date", "2026-08-01"]);
    expect(fake.calls).toContainEqual(["lte", "entry_date", "2026-08-31"]);
  });

  it("treats missing and partial Tracking rows safely", async () => {
    const missing = fakeTrackingSource({ rows: [] });
    await expect(loadProducerTrackingRows(missing.client as never, "producer-1", {
      start: "2026-08-01",
      end: "2026-08-31",
    })).resolves.toEqual([]);

    const partial = fakeTrackingSource({
      rows: [{ person_id: "producer-1", entry_date: "2026-08-10", leads: null, dials: "bad", contacts: 3, appointments: null, presentations: 5, sales: 6 }],
    });
    await expect(loadProducerTrackingRows(partial.client as never, "producer-1", {
      start: "2026-08-01",
      end: "2026-08-31",
    })).resolves.toEqual([{ entryDate: "2026-08-10", leads: null, dials: null, contacts: 3, appointments: null, presentations: 5, sales: 6 }]);
  });

  it("turns Tracking error objects and rejected queries into controlled source errors", async () => {
    const relationError = fakeTrackingSource({ error: { message: 'relation "tracker_entry" does not exist' } });
    await expect(loadProducerTrackingRows(relationError.client as never, "producer-1", {
      start: "2026-08-01",
      end: "2026-08-31",
    })).rejects.toThrow('Unable to load Scorecard Tracking: relation "tracker_entry" does not exist');

    const rejected = fakeTrackingSource({ reject: new Error("network unavailable") });
    await expect(loadProducerTrackingRows(rejected.client as never, "producer-1", {
      start: "2026-08-01",
      end: "2026-08-31",
    })).rejects.toThrow("Unable to load Scorecard Tracking: network unavailable");
  });

  it("loads Lead Spend through producer_analytics_bundle with the exact person and period", async () => {
    const fake = fakeAnalyticsSource({
      data: {
        totals: { leadSpend_cents: 350_000 },
      },
    });

    await expect(loadProducerLeadSpendCents(fake.client as never, "producer-1", {
      start: "2026-08-01",
      end: "2026-08-31",
    })).resolves.toBe(350_000);
    expect(fake.calls).toEqual([{
      name: "producer_analytics_bundle",
      args: {
        p_person_id: "producer-1",
        p_from: "2026-08-01",
        p_to: "2026-08-31",
        p_tz: "America/Chicago",
      },
    }]);
  });

  it("treats zero, missing, and malformed Lead Spend aggregates safely", async () => {
    for (const data of [null, {}, { totals: { leadSpend_cents: null } }, { totals: { leadSpend_cents: Number.NaN } }, { totals: { leadSpend_cents: -1 } }]) {
      const fake = fakeAnalyticsSource({ data });
      await expect(loadProducerLeadSpendCents(fake.client as never, "producer-1", {
        start: "2026-08-01",
        end: "2026-08-31",
      })).resolves.toBe(0);
    }
  });

  it("turns Lead Spend RPC errors and rejected requests into controlled source errors", async () => {
    const rpcError = fakeAnalyticsSource({ error: { message: "function producer_analytics_bundle does not exist" } });
    await expect(loadProducerLeadSpendCents(rpcError.client as never, "producer-1", {
      start: "2026-08-01",
      end: "2026-08-31",
    })).rejects.toThrow("Unable to load Scorecard Lead Spend: function producer_analytics_bundle does not exist");

    const rejected = fakeAnalyticsSource({ reject: new Error("connection reset") });
    await expect(loadProducerLeadSpendCents(rejected.client as never, "producer-1", {
      start: "2026-08-01",
      end: "2026-08-31",
    })).rejects.toThrow("Unable to load Scorecard Lead Spend: connection reset");
  });
});
