"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { money, num } from "@/lib/producer/format";
import { localIsoDate } from "@/lib/producer/time";

type Row = { dials: number; contacts: number; presentations: number; sales: number; ap_cents: number };

const EMPTY: Row = { dials: 0, contacts: 0, presentations: 0, sales: 0, ap_cents: 0 };

const FIELDS: Array<{ key: keyof Row; label: string; money?: boolean }> = [
  { key: "dials", label: "Dials" },
  { key: "contacts", label: "Contacts" },
  { key: "presentations", label: "Presentations" },
  { key: "sales", label: "Policies" },
  { key: "ap_cents", label: "AP", money: true },
];

export function TodaySnapshot() {
  const today = useMemo(() => localIsoDate(), []);
  const [target, setTarget] = useState<Row | null>(null);
  const [actual, setActual] = useState<Row>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const [projRes, actRes] = await Promise.all([
        fetch(`/api/producer/projection?date=${today}`, { cache: "no-store" }),
        fetch(`/api/producer/dashboard/metrics?range=today&tz=${encodeURIComponent(tz)}`, {
          cache: "no-store",
        }),
      ]);
      const projJson = await projRes.json();
      const actJson = await actRes.json();
      if (!actJson.ok) throw new Error(actJson.error ?? "Failed to load activity");
      setTarget(projJson.ok ? (projJson.projection ?? null) : null);
      setActual({
        dials: actJson.totals.dials,
        contacts: actJson.totals.contacts,
        presentations: actJson.totals.presentations,
        sales: actJson.totals.sales,
        ap_cents: actJson.totals.ap_cents,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh when returning from the tracker (often opened in another tab).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  const fmt = (key: keyof Row, v: number) =>
    FIELDS.find((f) => f.key === key)?.money ? money(v) : num(v);

  return (
    <section className="mt-10">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Box 1 — Today's target */}
        <GoldBox title="Today's target" subtitle="The numbers you're aiming for">
          {target ? (
            <MetricGrid render={(f) => fmt(f.key, target[f.key])} />
          ) : (
            <p className="mt-4 text-sm text-background/75">
              No targets set for today. Set them in <span className="font-semibold">Daily projections</span> below
              and they&apos;ll show up here.
            </p>
          )}
        </GoldBox>

        {/* Box 2 — Today's actuals + submit */}
        <GoldBox title="Today's numbers" subtitle="What you've logged so far">
          <MetricGrid
            render={(f) => fmt(f.key, actual[f.key])}
            sub={(f) => (target ? `of ${fmt(f.key, target[f.key])}` : undefined)}
          />
          <div className="mt-5 flex items-center gap-2">
            <Link
              href="/producer/tracker"
              className="inline-flex items-center gap-2 rounded-full bg-background px-5 py-2.5 text-sm font-semibold text-accent transition hover:bg-background/90"
            >
              Submit today&apos;s numbers
            </Link>
            <a
              href="/producer/tracker"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open dial tracker in a new tab"
              title="Open in a new tab"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-background/15 text-background transition hover:bg-background/25"
            >
              <NewTabIcon />
            </a>
          </div>
        </GoldBox>
      </div>
      {error && <p className="mt-3 text-sm text-neg">{error}</p>}
      {loading && !error && <p className="mt-3 text-xs text-mute">Refreshing…</p>}
    </section>
  );
}

function GoldBox({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-3xl bg-accent p-6 text-background md:p-7">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-background/70">{subtitle}</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em]">{title}</h2>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function MetricGrid({
  render,
  sub,
}: {
  render: (f: (typeof FIELDS)[number]) => string;
  sub?: (f: (typeof FIELDS)[number]) => string | undefined;
}) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
      {FIELDS.map((f) => (
        <div key={f.key}>
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-background/65">
            {f.label}
          </p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums leading-tight">{render(f)}</p>
          {sub && sub(f) && (
            <p className="text-[11px] tabular-nums text-background/60">{sub(f)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function NewTabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
