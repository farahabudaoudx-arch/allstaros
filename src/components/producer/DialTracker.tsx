"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { localIsoDate } from "@/lib/producer/time";
import { parseJsonResponse } from "@/lib/producer/fetch-json";
import { PRODUCER_API_ERROR_COPY } from "@/lib/producer/error-copy";
import { PageHeader } from "@/components/producer/PageHeader";
import { DailyGoalModal, EMPTY_GOAL, type GoalValues } from "@/components/producer/DailyGoalModal";

type Counts = {
  dials: number;
  leads: number;
  contacts: number;
  appointments: number;
  presentations: number;
  sales: number;
};

type Projection = GoalValues;

/** Remembers a "Skip for today" so the goal popup doesn't reappear on every
 *  visit to the tracker that same day. Cleared naturally by the date changing. */
const skipKey = (date: string) => `asos:goal-skip:${date}`;

const EMPTY: Counts = { dials: 0, leads: 0, contacts: 0, appointments: 0, presentations: 0, sales: 0 };

const METRICS: Array<{ key: keyof Counts; label: string; hint: string; steps: number[] }> = [
  { key: "dials", label: "Dials", hint: "How many dials you've made", steps: [1, 5, 10] },
  { key: "leads", label: "Leads", hint: "How many leads you've received", steps: [1, 5] },
  { key: "contacts", label: "Contacts", hint: "How many people picked up the phone", steps: [1, 5] },
  { key: "appointments", label: "Appointments", hint: "How many appointments you've set", steps: [1] },
  { key: "presentations", label: "Presentations", hint: "How many people you presented numbers to", steps: [1] },
  { key: "sales", label: "Policies Sold", hint: "How many policies you've written", steps: [1] },
];

export function DialTracker({ backHref }: { backHref: string }) {
  const today = localIsoDate();
  const [date, setDate] = useState(today);
  const [counts, setCounts] = useState<Counts>(EMPTY);
  const [target, setTarget] = useState<Projection | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectionLoading, setProjectionLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const todayRef = useRef(today);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setProjectionLoading(true);
    setError(null);
    try {
      const trackRes = await fetch(`/api/producer/tracker?date=${d}`, { cache: "no-store" });
      const trackJson = await parseJsonResponse<{ ok: boolean; entry?: Partial<Counts> | null; error?: string }>(
        trackRes,
        PRODUCER_API_ERROR_COPY,
      );
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }

    try {
      const projRes = await fetch(`/api/producer/projection?date=${d}`, { cache: "no-store" });
      const projJson = await parseJsonResponse<{ ok: boolean; projection?: Projection | null }>(
        projRes,
        PRODUCER_API_ERROR_COPY,
      );
      const projection: Projection | null = projJson.ok ? (projJson.projection ?? null) : null;
      setTarget(projection);
      // First visit of the day with nothing to aim at: ask for goals up front.
      // Past days are never prompted, and a skip is remembered until tomorrow.
      const skipped = window.localStorage.getItem(skipKey(d)) === "1";
      if (!projection && d === todayRef.current && !skipped) setGoalOpen(true);
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
      try {
        const res = await fetch("/api/producer/tracker", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ date: d, ...next }),
        });
        const json = await parseJsonResponse<{ ok: boolean; error?: string }>(res, PRODUCER_API_ERROR_COPY);
        if (!json.ok) throw new Error(json.error ?? "Save failed");
        dirty.current = false;
      } catch (err) {
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
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void persist(next, date), 600);
      return next;
    });
  };

  // Goals write the same daily_projection row the dashboard reads, so the new
  // numbers become the targets every bar below counts up against right away.
  const saveGoal = useCallback(
    async (next: Projection) => {
      setGoalSaving(true);
      setGoalError(null);
      try {
        const res = await fetch("/api/producer/projection", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ date, ...next }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? "Failed to save goals");
        setTarget(next);
        window.localStorage.removeItem(skipKey(date));
        setGoalOpen(false);
      } catch (err) {
        setGoalError(err instanceof Error ? err.message : "Failed to save goals");
      } finally {
        setGoalSaving(false);
      }
    },
    [date],
  );

  const closeGoal = useCallback(() => {
    // Dismissing without saving counts as a skip for that day.
    if (!target) window.localStorage.setItem(skipKey(date), "1");
    setGoalError(null);
    setGoalOpen(false);
  }, [date, target]);

  // Flush a pending save when leaving the page so nothing is lost.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const totalDials = counts.dials;

  return (
    // A plain stack at every size. This used to stretch to fill the viewport,
    // but md: is a width breakpoint, so a wide-but-short laptop window took the
    // fill-the-screen path with nowhere near the height the cards need: they
    // were squeezed below their own content and the rows spilled over each
    // other into an unreadable pile. Natural heights, and the page scrolls
    // when there isn't room.
    <div className="flex flex-col gap-3">
      <PageHeader title="Daily Tracker" backHref={backHref} compact>
        {/* Both controls are the same height and shape so the row reads level.
            Saving happens quietly in the background — no status chip. */}
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setGoalError(null);
              setGoalOpen(true);
            }}
            disabled={projectionLoading}
            className="flex h-10 items-center rounded-full border border-hairline px-4 text-sm font-medium text-ink transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {target ? "Edit goals" : "Set goals"}
          </button>
          <input
            type="date"
            aria-label="Day"
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 rounded-full border border-hairline bg-card px-4 text-sm text-ink outline-none [color-scheme:dark] focus:border-accent"
          />
        </div>
      </PageHeader>

      {error && (
        <div className="rounded-xl border border-neg/40 bg-neg/[0.06] px-4 py-3 text-sm text-neg">
          {error}
        </div>
      )}

      {/* Hero dial counter */}
      <HeroDial
        value={totalDials}
        hint={METRICS[0].hint}
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
            hint={m.hint}
            value={counts[m.key]}
            target={target?.[m.key] ?? 0}
            onBump={(d) => bump(m.key, d)}
            disabled={loading}
          />
        ))}
        <PoliciesSoldCard
          value={counts.sales}
          target={target?.sales ?? 0}
          hint={METRICS.find((m) => m.key === "sales")!.hint}
        />
      </div>

      <DailyGoalModal
        open={goalOpen}
        initial={target ?? EMPTY_GOAL}
        isEdit={Boolean(target)}
        saving={goalSaving}
        error={goalError}
        onSave={saveGoal}
        onClose={closeGoal}
      />
    </div>
  );
}

// Policies sold is read-only on the tracker: the only way to log one is to add a
// client. The count is kept in sync server-side from the Clients book.
function PoliciesSoldCard({
  value,
  target,
  hint,
}: {
  value: number;
  target: number;
  hint: string;
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const hit = target > 0 && value >= target;
  return (
    // Spans both columns — the one card you can't tap, so it reads as its own
    // full-width row under the counters rather than a lonely half.
    <div className="rounded-2xl border border-hairline bg-card p-4 sm:col-span-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.12em] text-mute">Policies Sold</p>
          <p className="mt-1 text-xs leading-snug text-subtle">
            {hint}. Logged automatically when you add a client.
          </p>
        </div>
        {target > 0 && (
          <p className={`shrink-0 text-xs font-medium tabular-nums ${hit ? "text-pos" : "text-accent"}`}>
            {value} / {target}
          </p>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-4">
        <p className="min-w-[2ch] text-4xl font-semibold tabular-nums text-ink">{value}</p>
        <Link
          href="/producer/clients/new"
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-background transition hover:bg-accent-soft"
        >
          + Add New Client
        </Link>
      </div>
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
  hint,
  onBump,
  disabled,
}: {
  value: number;
  target: number;
  hint: string;
  onBump: (delta: number) => void;
  disabled: boolean;
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const hit = target > 0 && value >= target;
  return (
    <div className="overflow-hidden rounded-3xl bg-accent text-[#050505]">
      <div className="flex flex-col items-center justify-center gap-4 px-6 py-7 sm:px-8">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#050505]/70">
            Dials today
          </p>
          <p className="mt-1 text-sm text-[#050505]/70">{hint}</p>
        </div>
        <div className="flex items-center gap-5 sm:gap-8">
          <TapButton onClick={() => onBump(-1)} disabled={disabled || value <= 0} label="Remove a dial">
            −
          </TapButton>
          <p className="min-w-[3ch] text-center text-6xl font-semibold tabular-nums leading-none sm:text-7xl">
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
  hint,
  value,
  target,
  onBump,
  disabled,
}: {
  label: string;
  hint: string;
  value: number;
  target: number;
  onBump: (delta: number) => void;
  disabled: boolean;
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const hit = target > 0 && value >= target;
  return (
    <div className="flex flex-col justify-center rounded-2xl border border-hairline bg-card p-4">
      <p className="text-center text-xs uppercase tracking-[0.12em] text-mute">{label}</p>
      <p className="mt-1 text-center text-xs leading-snug text-subtle">{hint}</p>
      {/* Centered −/value/+ controls — bigger tap targets, value front-and-center. */}
      <div className="mt-2.5 flex items-center justify-center gap-5">
        <SmallTap onClick={() => onBump(-1)} disabled={disabled || value <= 0} label={`Remove ${label}`}>
          −
        </SmallTap>
        <p className="min-w-[2.5ch] text-center text-4xl font-semibold tabular-nums text-ink">
          {value}
        </p>
        <SmallTap onClick={() => onBump(1)} disabled={disabled} label={`Add ${label}`} primary>
          +
        </SmallTap>
      </div>
      {target > 0 && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-card-hi">
            <div
              className={`h-full rounded-full ${hit ? "bg-pos" : "bg-accent"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {/* Progress count sits under the bar so it reads as the bar's label. */}
          <p className={`mt-1.5 text-center text-xs font-medium tabular-nums ${hit ? "text-pos" : "text-accent"}`}>
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
