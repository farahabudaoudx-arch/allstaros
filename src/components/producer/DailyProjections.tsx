"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { money, num, pctValue } from "@/lib/producer/format";
import { localIsoDate } from "@/lib/producer/time";

type Projection = {
  dials: number;
  contacts: number;
  appointments: number;
  presentations: number;
  sales: number;
  ap_cents: number;
};

type Actuals = Projection;

const EMPTY: Projection = {
  dials: 0,
  contacts: 0,
  appointments: 0,
  presentations: 0,
  sales: 0,
  ap_cents: 0,
};

const FIELDS: Array<{ key: keyof Projection; label: string; money?: boolean }> = [
  { key: "dials", label: "Dials" },
  { key: "contacts", label: "Contacts" },
  { key: "presentations", label: "Presentations" },
  { key: "sales", label: "Policies Sold" },
  { key: "ap_cents", label: "AP Submitted", money: true },
];

export function DailyProjections() {
  const today = useMemo(() => localIsoDate(), []);
  const [projection, setProjection] = useState<Projection | null>(null);
  const [actuals, setActuals] = useState<Actuals>(EMPTY);
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
      const projJson = await projRes.json();
      const actJson = await actRes.json();
      if (!projJson.ok) throw new Error(projJson.error ?? "Failed to load projection");
      if (!actJson.ok) throw new Error(actJson.error ?? "Failed to load activity");
      setProjection(projJson.projection ?? null);
      setActuals({
        dials: actJson.totals.dials,
        contacts: actJson.totals.contacts,
        appointments: actJson.totals.appointments,
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
    load();
  }, [load]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">Daily projections</h2>
        {projection && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-medium text-accent hover:text-accent-soft"
          >
            Edit
          </button>
        )}
      </div>

      {error ? (
        <p className="mt-6 text-sm text-neg">{error}</p>
      ) : loading ? (
        <p className="mt-6 text-sm text-mute">Loading…</p>
      ) : projection && !editing ? (
        <ProgressView projection={projection} actuals={actuals} />
      ) : (
        <ProjectionForm
          date={today}
          initial={projection ?? EMPTY}
          saving={saving}
          onCancel={projection ? () => setEditing(false) : undefined}
          onSubmit={async (next) => {
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
          }}
        />
      )}
    </section>
  );
}

function ProgressView({ projection, actuals }: { projection: Projection; actuals: Actuals }) {
  return (
    <>
      <p className="mt-2 max-w-2xl text-sm text-subtle">
        Today&apos;s progress against the targets you set.
      </p>
      <div className="mt-6 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map((f) => {
          const target = projection[f.key];
          const actual = actuals[f.key];
          const pct = pctValue(actual, target);
          const fmt = (v: number) => (f.money ? money(v) : num(v));
          const hit = target > 0 && actual >= target;
          return (
            <div key={f.key} className="rounded-2xl border border-hairline bg-card p-5">
              <div className="flex items-baseline justify-between">
                <p className="text-xs uppercase tracking-[0.12em] text-mute">{f.label}</p>
                <p className={`text-xs font-medium tabular-nums ${hit ? "text-pos" : "text-accent"}`}>
                  {target > 0 ? `${Math.round(pct)}%` : "—"}
                </p>
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
                {fmt(actual)}
                <span className="text-base font-normal text-mute"> / {fmt(target)}</span>
              </p>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-card-hi">
                <div
                  className={`h-full rounded-full ${hit ? "bg-pos" : "bg-accent"}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function ProjectionForm({
  date,
  initial,
  saving,
  onSubmit,
  onCancel,
}: {
  date: string;
  initial: Projection;
  saving: boolean;
  onSubmit: (next: Projection) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<Record<keyof Projection, string>>({
    dials: initial.dials ? String(initial.dials) : "",
    contacts: initial.contacts ? String(initial.contacts) : "",
    appointments: initial.appointments ? String(initial.appointments) : "",
    presentations: initial.presentations ? String(initial.presentations) : "",
    sales: initial.sales ? String(initial.sales) : "",
    ap_cents: initial.ap_cents ? String(initial.ap_cents / 100) : "",
  });

  const set = (key: keyof Projection, v: string) => setForm((p) => ({ ...p, [key]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      dials: Math.max(0, Math.floor(Number(form.dials) || 0)),
      contacts: Math.max(0, Math.floor(Number(form.contacts) || 0)),
      appointments: Math.max(0, Math.floor(Number(form.appointments) || 0)),
      presentations: Math.max(0, Math.floor(Number(form.presentations) || 0)),
      sales: Math.max(0, Math.floor(Number(form.sales) || 0)),
      ap_cents: Math.max(0, Math.round((Number(form.ap_cents) || 0) * 100)),
    });
  };

  return (
    <form onSubmit={submit}>
      <p className="mt-2 max-w-2xl text-sm text-subtle">
        Set your targets for today. Once saved, you&apos;ll see live progress bars against them.
      </p>
      <div className="mt-6 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {FIELDS.map((f) => (
          <label key={f.key} className="rounded-2xl border border-hairline bg-card p-5">
            <span className="block text-xs uppercase tracking-[0.12em] text-mute">{f.label}</span>
            <div className="mt-2 flex items-baseline">
              {f.money && <span className="mr-1 text-lg text-mute">$</span>}
              <input
                type="number"
                min={0}
                step={f.money ? "0.01" : "1"}
                inputMode={f.money ? "decimal" : "numeric"}
                value={form[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder="0"
                className="w-full bg-transparent text-3xl font-semibold tabular-nums text-ink outline-none placeholder:text-mute"
              />
            </div>
          </label>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-background transition hover:bg-accent-soft disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save projections"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-full border border-hairline px-5 py-2.5 text-sm font-medium text-subtle transition hover:border-mute disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
      <p className="sr-only">Projection date: {date}</p>
    </form>
  );
}
