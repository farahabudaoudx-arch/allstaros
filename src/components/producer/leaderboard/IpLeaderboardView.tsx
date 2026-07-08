"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  IpBoard,
  IpLeaderboardRow,
  IpPeriod,
} from "@/lib/producer/ip-leaderboard";
import { money } from "@/lib/producer/format";
import { localIsoDate } from "@/lib/producer/time";

type IpLeaderboardResponse = {
  ok: true;
  meId: string;
  board: IpBoard;
  period: IpPeriod;
  reportDate: string | null;
  from: string | null;
  to: string | null;
  rows: IpLeaderboardRow[];
};

const PERIODS: Array<{ key: IpPeriod; label: string }> = [
  { key: "wtd", label: "WTD" },
  { key: "mtd", label: "MTD" },
  { key: "ytd", label: "YTD" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Gateway reports the biggest leg as a percent of team IP; dollars derive
// from that percent so the columns always agree with each other.
function firstLegCents(row: IpLeaderboardRow): number | null {
  if (row.first_leg_percent == null) return null;
  return Math.round((row.team_ip_cents * row.first_leg_percent) / 100);
}

const PODIUM_RING = ["ring-accent", "ring-subtle", "ring-warn"];
const PODIUM_TEXT = ["text-accent", "text-subtle", "text-warn"];

export function IpLeaderboardView({ board }: { board: IpBoard }) {
  const [period, setPeriod] = useState<IpPeriod>("mtd");
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState<{ from: string; to: string } | null>(null);
  const [data, setData] = useState<IpLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const today = localIsoDate();

  const load = useCallback(async () => {
    if (period === "custom" && !applied) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ board, period });
    if (period === "custom" && applied) {
      params.set("from", applied.from);
      params.set("to", applied.to);
    }
    try {
      const res = await fetch(`/api/producer/ip-leaderboard?${params}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to load");
      setData(json as IpLeaderboardResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [board, period, applied]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = data?.rows ?? [];
  const podium = rows.slice(0, 3);
  const meId = data?.meId;
  const isCustom = data?.period === "custom";
  const rankMetric = board === "team" ? "team_ip_cents" : "personal_ip_cents";

  const myRank = useMemo(() => {
    if (!meId) return null;
    const idx = rows.findIndex((r) => r.person_id === meId);
    return idx >= 0 ? idx + 1 : null;
  }, [rows, meId]);

  const caption = useMemo(() => {
    if (!data) return null;
    if (data.period === "custom" && data.from && data.to) {
      return `Weekly Gateway reports, ${fmtDate(data.from)} through ${fmtDate(data.to)}`;
    }
    if (data.reportDate) {
      return `Latest Gateway report · ${fmtDate(data.reportDate)}`;
    }
    return null;
  }, [data]);

  const customActive = customOpen || period === "custom";

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          {caption ? (
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
              {caption}
            </p>
          ) : null}
          {myRank ? (
            <p className="mt-2 text-sm text-subtle">
              You&apos;re ranked{" "}
              <span className="font-semibold text-accent">#{myRank}</span> of{" "}
              {rows.length} by {board === "team" ? "team IP" : "personal IP"}.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-hairline bg-card p-1">
            {PERIODS.map((p) => {
              const active = !customActive && period === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    setCustomOpen(false);
                    setPeriod(p.key);
                  }}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                    active ? "bg-accent text-black" : "text-subtle hover:text-ink"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setCustomOpen((o) => !o)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                customActive ? "bg-accent text-black" : "text-subtle hover:text-ink"
              }`}
            >
              Custom
            </button>
          </div>

          {customOpen && (
            <div className="flex items-center gap-2 rounded-full border border-hairline bg-card px-3 py-1.5">
              <input
                type="date"
                value={from}
                min="2026-01-01"
                max={to || today}
                onChange={(e) => setFrom(e.target.value)}
                className="bg-transparent text-xs text-ink outline-none [color-scheme:dark]"
              />
              <span className="text-mute">to</span>
              <input
                type="date"
                value={to}
                min={from || "2026-01-01"}
                max={today}
                onChange={(e) => setTo(e.target.value)}
                className="bg-transparent text-xs text-ink outline-none [color-scheme:dark]"
              />
              <button
                type="button"
                disabled={!from || !to}
                onClick={() => {
                  setApplied({ from, to });
                  setPeriod("custom");
                  setCustomOpen(false);
                }}
                className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-black disabled:opacity-40"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div className="mt-8 rounded-2xl border border-hairline bg-card p-10 text-center text-sm text-neg">
          {error}
        </div>
      ) : period === "custom" && !applied ? (
        <div className="mt-8 rounded-2xl border border-hairline bg-card p-10 text-center text-sm text-mute">
          Pick a start and end date, then hit Apply.
        </div>
      ) : loading && !data ? (
        <div className="mt-8 rounded-2xl border border-hairline bg-card p-10 text-center text-sm text-mute">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-hairline bg-card p-10 text-center text-sm text-mute">
          No Gateway issued premium in this range.
        </div>
      ) : (
        <>
          {/* Podium */}
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
                  <p
                    className={`mt-3 font-mono text-xs uppercase tracking-[0.16em] ${PODIUM_TEXT[i]}`}
                  >
                    #{i + 1}
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-ink">
                    {row.full_name}
                    {isMe ? <span className="ml-1 text-accent">(you)</span> : null}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
                    {money(row[rankMetric])}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Ranked table */}
          <div className="no-scrollbar mt-3 overflow-x-auto rounded-2xl border border-hairline bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                  <th className="px-3 py-3 font-normal md:px-5">Rank</th>
                  <th className="px-3 py-3 font-normal md:px-5">
                    {board === "team" ? "Builder" : "Producer"}
                  </th>
                  {board === "team" ? (
                    <>
                      <th className="px-3 py-3 text-right font-normal md:px-5">Team IP</th>
                      <th className="hidden px-5 py-3 text-right font-normal sm:table-cell">
                        Personal IP
                      </th>
                      {!isCustom && (
                        <>
                          <th className="hidden px-5 py-3 text-right font-normal md:table-cell">
                            1st Leg
                          </th>
                          <th className="hidden px-5 py-3 text-right font-normal md:table-cell">
                            1st Leg %
                          </th>
                          <th className="hidden px-5 py-3 text-right font-normal lg:table-cell">
                            Outside 1st Leg
                          </th>
                        </>
                      )}
                    </>
                  ) : (
                    <th className="px-5 py-3 text-right font-normal">Personal IP</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const isMe = row.person_id === meId;
                  const leg1 = firstLegCents(row);
                  return (
                    <tr
                      key={row.person_id}
                      className={`border-b border-hairline last:border-0 transition ${
                        isMe ? "bg-accent/[0.06]" : "hover:bg-card-hi/60"
                      }`}
                    >
                      <td className="px-3 py-3 tabular-nums text-mute md:px-5">{i + 1}</td>
                      <td className="px-3 py-3 md:px-5">
                        <div className="flex items-center gap-3">
                          <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card-hi text-[11px] font-semibold text-ink ring-1 ring-hairline sm:flex">
                            {initials(row.full_name)}
                          </span>
                          <span className="truncate font-medium text-ink">
                            {row.full_name}
                            {isMe ? (
                              <span className="ml-1 text-accent">(you)</span>
                            ) : null}
                          </span>
                        </div>
                      </td>
                      {board === "team" ? (
                        <>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums text-accent md:px-5">
                            {money(row.team_ip_cents)}
                          </td>
                          <td className="hidden px-5 py-3 text-right tabular-nums text-subtle sm:table-cell">
                            {money(row.personal_ip_cents)}
                          </td>
                          {!isCustom && (
                            <>
                              <td className="hidden max-w-[14rem] px-5 py-3 text-right md:table-cell">
                                <span className="block truncate text-subtle">
                                  {row.first_leg_producer ?? "—"}
                                </span>
                                {leg1 != null ? (
                                  <span className="block tabular-nums text-mute">
                                    {money(leg1)}
                                  </span>
                                ) : null}
                              </td>
                              <td className="hidden px-5 py-3 text-right tabular-nums text-subtle md:table-cell">
                                {row.first_leg_percent != null
                                  ? `${row.first_leg_percent.toFixed(1)}%`
                                  : "—"}
                              </td>
                              <td className="hidden px-5 py-3 text-right tabular-nums text-subtle lg:table-cell">
                                {row.outside_first_leg_cents != null
                                  ? money(row.outside_first_leg_cents)
                                  : "—"}
                              </td>
                            </>
                          )}
                        </>
                      ) : (
                        <td className="px-5 py-3 text-right font-semibold tabular-nums text-accent">
                          {money(row.personal_ip_cents)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
