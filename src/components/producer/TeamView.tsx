"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TimeframePills, type Timeframe } from "@/components/producer/charts/TimeframePills";
import { money, num } from "@/lib/producer/format";

type Row = {
  person_id: string;
  full_name: string;
  is_builder: boolean;
  ap_cents: number;
  ip_cents: number;
  sales: number;
  policies: number;
  deposits_cents: number;
};

type TeamResp =
  | {
      ok: true;
      meId: string;
      range: { key: string; from: string; to: string };
      producers: number;
      totals: { ap_cents: number; ip_cents: number; policies: number; sales: number };
      rows: Row[];
    }
  | { ok: false; error: string };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

function fmtRange(from: string, to: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  const f = new Date(`${from}T12:00:00Z`).toLocaleDateString("en-US", opts);
  const t = new Date(`${to}T12:00:00Z`).toLocaleDateString("en-US", opts);
  return f === t ? f : `${f} – ${t}`;
}

export function TeamView() {
  const [tf, setTf] = useState<Timeframe>({ key: "mtd" });
  const [data, setData] = useState<TeamResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    function load() {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set("range", tf.key);
      if (tf.key === "custom" && tf.from && tf.to) {
        params.set("from", tf.from);
        params.set("to", tf.to);
      }
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) params.set("tz", tz);
      fetch(`/api/producer/team?${params.toString()}`, { cache: "no-store" })
        .then((r) => r.json() as Promise<TeamResp>)
        .then((j) => {
          if (aborted) return;
          if (!j.ok) throw new Error(j.error ?? "Failed to load");
          setData(j);
        })
        .catch((e) => {
          if (!aborted) setError(e instanceof Error ? e.message : "Failed to load");
        })
        .finally(() => {
          if (!aborted) setLoading(false);
        });
    }
    load();
    return () => {
      aborted = true;
    };
  }, [tf]);

  const ok = data?.ok ? data : null;
  const totals = ok?.totals ?? { ap_cents: 0, ip_cents: 0, policies: 0, sales: 0 };
  const rows = ok?.rows ?? [];
  const meId = ok?.meId;

  const kpis = [
    { label: "Team AP", value: money(totals.ap_cents) },
    { label: "Policies", value: num(totals.policies) },
    { label: "Producers", value: num(ok?.producers ?? rows.length) },
  ];

  return (
    <div className="mt-8">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-subtle">
          {ok ? (
            <>
              Production across your team ·{" "}
              <span className="text-ink">{fmtRange(ok.range.from, ok.range.to)}</span>
            </>
          ) : (
            <span>&nbsp;</span>
          )}
          {loading && <span className="ml-2 text-xs text-mute">loading…</span>}
          {error && <span className="ml-2 text-xs text-warn">{error}</span>}
        </div>
        <TimeframePills value={tf} onChange={setTf} />
      </div>

      {/* KPIs */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl border border-hairline bg-card p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">{k.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Roster */}
      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-hairline bg-card p-10 text-center text-sm text-mute">
          {loading ? "Loading your team…" : "No producers in your downline yet."}
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
          {rows.map((row) => {
            const isMe = row.person_id === meId;
            return (
              <li key={row.person_id}>
                <Link
                  href={`/producer/team/${row.person_id}`}
                  className={`flex items-center gap-4 px-5 py-4 transition ${
                    isMe ? "bg-accent/[0.06] hover:bg-accent/[0.1]" : "hover:bg-card-hi/60"
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card-hi text-[11px] font-semibold text-ink ring-1 ring-hairline">
                    {initials(row.full_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink">
                      {row.full_name}
                      {isMe ? <span className="ml-1 text-accent">(you)</span> : null}
                      {row.is_builder && !isMe ? (
                        <span className="ml-2 rounded-full border border-hairline px-2 py-0.5 align-middle font-mono text-[9px] uppercase tracking-[0.12em] text-mute">
                          Builder
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-mute">
                      {num(row.policies)} policies · {num(row.sales)} sales
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-semibold tabular-nums text-accent">{money(row.ap_cents)}</div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-mute">AP</div>
                  </div>
                  <span className="shrink-0 text-mute" aria-hidden>
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
