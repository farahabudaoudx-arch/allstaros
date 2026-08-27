import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearDashboardMetricsClientCache,
  fetchDashboardMetrics,
} from "./dashboard-metrics-client";

const sample = {
  ok: true as const,
  range: { key: "mtd" as const, from: "2026-08-01", to: "2026-08-21" },
  granularity: "day" as const,
  totals: {
    dials: 1,
    leads: 2,
    contacts: 3,
    appointments: 4,
    presentations: 5,
    sales: 6,
    ap_cents: 700,
    ip_cents: 0,
  },
  series: [],
};

afterEach(() => {
  clearDashboardMetricsClientCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchDashboardMetrics", () => {
  it("dedupes parallel identical MTD requests into one network call", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sample,
    });
    vi.stubGlobal("fetch", fetchMock);

    const [a, b] = await Promise.all([
      fetchDashboardMetrics({ range: "mtd", tz: "Asia/Amman" }),
      fetchDashboardMetrics({ range: "mtd", tz: "Asia/Amman" }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a.totals.ap_cents).toBe(700);
    expect(b.totals.ap_cents).toBe(700);
    expect(fetchMock.mock.calls[0][0]).toContain("range=mtd");
    expect(fetchMock.mock.calls[0][0]).toContain("tz=Asia%2FAmman");
  });

  it("does not reuse a today response for an MTD request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...sample,
          range: { key: "today", from: "2026-08-21", to: "2026-08-21" },
          totals: { ...sample.totals, ap_cents: 11 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...sample,
          totals: { ...sample.totals, ap_cents: 22 },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const today = await fetchDashboardMetrics({ range: "today", tz: "UTC" });
    const mtd = await fetchDashboardMetrics({ range: "mtd", tz: "UTC" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(today.totals.ap_cents).toBe(11);
    expect(mtd.totals.ap_cents).toBe(22);
  });

  it("does not cache failures across retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ ok: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => sample,
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchDashboardMetrics({ range: "mtd", tz: "UTC" }),
    ).rejects.toThrow("load failed");

    const ok = await fetchDashboardMetrics({ range: "mtd", tz: "UTC" });
    expect(ok.totals.ap_cents).toBe(700);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("serves a second call from the short success cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sample,
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchDashboardMetrics({ range: "mtd", tz: "UTC" });
    await fetchDashboardMetrics({ range: "mtd", tz: "UTC" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bypassCache skips the success cache but still dedupes in-flight", async () => {
    let resolveFirst!: (v: unknown) => void;
    const firstJson = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          Promise.resolve({
            ok: true,
            json: () => firstJson.then((v) => v),
          }),
      )
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...sample,
          totals: { ...sample.totals, ap_cents: 999 },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const p1 = fetchDashboardMetrics({ range: "mtd", tz: "UTC", bypassCache: true });
    const p2 = fetchDashboardMetrics({ range: "mtd", tz: "UTC", bypassCache: true });
    resolveFirst(sample);
    await Promise.all([p1, p2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const refreshed = await fetchDashboardMetrics({
      range: "mtd",
      tz: "UTC",
      bypassCache: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshed.totals.ap_cents).toBe(999);
  });
});
