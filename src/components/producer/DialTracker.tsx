"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { localIsoDate } from "@/lib/producer/time";

type Counts = {
  dials: number;
  leads: number;
  contacts: number;
  appointments: number;
  presentations: number;
  sales: number;
};

type Projection = Counts & { ap_cents: number };

const EMPTY: Counts = { dials: 0, leads: 0, contacts: 0, appointments: 0, presentations: 0, sales: 0 };

const METRICS: Array<{ key: keyof Counts; label: string; steps: number[] }> = [
  { key: "dials", label: "Dials", steps: [1, 5, 10] },
  { key: "leads", label: "Leads", steps: [1, 5] },
  { key: "contacts", label: "Contacts", steps: [1, 5] },
  { key: "appointments", label: "Appointments", steps: [1] },
  { key: "presentations", label: "Presentations", steps: [1] },
  { key: "sales", label: "Policies Sold", steps: [1] },
];

type SaveState = "idle" | "saving" | "saved" | "error";

export function DialTracker() {
  const today = localIsoDate();
  const [date, setDate] = useState(today);
  const [counts, setCounts] = useState<Counts>(EMPTY);
  const [target, setTarget] = useState<Projection | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectionLoading, setProjectionLoading] = useState(true);
  const [save, setSave] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setProjectionLoading(true);
    setError(null);
    try {
      const trackRes = await fetch(`/api/producer/tracker?date=${d}`, { cache: "no-store" });
      const trackJson = await trackRes.json();
      if (!trackJson.ok) throw new Error(trackJson.error ?? "Failed to load activity");
      const e = trackJson.entry;
      setCounts(
        e
          ? {
              dials: e.dials ?? 0,
              leads: e.leads ?? 0,
              contacts: e.contacts ?? 0,
              appointments: e.appointments ?? 0,
              presentations: e.presentations ?? 0,
              sales: e.sales ?? 0,
            }
          : EMPTY,
      );
      setSave("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }

    try {
      const projRes = await fetch(`/api/producer/projection?date=${d}`, { cache: "no-store" });
      const projJson = await projRes.json();
      setTarget(projJson.ok ? (projJson.projection ?? null) : null);
    } catch {
      setTarget(null);
    } finally {
      setProjectionLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(date);
  }, [date, load]);

  const persist = useCallback(
    async (next: Counts, d: string) => {
      setSave("saving");
      try {
        const res = await fetch("/api/producer/tracker", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ date: d, ...next }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? "Save failed");
        setSave("saved");
        dirty.current = false;
      } catch (err) {
        setSave("error");
        setError(err instanceof Error ? err.message : "Save failed");
      }
    },
    [],
  );

  const bump = (key: keyof Counts, delta: number) => {
    setError(null);
    setCounts((prev) => {
      const next = { ...prev, [key]: Math.max(0, prev[key] + delta) };
      dirty.current = true;
      setSave("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void persist(next, date), 600);
      return next;
    });
  };

  // Flush a pending save when leaving the page so nothing is lost.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const totalDials = counts.dials;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
            Daily Tracker
          </h1>
          <p className="mt-2 max-w-xl text-sm text-subtle">
            Tap as you go. Everything you log here updates your dashboard, projections, and analytics
            in real time.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SaveBadge state={save} loading={loading} projectionLoading={projectionLoading} />
          <label className="flex flex-col text-right">
            <span className="text-[10px] uppercase tracking-[0.12em] text-mute">Day</span>
            <input
              type="date"
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 rounded-lg border border-hairline bg-card px-2.5 py-1.5 text-sm text-ink outline-none [color-scheme:dark] focus:border-accent"
            />
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-neg/40 bg-neg/[0.06] px-4 py-3 text-sm text-neg">
          {error}
        </div>
      )}

      {/* Hero dial counter */}
      <HeroDial
        value={totalDials}
        target={target?.dials ?? 0}
        onBump={(d) => bump("dials", d)}
        disabled={loading}
      />

      {/* Remaining metrics — sales is excluded here; it's driven by Clients. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {METRICS.filter((m) => m.key !== "dials" && m.key !== "sales").map((m) => (
          <CounterCard
            key={m.key}
            label={m.label}
            value={counts[m.key]}
            target={target?.[m.key] ?? 0}
            onBump={(d) => bump(m.key, d)}
            disabled={loading}
          />
        ))}
        <PoliciesSoldCard value={counts.sales} target={target?.sales ?? 0} />
      </div>
    </div>
  );
}

// Policies sold is read-only on the tracker: the only way to log one is to add a
// client. The count is kept in sync server-side from the Clients book.
function PoliciesSoldCard({ value, target }: { value: number; target: number }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const hit = target > 0 && value >= target;
  return (
    <div className="rounded-2xl border border-hairline bg-card p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-[0.12em] text-mute">Policies Sold</p>
        {target > 0 && (
          <p className={`text-xs font-medium tabular-nums ${hit ? "text-pos" : "text-accent"}`}>
            {value} / {target}
          </p>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-4">
        <p className="min-w-[2ch] text-4xl font-semibold tabular-nums text-ink">{value}</p>
        <Link
          href="/producer/clients/new"
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-background transition hover:bg-accent-soft"
        >
          + Add New Client
        </Link>
      </div>
      <p className="mt-3 text-xs text-mute">Logged automatically when you add a client.</p>
      {target > 0 && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-card-hi">
          <div
            className={`h-full rounded-full ${hit ? "bg-pos" : "bg-accent"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function HeroDial({
  value,
  target,
  onBump,
  disabled,
}: {
  value: number;
  target: number;
  onBump: (delta: number) => void;
  disabled: boolean;
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const hit = target > 0 && value >= target;
  return (
    <div className="overflow-hidden rounded-3xl bg-accent text-[#050505]">
      <div className="flex flex-col items-center gap-6 px-6 py-10 sm:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#050505]/70">
          Dials today
        </p>
        <div className="flex items-center gap-6 sm:gap-10">
          <TapButton onClick={() => onBump(-1)} disabled={disabled || value <= 0} label="Remove a dial">
            −
          </TapButton>
          <p className="min-w-[3ch] text-center text-7xl font-semibold tabular-nums leading-none sm:text-8xl">
            {value}
          </p>
          <TapButton onClick={() => onBump(1)} disabled={disabled} label="Add a dial" primary>
            +
          </TapButton>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {[3, 5, 10, 25].map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => onBump(s)}
              className="rounded-full bg-[#050505]/15 px-4 py-1.5 text-sm font-semibold text-[#050505] transition hover:bg-[#050505]/25 disabled:opacity-50"
            >
              +{s}
            </button>
          ))}
        </div>

        {target > 0 && (
          <div className="w-full max-w-md">
            <div className="flex items-baseline justify-between text-xs font-medium text-[#050505]/80">
              <span>{hit ? "Target hit" : `Goal ${target}`}</span>
              <span className="tabular-nums">{Math.round(pct)}%</span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#050505]/20">
              <div className="h-full rounded-full bg-[#050505]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CounterCard({
  label,
  value,
  target,
  onBump,
  disabled,
}: {
  label: string;
  value: number;
  target: number;
  onBump: (delta: number) => void;
  disabled: boolean;
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const hit = target > 0 && value >= target;
  return (
    <div className="rounded-2xl border border-hairline bg-card p-6">
      <p className="text-center text-xs uppercase tracking-[0.12em] text-mute">{label}</p>
      {/* Centered −/value/+ controls — bigger tap targets, value front-and-center. */}
      <div className="mt-4 flex items-center justify-center gap-6">
        <SmallTap onClick={() => onBump(-1)} disabled={disabled || value <= 0} label={`Remove ${label}`}>
          −
        </SmallTap>
        <p className="min-w-[2.5ch] text-center text-5xl font-semibold tabular-nums text-ink">
          {value}
        </p>
        <SmallTap onClick={() => onBump(1)} disabled={disabled} label={`Add ${label}`} primary>
          +
        </SmallTap>
      </div>
      {target > 0 && (
        <div className="mt-5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-card-hi">
            <div
              className={`h-full rounded-full ${hit ? "bg-pos" : "bg-accent"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {/* Progress count sits under the bar so it reads as the bar's label. */}
          <p className={`mt-2 text-center text-sm font-medium tabular-nums ${hit ? "text-pos" : "text-accent"}`}>
            {value} / {target}
          </p>
        </div>
      )}
    </div>
  );
}

function TapButton({
  onClick,
  disabled,
  label,
  primary,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex h-16 w-16 items-center justify-center rounded-full text-3xl font-semibold leading-none transition active:scale-95 disabled:opacity-40 sm:h-20 sm:w-20 ${
        primary
          ? "bg-[#050505]/20 text-[#050505] hover:bg-[#050505]/30"
          : "bg-[#050505]/10 text-[#050505] hover:bg-[#050505]/20"
      }`}
    >
      {children}
    </button>
  );
}

function SmallTap({
  onClick,
  disabled,
  label,
  primary,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex h-12 w-12 items-center justify-center rounded-full text-2xl font-semibold leading-none transition active:scale-95 disabled:opacity-40 ${
        primary
          ? "bg-accent text-background hover:bg-accent-soft"
          : "border border-hairline text-subtle hover:border-mute hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function SaveBadge({
  state,
  loading,
  projectionLoading,
}: {
  state: SaveState;
  loading: boolean;
  projectionLoading: boolean;
}) {
  if (loading) return <span className="text-xs text-mute">Loading…</span>;
  if (projectionLoading && state === "idle") return <span className="text-xs text-mute">Synced</span>;
  const map: Record<SaveState, { text: string; cls: string }> = {
    idle: { text: "Synced", cls: "text-mute" },
    saving: { text: "Saving…", cls: "text-accent" },
    saved: { text: "Saved", cls: "text-pos" },
    error: { text: "Save failed", cls: "text-neg" },
  };
  const { text, cls } = map[state];
  return <span className={`text-xs font-medium ${cls}`}>{text}</span>;
}
