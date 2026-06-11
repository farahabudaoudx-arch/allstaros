"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { money, num, pctValue } from "@/lib/producer/format";

type Totals = {
  dials: number;
  contacts: number;
  presentations: number;
  sales: number;
  ap_cents: number;
};

function remainingBusinessDays(now: Date): number {
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let day = now.getDate(); day <= lastDay; day++) {
    const dow = new Date(year, month, day).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return Math.max(1, count);
}

export function ProducerGoals() {
  const [goalAp, setGoalAp] = useState<number | null>(null);
  const [mtdAp, setMtdAp] = useState(0);
  const [hist, setHist] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const q = (range: string) =>
      fetch(`/api/producer/dashboard/metrics?range=${range}&tz=${encodeURIComponent(tz)}`, {
        cache: "no-store",
      });
    try {
      const [goalRes, mtdRes, allRes] = await Promise.all([
        fetch("/api/producer/goal", { cache: "no-store" }),
        q("mtd"),
        q("all"),
      ]);
      const goalJson = await goalRes.json();
      const mtdJson = await mtdRes.json();
      const allJson = await allRes.json();
      if (!goalJson.ok) throw new Error(goalJson.error ?? "Failed to load goal");
      if (!mtdJson.ok) throw new Error(mtdJson.error ?? "Failed to load activity");
      if (!allJson.ok) throw new Error(allJson.error ?? "Failed to load history");
      setGoalAp(goalJson.goal?.ap_cents ?? null);
      setMtdAp(mtdJson.totals.ap_cents);
      setHist({
        dials: allJson.totals.dials,
        contacts: allJson.totals.contacts,
        presentations: allJson.totals.presentations,
        sales: allJson.totals.sales,
        ap_cents: allJson.totals.ap_cents,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

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

  const needs = useMemo(() => {
    if (!goalAp || goalAp <= 0 || !hist) return null;

    // We can only reverse-engineer the daily numbers from the producer's OWN
    // history. Without at least one closed sale (and the AP it produced) there's
    // no AP-per-sale ratio to work backwards from — so we say "not enough data"
    // rather than inventing numbers from generic industry averages.
    if (hist.sales <= 0 || hist.ap_cents <= 0) {
      return { insufficient: true as const };
    }

    const daysLeft = remainingBusinessDays(new Date());
    const remainingAp = Math.max(0, goalAp - mtdAp);
    const apPerDay = remainingAp / daysLeft;

    const apPerSale = hist.ap_cents / hist.sales;
    const salesPerDay = apPerDay / apPerSale;

    // Each activity line needs that activity's own history to derive a ratio.
    // If a producer has logged sales but never logged, say, presentations, that
    // one card reads N/A instead of guessing.
    const perSale = (activity: number) => (activity > 0 ? activity / hist.sales : null);
    const dialsPerSale = perSale(hist.dials);
    const contactsPerSale = perSale(hist.contacts);
    const presPerSale = perSale(hist.presentations);

    return {
      insufficient: false as const,
      daysLeft,
      sales: Math.ceil(salesPerDay),
      dials: dialsPerSale != null ? Math.ceil(salesPerDay * dialsPerSale) : null,
      contacts: contactsPerSale != null ? Math.ceil(salesPerDay * contactsPerSale) : null,
      presentations: presPerSale != null ? Math.ceil(salesPerDay * presPerSale) : null,
    };
  }, [goalAp, mtdAp, hist]);

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
          </Link>{" "}
          and we&apos;ll reverse-engineer your daily numbers.
        </p>
      ) : (
        <>
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

          {needs?.insufficient && (
            <div className="mt-8 rounded-2xl border border-hairline bg-card p-6">
              <h3 className="text-lg font-semibold tracking-[-0.01em] text-ink">
                Not enough data yet
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-subtle">
                We work backwards from your own numbers — once you&apos;ve logged some activity and
                closed at least one sale, we&apos;ll know your dials, contacts, and presentations per
                sale and show exactly what you need each day to hit this goal.
              </p>
            </div>
          )}

          {needs && !needs.insufficient && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold tracking-[-0.01em] text-ink">
                Based on your current data, to hit your goal you need to:
              </h3>
              <p className="mt-1 text-sm text-mute">
                {needs.daysLeft} working {needs.daysLeft === 1 ? "day" : "days"} left this month.
              </p>
              <div className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-4">
                <NeedCard
                  value={needs.dials != null ? num(needs.dials) : "N/A"}
                  label="Dials per day"
                  sub={needs.dials != null ? "Based on your dials:sale ratio" : "Not enough data"}
                />
                <NeedCard
                  value={needs.contacts != null ? num(needs.contacts) : "N/A"}
                  label="People talked to per day"
                  sub={needs.contacts != null ? "Based on your contact:sale ratio" : "Not enough data"}
                />
                <NeedCard
                  value={needs.presentations != null ? num(needs.presentations) : "N/A"}
                  label="Presentations per day"
                  sub={needs.presentations != null ? "Based on your presentation:sale ratio" : "Not enough data"}
                />
                <NeedCard
                  value={num(needs.sales)}
                  label="Policies sold per day"
                  sub="Based on your avg AP per sale"
                />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function NeedCard({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-card p-5">
      <p className="text-3xl font-semibold tabular-nums text-accent">{value}</p>
      <p className="mt-2 text-sm font-medium text-ink">{label}</p>
      <p className="mt-0.5 text-xs text-mute">{sub}</p>
    </div>
  );
}
