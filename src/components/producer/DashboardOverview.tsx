"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AreaChart, type ChartPoint } from "@/components/producer/charts/AreaChart";
import { TimeframePills, type Timeframe } from "@/components/producer/charts/TimeframePills";
import type { DashboardResult, DashboardSeriesPoint } from "@/lib/producer/metrics";
import { money, num, pct } from "@/lib/producer/format";

type MetricKey = keyof Omit<DashboardSeriesPoint, "date">;

const METRICS: Array<{
  key: MetricKey;
  label: string;
  money?: boolean;
  // denominator stage for the conversion pill
  base?: MetricKey;
}> = [
  { key: "leads", label: "Leads" },
  { key: "dials", label: "Dials" },
  { key: "contacts", label: "Contacts", base: "dials" },
  { key: "appointments", label: "Appointments", base: "contacts" },
  { key: "presentations", label: "Presentations", base: "appointments" },
  { key: "sales", label: "Policies Sold", base: "presentations" },
  { key: "ap_cents", label: "AP", money: true },
];

function fmtBucketLabel(date: string, granularity: "day" | "hour"): string {
  if (granularity === "hour") {
    const h = Number(date.slice(11, 13));
    const am = h < 12;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}${am ? "am" : "pm"}`;
  }
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function DashboardOverview() {
  const [tf, setTf] = useState<Timeframe>({ key: "mtd" });
  const [data, setData] = useState<DashboardResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<MetricKey>("ap_cents");
  const [hover, setHover] = useState<{ index: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const params = new URLSearchParams({ range: tf.key, tz });
    if (tf.key === "custom" && tf.from && tf.to) {
      params.set("from", tf.from);
      params.set("to", tf.to);
    }
    try {
      const res = await fetch(`/api/producer/dashboard/metrics?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to load");
      setData(json as DashboardResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [tf]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  const activeMeta = METRICS.find((m) => m.key === active)!;

  const points: ChartPoint[] = useMemo(() => {
    if (!data) return [];
    return data.series.map((s) => ({
      value: activeMeta.money ? s[active] / 100 : s[active],
      date: s.date,
      label: fmtBucketLabel(s.date, data.granularity),
    }));
  }, [data, active, activeMeta]);

  const readout = useMemo(() => {
    if (!data) return { label: "", value: "" };
    if (hover && data.series[hover.index]) {
      const s = data.series[hover.index];
      return {
        label: fmtBucketLabel(s.date, data.granularity),
        value: activeMeta.money ? money(s[active]) : num(s[active]),
      };
    }
    const total = data.totals[active];
    return { label: activeMeta.label, value: activeMeta.money ? money(total) : num(total) };
  }, [data, hover, active, activeMeta]);

  return (
    <section className="mt-12">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
            Activity Dashboard
          </h2>
        </div>
        <TimeframePills value={tf} onChange={setTf} />
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_320px]">
        {/* Chart card */}
        <div className="flex flex-col rounded-2xl border border-hairline bg-card p-5">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-mute">
                {readout.label}
              </p>
              <p className="mt-1 text-4xl font-semibold tabular-nums text-accent">
                {error ? "—" : readout.value}
              </p>
            </div>
            {data && (
              <p className="text-xs text-mute">
                {data.range.from} → {data.range.to}
              </p>
            )}
          </div>
          <div className="mt-4 w-full flex-1 min-h-[14rem] md:min-h-[18rem]">
            {error ? (
              <div className="flex h-full items-center justify-center text-sm text-neg">{error}</div>
            ) : loading && !data ? (
              <div className="flex h-full items-center justify-center text-sm text-mute">Loading…</div>
            ) : points.length ? (
              <AreaChart
                points={points}
                onHighlightChange={(_p, i) => setHover(i != null ? { index: i } : null)}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-mute">
                No activity in this range.
              </div>
            )}
          </div>
        </div>

        {/* Metric rail */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          {METRICS.map((m) => {
            const total = data?.totals[m.key] ?? 0;
            const baseTotal = m.base ? data?.totals[m.base] ?? 0 : 0;
            const isActive = active === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setActive(m.key)}
                className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition ${
                  isActive
                    ? "border-accent/50 bg-accent/[0.06]"
                    : "border-hairline bg-card hover:border-mute"
                }`}
              >
                <div>
                  <p className="text-xs text-mute">{m.label}</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
                    {m.money ? money(total) : num(total)}
                  </p>
                </div>
                {m.base && (
                  <span className="rounded-full bg-card-hi px-2 py-0.5 text-[11px] font-medium text-accent ring-1 ring-hairline">
                    {pct(total, baseTotal)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
