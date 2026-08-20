"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PRODUCER_LOAD_ERROR_COPY } from "@/lib/producer/error-copy";
import { money, num } from "@/lib/producer/format";
import { localIsoDate } from "@/lib/producer/time";

type Projection = {
  dials: number;
  leads: number;
  contacts: number;
  appointments: number;
  presentations: number;
  sales: number;
  ap_cents: number;
};

type Row = { dials: number; leads: number; contacts: number; presentations: number; sales: number; ap_cents: number };

const EMPTY_PROJ: Projection = {
  dials: 0,
  leads: 0,
  contacts: 0,
  appointments: 0,
  presentations: 0,
  sales: 0,
  ap_cents: 0,
};
const EMPTY_ROW: Row = { dials: 0, leads: 0, contacts: 0, presentations: 0, sales: 0, ap_cents: 0 };

const FIELDS: Array<{ key: keyof Row; label: string; money?: boolean }> = [
  { key: "leads", label: "Leads" },
  { key: "dials", label: "Dials" },
  { key: "contacts", label: "Contacts" },
  { key: "presentations", label: "Presentations" },
  { key: "sales", label: "Policies Sold" },
  { key: "ap_cents", label: "AP", money: true },
];

export function TodaySnapshot() {
  const today = useMemo(() => localIsoDate(), []);
  const [target, setTarget] = useState<Projection | null>(null);
  const [actual, setActual] = useState<Row>(EMPTY_ROW);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

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
      if (!projRes.ok || !actRes.ok) throw new Error("load failed");
      const projJson = await projRes.json();
      const actJson = await actRes.json();
      if (!actJson.ok) throw new Error("load failed");
      setTarget(projJson.ok ? (projJson.projection ?? null) : null);
      setActual({
        dials: actJson.totals.dials,
        leads: actJson.totals.leads,
        contacts: actJson.totals.contacts,
        presentations: actJson.totals.presentations,
        sales: actJson.totals.sales,
        ap_cents: actJson.totals.ap_cents,
      });
    } catch {
      setError(PRODUCER_LOAD_ERROR_COPY);
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

  const saveProjection = async (next: Projection) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/producer/projection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: today, ...next }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to save");
      setEditing(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-10">
      <div className="grid items-start gap-4 md:grid-cols-2">
        {/* Left — Daily projections (targets) */}
        <Card
          title="Daily projections"
          subtitle="The numbers you're aiming for"
          action={
            target && !editing ? (
              <YellowButton small onClick={() => setEditing(true)}>
                Edit
              </YellowButton>
            ) : null
          }
        >
          {editing || !target ? (
            <ProjectionForm
              initial={target ?? EMPTY_PROJ}
              saving={saving}
              onCancel={target ? () => setEditing(false) : undefined}
              onSubmit={saveProjection}
            />
          ) : (
            <MetricGrid render={(f) => fmt(f.key, target[f.key])} />
          )}
        </Card>

        {/* Right — Today's actuals + submit */}
        <Card title="Today's numbers" subtitle="What you've logged so far">
          <MetricGrid
            render={(f) => fmt(f.key, actual[f.key])}
            sub={(f) => (target ? `of ${fmt(f.key, target[f.key])}` : undefined)}
          />
          <div className="mt-5">
            <Link
              href="/producer/tracker"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-background transition hover:bg-accent-soft"
            >
              Open Tracker
              <NewTabIcon />
            </Link>
          </div>
        </Card>
      </div>
      {error && <p className="mt-3 text-sm text-neg">{error}</p>}
      {loading && !error && <p className="mt-3 text-xs text-mute">Refreshing…</p>}
    </section>
  );
}

function Card({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-3xl bg-white p-6 text-black md:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/55">
            {subtitle}
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em]">{title}</h2>
        </div>
        {action}
      </div>
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
    <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:gap-x-6 lg:grid-cols-3">
      {FIELDS.map((f) => (
        <div key={f.key} className="min-w-0">
          <p className="truncate text-[11px] font-medium uppercase tracking-[0.1em] text-black/55">
            {f.label}
          </p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums leading-tight sm:text-2xl">{render(f)}</p>
          {sub && sub(f) && <p className="text-[11px] tabular-nums text-black/45">{sub(f)}</p>}
        </div>
      ))}
    </div>
  );
}

function ProjectionForm({
  initial,
  saving,
  onSubmit,
  onCancel,
}: {
  initial: Projection;
  saving: boolean;
  onSubmit: (next: Projection) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<Record<keyof Row, string>>({
    dials: initial.dials ? String(initial.dials) : "",
    leads: initial.leads ? String(initial.leads) : "",
    contacts: initial.contacts ? String(initial.contacts) : "",
    presentations: initial.presentations ? String(initial.presentations) : "",
    sales: initial.sales ? String(initial.sales) : "",
    ap_cents: initial.ap_cents ? String(initial.ap_cents / 100) : "",
  });

  const set = (key: keyof Row, v: string) => setForm((p) => ({ ...p, [key]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      // Preserve appointments — it isn't edited here but lives on the projection.
      appointments: initial.appointments,
      dials: Math.max(0, Math.floor(Number(form.dials) || 0)),
      leads: Math.max(0, Math.floor(Number(form.leads) || 0)),
      contacts: Math.max(0, Math.floor(Number(form.contacts) || 0)),
      presentations: Math.max(0, Math.floor(Number(form.presentations) || 0)),
      sales: Math.max(0, Math.floor(Number(form.sales) || 0)),
      ap_cents: Math.max(0, Math.round((Number(form.ap_cents) || 0) * 100)),
    });
  };

  return (
    <form onSubmit={submit}>
      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:gap-x-5 lg:grid-cols-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="min-w-0">
            <span className="block truncate text-[11px] font-medium uppercase tracking-[0.1em] text-black/55">
              {f.label}
            </span>
            <div className="mt-1 flex items-baseline rounded-lg border border-black/10 bg-black/5 px-2.5 py-1.5">
              {f.money && <span className="mr-0.5 text-lg text-black/40">$</span>}
              <input
                type="number"
                min={0}
                step={f.money ? "0.01" : "1"}
                inputMode={f.money ? "decimal" : "numeric"}
                value={form[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder="0"
                className="w-full bg-transparent text-xl font-semibold tabular-nums text-black outline-none placeholder:text-black/35"
              />
            </div>
          </label>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-2">
        <YellowButton type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save projections"}
        </YellowButton>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-full border border-black/20 px-5 py-2.5 text-sm font-medium text-black transition hover:border-black/40 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function YellowButton({
  onClick,
  type = "button",
  disabled,
  small,
  children,
}: {
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full bg-accent font-semibold text-background transition hover:bg-accent-soft disabled:opacity-50 ${
        small ? "px-4 py-1.5 text-sm" : "px-5 py-2.5 text-sm"
      }`}
    >
      {children}
    </button>
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
