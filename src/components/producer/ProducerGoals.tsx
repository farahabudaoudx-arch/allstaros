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

// Final-expense telesales fallbacks, used when a producer has no history yet to
// derive their own ratios from.
const FALLBACK = {
  apPerSaleCents: 100_000, // avg AP per client
  presPerSale: 4, // 1 sale per 4 presentations
  contactsPerSale: 19, // contacts worked per sale
  dialsPerSale: 76, // dials made per sale
};

function ratio(numr: number, denr: number, fallback: number): number {
  return denr > 0 && numr > 0 ? numr / denr : fallback;
}

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
    const daysLeft = remainingBusinessDays(new Date());
    const remainingAp = Math.max(0, goalAp - mtdAp);
    const apPerDay = remainingAp / daysLeft;

    const apPerSale = ratio(hist.ap_cents, hist.sales, FALLBACK.apPerSaleCents);
    const presPerSale = ratio(hist.presentations, hist.sales, FALLBACK.presPerSale);
    const contactsPerSale = ratio(hist.contacts, hist.sales, FALLBACK.contactsPerSale);
    const dialsPerSale = ratio(hist.dials, hist.sales, FALLBACK.dialsPerSale);

    const salesPerDay = apPerSale > 0 ? apPerDay / apPerSale : 0;

    return {
      daysLeft,
      dials: Math.ceil(salesPerDay * dialsPerSale),
      contacts: Math.ceil(salesPerDay * contactsPerSale),
      presentations: Math.ceil(salesPerDay * presPerSale),
      sales: Math.ceil(salesPerDay),
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

          {needs && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold tracking-[-0.01em] text-ink">
                Based on your current data, to hit your goal you need to:
              </h3>
              <p className="mt-1 text-sm text-mute">
                {needs.daysLeft} working {needs.daysLeft === 1 ? "day" : "days"} left this month.
              </p>
              <div className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-4">
                <NeedCard value={num(needs.dials)} label="Dials per day" sub="Based on avg performance" />
                <NeedCard
                  value={num(needs.contacts)}
                  label="People talked to per day"
                  sub="Based on avg contact:sale ratio"
                />
                <NeedCard
                  value={num(needs.presentations)}
                  label="Presentations per day"
                  sub="Based on avg conversion rate"
                />
                <NeedCard
                  value={num(needs.sales)}
                  label="Policies sold per day"
                  sub="Based on avg AP per client"
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
