"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TimeframePills, type Timeframe } from "@/components/producer/charts/TimeframePills";
import type { LeaderboardMetric, LeaderboardRow } from "@/lib/producer/metrics";
import { money, num } from "@/lib/producer/format";

type LeaderboardResponse = {
  ok: true;
  meId: string;
  range: { key: string; from: string; to: string };
  metric: LeaderboardMetric;
  rows: LeaderboardRow[];
};

const METRICS: Array<{
  key: LeaderboardMetric;
  label: string;
  short: string;
  money?: boolean;
  hideSmall?: boolean;
}> = [
  { key: "ap_cents", label: "Annual Premium", short: "AP", money: true },
  { key: "sales", label: "Sales", short: "Sales" },
  { key: "dials", label: "Dials", short: "Dials", hideSmall: true },
  { key: "contacts", label: "Contacts", short: "Contacts", hideSmall: true },
  { key: "presentations", label: "Presentations", short: "Pres", hideSmall: true },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

function metricValue(row: LeaderboardRow, metric: LeaderboardMetric): string {
  const meta = METRICS.find((m) => m.key === metric)!;
  return meta.money ? money(row[metric]) : num(row[metric]);
}

const PODIUM_RING = ["ring-accent", "ring-subtle", "ring-warn"];
const PODIUM_TEXT = ["text-accent", "text-subtle", "text-warn"];

export function LeaderboardView() {
  const [tf, setTf] = useState<Timeframe>({ key: "mtd" });
  const [metric, setMetric] = useState<LeaderboardMetric>("ap_cents");
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const params = new URLSearchParams({ range: tf.key, metric, tz });
    if (tf.key === "custom" && tf.from && tf.to) {
      params.set("from", tf.from);
      params.set("to", tf.to);
    }
    try {
      const res = await fetch(`/api/producer/leaderboard?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to load");
      setData(json as LeaderboardResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [tf, metric]);

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

  const rows = data?.rows ?? [];
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const meId = data?.meId;

  const myRank = useMemo(() => {
    if (!meId) return null;
    const idx = rows.findIndex((r) => r.person_id === meId);
    return idx >= 0 ? idx + 1 : null;
  }, [rows, meId]);

  return (
    <section>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">Producer</p>
          <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
            Leaderboard
          </h1>
          {myRank ? (
            <p className="mt-2 text-sm text-subtle">
              You&apos;re ranked{" "}
              <span className="font-semibold text-accent">#{myRank}</span> of {rows.length} by{" "}
              {METRICS.find((m) => m.key === metric)!.label.toLowerCase()}.
            </p>
          ) : null}
        </div>
        <TimeframePills value={tf} onChange={setTf} />
      </div>

      {/* Metric selector */}
      <div className="mt-6 flex flex-wrap items-center gap-1.5">
        {METRICS.map((m) => {
          const active = metric === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-accent/50 bg-accent/[0.08] text-accent"
                  : "border-hairline bg-card text-subtle hover:border-mute hover:text-ink"
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="mt-8 rounded-2xl border border-hairline bg-card p-10 text-center text-sm text-neg">
          {error}
        </div>
      ) : loading && !data ? (
        <div className="mt-8 rounded-2xl border border-hairline bg-card p-10 text-center text-sm text-mute">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-hairline bg-card p-10 text-center text-sm text-mute">
          No producer activity in this range.
        </div>
      ) : (
        <>
          {/* Podium */}
          {podium.length > 0 ? (
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {podium.map((row, i) => {
                const isMe = row.person_id === meId;
                return (
                  <div
                    key={row.person_id}
                    className={`flex flex-col items-center rounded-2xl border bg-card p-6 text-center ${
                      isMe ? "border-accent/60 bg-accent/[0.04]" : "border-hairline"
                    }`}
                  >
                    <div
                      className={`flex h-14 w-14 items-center justify-center rounded-full bg-card-hi text-base font-semibold text-ink ring-2 ${PODIUM_RING[i]}`}
                    >
                      {initials(row.full_name)}
                    </div>
                    <p className={`mt-3 font-mono text-xs uppercase tracking-[0.16em] ${PODIUM_TEXT[i]}`}>
                      #{i + 1}
                    </p>
                    <p className="mt-1 truncate text-sm font-medium text-ink">
                      {row.full_name}
                      {isMe ? <span className="ml-1 text-accent">(you)</span> : null}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
                      {metricValue(row, metric)}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Ranked table */}
          <div className="mt-3 overflow-hidden rounded-2xl border border-hairline bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                  <th className="px-5 py-3 font-normal">Rank</th>
                  <th className="px-5 py-3 font-normal">Producer</th>
                  {METRICS.map((m) => (
                    <th
                      key={m.key}
                      className={`px-5 py-3 text-right font-normal ${m.hideSmall ? "hidden md:table-cell" : ""}`}
                    >
                      {m.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const isMe = row.person_id === meId;
                  return (
                    <tr
                      key={row.person_id}
                      className={`border-b border-hairline last:border-0 transition ${
                        isMe ? "bg-accent/[0.06]" : "hover:bg-card-hi/60"
                      }`}
                    >
                      <td className="px-5 py-3 tabular-nums text-mute">{i + 1}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card-hi text-[11px] font-semibold text-ink ring-1 ring-hairline">
                            {initials(row.full_name)}
                          </span>
                          <span className="truncate font-medium text-ink">
                            {row.full_name}
                            {isMe ? <span className="ml-1 text-accent">(you)</span> : null}
                          </span>
                        </div>
                      </td>
                      {METRICS.map((m) => {
                        const active = metric === m.key;
                        return (
                          <td
                            key={m.key}
                            className={`px-5 py-3 text-right tabular-nums ${
                              m.hideSmall ? "hidden md:table-cell" : ""
                            } ${active ? "font-semibold text-accent" : "text-subtle"}`}
                          >
                            {m.money ? money(row[m.key]) : num(row[m.key])}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
