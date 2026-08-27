import { describe, expect, it } from "vitest";
import { computeAnalytics, computeCalendar, computeDashboard, saleDay } from "./metrics";

function fakeRpc(handlers: Record<string, unknown>) {
  return {
    from() {
      throw new Error("metrics should use aggregate RPCs, not table scans");
    },
    rpc(name: string, args: Record<string, unknown>) {
      if (!(name in handlers)) {
        return Promise.resolve({ data: null, error: { message: `unexpected rpc ${name}` } });
      }
      const h = handlers[name];
      if (typeof h === "function") {
        return Promise.resolve({ data: (h as (a: Record<string, unknown>) => unknown)(args), error: null });
      }
      return Promise.resolve({ data: h, error: null });
    },
  };
}

describe("computeDashboard (SQL buckets)", () => {
  it("expands day buckets and takes max(tracker, sale_count) for sales", async () => {
    const board = await computeDashboard(
      fakeRpc({
        producer_dashboard_day_buckets: [
          {
            bucket_date: "2026-08-10",
            leads: 1,
            dials: 2,
            contacts: 3,
            appointments: 4,
            presentations: 5,
            tracker_sales: 1,
            sale_count: 3,
            ap_cents: 10000,
            ip_cents: 2000,
          },
        ],
      }) as never,
      "person-1",
      { rangeKey: "custom", tz: "UTC", from: "2026-08-10", to: "2026-08-10" },
    );

    expect(board.series).toHaveLength(1);
    expect(board.series[0].sales).toBe(3);
    expect(board.totals.ap_cents).toBe(10000);
    expect(board.granularity).toBe("day");
  });
});

describe("computeAnalytics (SQL bundle)", () => {
  it("maps the analytics jsonb bundle into the UI shape", async () => {
    const result = await computeAnalytics(
      fakeRpc({
        producer_analytics_bundle: {
          totals: {
            leads: 1,
            dials: 2,
            contacts: 3,
            appointments: 4,
            presentations: 5,
            sales: 6,
            ap_cents: 700,
            ip_cents: 800,
            issuedCount: 9,
            deposits_cents: 1000,
            leadSpend_cents: 1100,
          },
          state_perf: [{ state: "TX", leads: 0, sales: 2, ap_cents: 500 }],
          age_bands: [{ band: "50–59", leads: 0, sales: 1, ap_cents: 100 }],
          carrier_perf: [
            {
              name: "Acme",
              sales: 2,
              ap_cents: 500,
              avg_monthly_premium_cents: 50,
              avg_face_amount_cents: 10000,
            },
          ],
        },
      }) as never,
      "person-1",
      { rangeKey: "mtd", tz: "UTC" },
    );

    expect(result.totals.sales).toBe(6);
    expect(result.state_perf[0].state).toBe("TX");
    expect(result.carrier_perf[0].name).toBe("Acme");
  });

  it("surfaces RPC failures with analytics_bundle phase", async () => {
    await expect(
      computeAnalytics(
        {
          from: () => {
            throw new Error("unused");
          },
          rpc: () =>
            Promise.resolve({
              data: null,
              error: { message: "canceling statement due to statement timeout" },
            }),
        } as never,
        "person-1",
        { rangeKey: "mtd", tz: "UTC" },
      ),
    ).rejects.toMatchObject({ queryPhase: "analytics_bundle" });
  });
});

describe("computeCalendar (SQL days)", () => {
  it("maps sparse calendar days", async () => {
    const cal = await computeCalendar(
      fakeRpc({
        producer_calendar_days: [
          { day: "2026-08-05", ap_cents: 100, ip_cents: 50, sales: 1, submitted: true },
        ],
      }) as never,
      "person-1",
      "2026-08",
      "UTC",
    );

    expect(cal.days["2026-08-05"]).toEqual({
      ap_cents: 100,
      ip_cents: 50,
      sales: 1,
      submitted: true,
    });
  });
});

// Keep leaderboard tests in metrics.test.ts — this file focuses on #004 surfaces.
describe("saleDay timezone fallback (JS helper parity)", () => {
  it("uses created_at in viewer tz when submit_date and date are missing", () => {
    // 2026-08-21 22:00 UTC → still 2026-08-21 in Chicago (UTC-5/-6)
    expect(
      saleDay(
        {
          annual_premium: 1,
          sale_status: "sale",
          submit_date: null,
          date: null,
          created_at: "2026-08-21T22:00:00.000Z",
        },
        "America/Chicago",
      ),
    ).toBe("2026-08-21");
    // Same instant is already next calendar day in Amman (UTC+3)
    expect(
      saleDay(
        {
          annual_premium: 1,
          sale_status: "sale",
          submit_date: null,
          date: null,
          created_at: "2026-08-21T22:00:00.000Z",
        },
        "Asia/Amman",
      ),
    ).toBe("2026-08-22");
  });
});
