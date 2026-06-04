"use client";

import { useCallback, useEffect, useState } from "react";

export function GoalSettingsForm() {
  const [ap, setAp] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/producer/goal", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to load");
      if (json.goal?.ap_cents) setAp(String(json.goal.ap_cents / 100));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/producer/goal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ap_cents: Math.max(0, Math.round((Number(ap) || 0) * 100)) }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to save");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="mt-6 text-sm text-mute">Loading…</p>;

  return (
    <form onSubmit={submit} className="mt-6 max-w-xl">
      <label className="block rounded-2xl border border-hairline bg-card p-5">
        <span className="block text-sm font-medium text-ink">Monthly Annual Premium goal</span>
        <span className="block text-xs text-mute">
          Your target AP for the month. The dashboard reverse-engineers your daily activity from
          this.
        </span>
        <div className="mt-3 flex items-baseline">
          <span className="mr-1 text-lg text-mute">$</span>
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={ap}
            onChange={(e) => {
              setAp(e.target.value);
              setSaved(false);
            }}
            placeholder="0"
            className="w-full bg-transparent text-3xl font-semibold tabular-nums text-ink outline-none placeholder:text-mute"
          />
        </div>
      </label>

      {error && <p className="mt-4 text-sm text-neg">{error}</p>}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-background transition hover:bg-accent-soft disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save goal"}
        </button>
        {saved && <span className="text-sm text-pos">Saved.</span>}
      </div>
    </form>
  );
}
