"use client";

import { useCallback, useEffect, useState } from "react";

const PURPOSES = [
  { value: "sale_submitted", label: "Submitted Sales" },
  { value: "leaderboard_daily", label: "Daily Leaderboard" },
  { value: "leaderboard_wtd", label: "Week-To-Date Leaderboard" },
  { value: "leaderboard_mtd", label: "Month-To-Date Leaderboard" },
  { value: "leaderboard_ytd", label: "Year-To-Date Leaderboard" },
] as const;

function purposeLabel(purpose: string): string {
  return PURPOSES.find((p) => p.value === purpose)?.label ?? purpose;
}

type Destination = {
  id: string;
  purpose: string;
  label: string;
  enabled: boolean;
  masked_url: string;
};

type BaselineRow = {
  person_id: string;
  full_name: string;
  baseline: {
    submitted_ap_cents: number;
    sales_count: number;
    baseline_through_date: string | null;
    notes: string | null;
    updated_at: string | null;
  } | null;
};

type BaselineDraft = {
  ap: string;
  sales: string;
  through: string;
  notes: string;
  updatedAt: string | null;
};

const PRIMARY_BTN =
  "rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-background transition hover:bg-accent-soft disabled:opacity-50";
const SMALL_SECONDARY_BTN =
  "shrink-0 rounded-full border border-hairline px-4 py-2 text-sm font-medium text-ink transition hover:border-mute disabled:opacity-50";

function DestinationsBlock() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [replaceUrl, setReplaceUrl] = useState("");

  const [addLabel, setAddLabel] = useState("");
  const [addPurpose, setAddPurpose] = useState<string>(PURPOSES[0].value);
  const [addUrl, setAddUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/producer/discord/destinations", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to load");
      setDestinations(json.destinations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (d: Destination) => {
    setBusyId(d.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/producer/discord/destinations/${d.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !d.enabled }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to save");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusyId(null);
    }
  };

  const test = async (d: Destination) => {
    setBusyId(d.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/producer/discord/destinations/${d.id}/test`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Test failed");
      setNotice({ id: d.id, text: "Test message sent.", ok: true });
    } catch (e) {
      setNotice({
        id: d.id,
        text: e instanceof Error ? e.message : "Test failed",
        ok: false,
      });
    } finally {
      setBusyId(null);
    }
  };

  const saveReplace = async (d: Destination) => {
    if (!replaceUrl.trim()) return;
    setBusyId(d.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/producer/discord/destinations/${d.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: replaceUrl.trim() }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to save");
      setReplaceId(null);
      setReplaceUrl("");
      setNotice({ id: d.id, text: "Webhook URL replaced.", ok: true });
      await load();
    } catch (e) {
      setNotice({
        id: d.id,
        text: e instanceof Error ? e.message : "Failed to save",
        ok: false,
      });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (d: Destination) => {
    if (confirmDeleteId !== d.id) {
      setConfirmDeleteId(d.id);
      return;
    }
    setBusyId(d.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/producer/discord/destinations/${d.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to delete");
      setConfirmDeleteId(null);
      await load();
    } catch (e) {
      setNotice({
        id: d.id,
        text: e instanceof Error ? e.message : "Failed to delete",
        ok: false,
      });
    } finally {
      setBusyId(null);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/producer/discord/destinations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: addLabel.trim(),
          purpose: addPurpose,
          url: addUrl.trim(),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to add");
      setAddUrl("");
      setAddLabel("");
      await load();
    } catch (e2) {
      setAddError(e2 instanceof Error ? e2.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold">Webhook destinations</h3>
      <p className="mt-1 max-w-2xl text-sm text-subtle">
        Each destination is one Discord channel webhook with one job: posting submitted sales
        or keeping one leaderboard up to date.
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-mute">Loading…</p>
      ) : (
        <div className="mt-6 max-w-2xl space-y-4">
          {destinations.length === 0 && (
            <p className="text-sm text-mute">No destinations yet. Add one below.</p>
          )}

          {destinations.map((d) => (
            <div key={d.id} className="rounded-2xl border border-hairline bg-card p-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-ink">{d.label}</span>
                <span className="text-xs text-subtle">{purposeLabel(d.purpose)}</span>
                {!d.enabled && <span className="text-xs text-mute">Disabled</span>}
              </div>
              <p className="mt-2 break-all font-mono text-xs text-mute">{d.masked_url}</p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggle(d)}
                  disabled={busyId === d.id}
                  className={SMALL_SECONDARY_BTN}
                >
                  {d.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  onClick={() => test(d)}
                  disabled={busyId === d.id}
                  className={SMALL_SECONDARY_BTN}
                >
                  Test
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReplaceId(replaceId === d.id ? null : d.id);
                    setReplaceUrl("");
                  }}
                  disabled={busyId === d.id}
                  className={SMALL_SECONDARY_BTN}
                >
                  {replaceId === d.id ? "Cancel replace" : "Replace"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(d)}
                  disabled={busyId === d.id}
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
                    confirmDeleteId === d.id
                      ? "border-neg text-neg"
                      : "border-hairline text-ink hover:border-mute"
                  }`}
                >
                  {confirmDeleteId === d.id ? "Really delete?" : "Delete"}
                </button>
              </div>

              {replaceId === d.id && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="url"
                    value={replaceUrl}
                    onChange={(e) => setReplaceUrl(e.target.value)}
                    placeholder="https://discord.com/api/webhooks/…"
                    className="w-full bg-transparent text-sm font-medium text-ink outline-none placeholder:text-mute"
                  />
                  <button
                    type="button"
                    onClick={() => saveReplace(d)}
                    disabled={busyId === d.id || !replaceUrl.trim()}
                    className={SMALL_SECONDARY_BTN}
                  >
                    Save URL
                  </button>
                </div>
              )}

              {notice?.id === d.id && (
                <p className={`mt-3 text-sm ${notice.ok ? "text-pos" : "text-neg"}`}>
                  {notice.text}
                </p>
              )}
            </div>
          ))}

          {error && <p className="text-sm text-neg">{error}</p>}

          <form onSubmit={add} className="rounded-2xl border border-hairline bg-card p-5">
            <span className="block text-sm font-medium text-ink">Add a destination</span>
            <span className="block text-xs text-mute">
              Paste a channel webhook URL from Discord (Channel Settings, Integrations,
              Webhooks).
            </span>
            <div className="mt-3 space-y-3">
              <input
                type="text"
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                placeholder="Label, like Sales Channel"
                className="w-full bg-transparent text-lg font-medium text-ink outline-none placeholder:text-mute"
              />
              <select
                value={addPurpose}
                onChange={(e) => setAddPurpose(e.target.value)}
                className="w-full bg-transparent text-lg font-medium text-ink outline-none"
              >
                {PURPOSES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <input
                type="url"
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/…"
                className="w-full bg-transparent text-lg font-medium text-ink outline-none placeholder:text-mute"
              />
            </div>
            {addError && <p className="mt-3 text-sm text-neg">{addError}</p>}
            <div className="mt-4">
              <button
                type="submit"
                disabled={adding || !addLabel.trim() || !addUrl.trim()}
                className={PRIMARY_BTN}
              >
                {adding ? "Adding…" : "Add destination"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function BaselinesBlock() {
  const [rows, setRows] = useState<BaselineRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, BaselineDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/producer/discord/ap-baselines", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to load");
      const list: BaselineRow[] = json.rows ?? [];
      setRows(list);
      const next: Record<string, BaselineDraft> = {};
      for (const r of list) {
        next[r.person_id] = {
          ap:
            r.baseline && r.baseline.submitted_ap_cents > 0
              ? String(r.baseline.submitted_ap_cents / 100)
              : r.baseline
                ? "0"
                : "",
          sales: r.baseline ? String(r.baseline.sales_count) : "",
          through: r.baseline?.baseline_through_date ?? "",
          notes: r.baseline?.notes ?? "",
          updatedAt: r.baseline?.updated_at ?? null,
        };
      }
      setDrafts(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setDraft = (personId: string, patch: Partial<BaselineDraft>) => {
    setSavedId(null);
    setDrafts((prev) => ({
      ...prev,
      [personId]: { ...(prev[personId] ?? emptyDraft()), ...patch },
    }));
  };

  const save = async (personId: string) => {
    const draft = drafts[personId] ?? emptyDraft();
    setRowError(null);
    setSavedId(null);
    if (!draft.through) {
      setRowError({ id: personId, text: "Pick a through date." });
      return;
    }
    const dollars = Number(draft.ap || 0);
    const sales = Number(draft.sales || 0);
    if (!Number.isFinite(dollars) || dollars < 0) {
      setRowError({ id: personId, text: "Baseline AP must be zero or more." });
      return;
    }
    if (!Number.isInteger(sales) || sales < 0) {
      setRowError({ id: personId, text: "Baseline sales must be a whole number." });
      return;
    }
    setSavingId(personId);
    try {
      const res = await fetch("/api/producer/discord/ap-baselines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          person_id: personId,
          baseline_through_date: draft.through,
          submitted_ap_dollars: dollars,
          sales_count: sales,
          notes: draft.notes,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to save");
      setSavedId(personId);
    } catch (e) {
      setRowError({
        id: personId,
        text: e instanceof Error ? e.message : "Failed to save",
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mt-12">
      <h3 className="text-lg font-semibold">Manual YTD starting totals</h3>
      <p className="mt-1 max-w-2xl text-sm text-subtle">
        Only for submitted AP tracked in Discord before this app. YTD adds this baseline to app
        sales after the through date.
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-mute">Loading…</p>
      ) : error ? (
        <p className="mt-6 text-sm text-neg">{error}</p>
      ) : (
        <div className="no-scrollbar mt-6 overflow-x-auto rounded-2xl border border-hairline bg-card">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                <th className="px-5 py-3 font-normal">Producer</th>
                <th className="px-5 py-3 font-normal">Baseline AP</th>
                <th className="px-5 py-3 font-normal">Baseline Sales</th>
                <th className="px-5 py-3 font-normal">Through Date</th>
                <th className="px-5 py-3 font-normal">Notes</th>
                <th className="px-5 py-3 font-normal">Last Updated</th>
                <th className="px-5 py-3 font-normal" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-4 text-mute">
                    No producers found.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const draft = drafts[r.person_id] ?? emptyDraft();
                return (
                  <tr key={r.person_id} className="border-b border-hairline last:border-0">
                    <td className="px-5 py-3 font-medium text-ink">{r.full_name}</td>
                    <td className="px-5 py-3">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={draft.ap}
                        onChange={(e) => setDraft(r.person_id, { ap: e.target.value })}
                        placeholder="0"
                        className="w-28 bg-transparent tabular-nums text-ink outline-none placeholder:text-mute"
                      />
                    </td>
                    <td className="px-5 py-3">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={draft.sales}
                        onChange={(e) => setDraft(r.person_id, { sales: e.target.value })}
                        placeholder="0"
                        className="w-20 bg-transparent tabular-nums text-ink outline-none placeholder:text-mute"
                      />
                    </td>
                    <td className="px-5 py-3">
                      <input
                        type="date"
                        value={draft.through}
                        onChange={(e) => setDraft(r.person_id, { through: e.target.value })}
                        className="bg-transparent tabular-nums text-ink outline-none"
                      />
                    </td>
                    <td className="px-5 py-3">
                      <input
                        type="text"
                        value={draft.notes}
                        onChange={(e) => setDraft(r.person_id, { notes: e.target.value })}
                        placeholder="Optional"
                        className="w-40 bg-transparent text-ink outline-none placeholder:text-mute"
                      />
                    </td>
                    <td className="px-5 py-3 text-mute">
                      {draft.updatedAt
                        ? new Date(draft.updatedAt).toLocaleDateString("en-US")
                        : "Never"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => save(r.person_id)}
                          disabled={savingId === r.person_id}
                          className={SMALL_SECONDARY_BTN}
                        >
                          {savingId === r.person_id ? "Saving…" : "Save"}
                        </button>
                        {savedId === r.person_id && (
                          <span className="text-sm text-pos">Saved.</span>
                        )}
                      </div>
                      {rowError?.id === r.person_id && (
                        <p className="mt-1 text-xs text-neg">{rowError.text}</p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function emptyDraft(): BaselineDraft {
  return { ap: "", sales: "", through: "", notes: "", updatedAt: null };
}

function RebuildBlock() {
  const [rebuilding, setRebuilding] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rebuild = async () => {
    setRebuilding(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/producer/discord/rebuild", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ periods: ["daily", "wtd", "mtd", "ytd"] }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Rebuild failed");
      setResult(`Updated ${json.updated ?? 0} Discord messages.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rebuild failed");
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div className="mt-12">
      <h3 className="text-lg font-semibold">Rebuild leaderboards</h3>
      <p className="mt-1 max-w-2xl text-sm text-subtle">Run this after changing baselines.</p>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={rebuild} disabled={rebuilding} className={PRIMARY_BTN}>
          {rebuilding ? "Rebuilding…" : "Rebuild Discord Leaderboards"}
        </button>
        {result && <span className="text-sm text-pos">{result}</span>}
      </div>
      {error && <p className="mt-3 text-sm text-neg">{error}</p>}
    </div>
  );
}

export function DiscordSettingsSection() {
  return (
    <div>
      <DestinationsBlock />
      <BaselinesBlock />
      <RebuildBlock />
    </div>
  );
}
