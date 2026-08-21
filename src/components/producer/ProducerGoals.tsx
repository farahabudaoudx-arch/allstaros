"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchDashboardMetrics } from "@/lib/producer/dashboard-metrics-client";
import { PRODUCER_LOAD_ERROR_COPY } from "@/lib/producer/error-copy";
import { money, pctValue } from "@/lib/producer/format";

export function ProducerGoals() {
  const [goalAp, setGoalAp] = useState<number | null>(null);
  const [mtdAp, setMtdAp] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { bypassCache?: boolean }) => {
    setLoading(true);
    setError(null);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const [goalRes, mtdJson] = await Promise.all([
        fetch("/api/producer/goal", { cache: "no-store" }),
        fetchDashboardMetrics({ range: "mtd", tz, bypassCache: opts?.bypassCache }),
      ]);
      if (!goalRes.ok) throw new Error("load failed");
      const goalJson = await goalRes.json();
      if (!goalJson.ok) throw new Error("load failed");
      setGoalAp(goalJson.goal?.ap_cents ?? null);
      setMtdAp(mtdJson.totals.ap_cents);
    } catch {
      setError(PRODUCER_LOAD_ERROR_COPY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void load({ bypassCache: true });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  const hasGoal = goalAp != null && goalAp > 0;
  const pct = hasGoal ? pctValue(mtdAp, goalAp) : 0;
  const hit = hasGoal && mtdAp >= goalAp;

  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">Your monthly AP goal</h2>
        <Link
          href="/producer/settings"
          className="text-sm font-medium text-accent hover:text-accent-soft"
        >
          {hasGoal ? "Edit" : "Set goal"}
        </Link>
      </div>

      {error ? (
        <p className="mt-6 text-sm text-neg">{error}</p>
      ) : loading ? (
        <p className="mt-6 text-sm text-mute">Loading…</p>
      ) : !hasGoal ? (
        <p className="mt-4 max-w-2xl text-sm text-subtle">
          You haven&apos;t set your AP goal yet.{" "}
          <Link href="/producer/settings" className="text-accent hover:text-accent-soft">
            Set it in Settings
          </Link>
          .
        </p>
      ) : (
        <div className="mt-6 rounded-2xl border border-hairline bg-card p-6">
          <div className="flex items-baseline justify-between">
            <p className="text-3xl font-semibold tabular-nums text-ink md:text-4xl">
              {money(mtdAp)}
              <span className="text-lg font-normal text-mute"> / {money(goalAp!)}</span>
            </p>
            <p className={`text-sm font-medium tabular-nums ${hit ? "text-pos" : "text-accent"}`}>
              {Math.round(pct)}%
            </p>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-card-hi">
            <div
              className={`h-full rounded-full ${hit ? "bg-pos" : "bg-accent"}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-mute">Annual premium, month to date.</p>
        </div>
      )}
    </section>
  );
}
