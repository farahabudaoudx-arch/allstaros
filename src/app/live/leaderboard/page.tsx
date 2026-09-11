"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";

type Snapshot = {
  scope: "team" | "organization";
  asOf: string;
  range: { from: string; to: string };
  totals: {
    submitted_ap_cents: number;
    deals: number;
    people: number;
    average_ticket_cents: number;
  };
  periods: {
    week: { range: { from: string; to: string }; submitted_ap_cents: number; deals: number };
    month: { range: { from: string; to: string }; submitted_ap_cents: number; deals: number };
  };
  rows: Array<{
    full_name: string;
    photo_url: string | null;
    submitted_ap_cents: number;
    sales_count: number;
  }>;
};

type State =
  | { kind: "loading" }
  | { kind: "dead" }
  | { kind: "error" }
  | { kind: "ready"; snapshot: Snapshot };

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function dollars(cents: number) {
  return money.format(cents / 100);
}

export default function LiveLeaderboardPage() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const token = window.location.hash.slice(1);
    if (!token) {
      queueMicrotask(() => setState({ kind: "dead" }));
      return;
    }

    const controller = new AbortController();
    void fetch("/api/live-leaderboard/snapshot", {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as { ok?: boolean } & Partial<Snapshot>;
        if (!response.ok || !payload.ok) {
          if (response.status === 404 || response.status === 410 || response.status === 401) {
            setState({ kind: "dead" });
            return;
          }
          setState({ kind: "error" });
          return;
        }
        setState({ kind: "ready", snapshot: payload as Snapshot });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ kind: "error" });
      });

    return () => controller.abort();
  }, []);

  if (state.kind === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070a] px-6 text-white">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/40">All Star OS Live</p>
          <p className="mt-4 text-2xl font-semibold text-white/80">Loading leaderboard…</p>
        </div>
      </main>
    );
  }

  if (state.kind === "dead") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070a] px-6 text-white">
        <div className="max-w-xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-white/45">All Star OS Live</p>
          <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">Ask for a new link.</h1>
        </div>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070a] px-6 text-white">
        <div className="max-w-xl text-center">
          <h1 className="text-3xl font-semibold sm:text-4xl">Live Leaderboard is temporarily unavailable.</h1>
          <p className="mt-3 text-white/55">Reload this display to try again.</p>
        </div>
      </main>
    );
  }

  const { snapshot } = state;
  const title = snapshot.scope === "team" ? "Team Today" : "All Star Today";
  const podiumRows = snapshot.rows.slice(0, 3);
  const rankedRows = snapshot.rows.slice(3);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#05070a] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(197,255,74,0.08),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_32%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-5 sm:px-7 sm:py-7 lg:px-10 xl:px-14">
        <header className="grid gap-5 border-b border-white/10 pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-2.5">
              <Image src="/logo.png" alt="All Star Life Group" width={120} height={68} priority className="h-auto w-20 sm:w-24 lg:w-28" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-white/40 sm:text-xs">All Star Life Group · Live</p>
              <h1 className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">{title}</h1>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-center sm:px-5">
              <div className="truncate text-2xl font-semibold sm:text-3xl">{dollars(snapshot.totals.submitted_ap_cents)}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Submitted</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-center sm:px-5">
              <div className="text-2xl font-semibold sm:text-3xl">{snapshot.totals.deals}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Deals</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-center sm:px-5">
              <div className="text-2xl font-semibold sm:text-3xl">{snapshot.totals.people}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">People</div>
            </div>
            <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-center sm:px-5">
              <div className="truncate text-2xl font-semibold sm:text-3xl">{dollars(snapshot.totals.average_ticket_cents)}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Avg ticket</div>
            </div>
          </div>
        </header>

        <section className="flex-1 py-6 sm:py-8">
          {snapshot.rows.length === 0 ? (
            <div className="flex min-h-[42vh] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.025] px-6 text-center">
              <div>
                <p className="text-3xl font-semibold sm:text-5xl">No deals yet today.</p>
                <p className="mt-3 text-sm text-white/40 sm:text-base">The board is ready for the first counted submitted deal.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <section aria-label="Top three" className="grid gap-3 sm:grid-cols-3 sm:gap-4">
                {podiumRows.map((row, index) => (
                  <article
                    key={row.full_name + "-podium-" + index}
                    className={"relative overflow-hidden rounded-3xl border p-5 text-center sm:p-6 lg:p-7 " + (index === 0 ? "border-lime-300/35 bg-lime-300/[0.07] sm:-translate-y-2" : "border-white/10 bg-white/[0.035]")}
                  >
                    <div className="absolute right-4 top-3 text-5xl font-black leading-none text-white/[0.06]">#{index + 1}</div>
                    <div className="mx-auto flex w-fit items-center justify-center rounded-full border border-white/10 bg-black/20 p-1.5">
                      <Avatar name={row.full_name} photoUrl={row.photo_url} className="h-20 w-20 text-xl ring-1 ring-white/15 sm:h-24 sm:w-24 lg:h-28 lg:w-28 lg:text-2xl" />
                    </div>
                    <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">Rank {index + 1}</p>
                    <h2 className="mt-1 truncate text-2xl font-semibold sm:text-3xl lg:text-4xl">{row.full_name}</h2>
                    <p className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">{dollars(row.submitted_ap_cents)}</p>
                    <p className="mt-2 text-sm text-white/45">{row.sales_count} {row.sales_count === 1 ? "deal" : "deals"}</p>
                  </article>
                ))}
              </section>

              {rankedRows.length > 0 ? (
                <section aria-label="Ranks four and below" className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025]">
                  <ol className="divide-y divide-white/8">
                    {rankedRows.map((row, index) => (
                      <li key={row.full_name + "-rank-" + index} className="grid grid-cols-[3.25rem_2.75rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 sm:grid-cols-[4rem_3rem_minmax(0,1fr)_7rem_auto] sm:px-6 lg:py-4">
                        <span className="text-xl font-semibold text-white/30 sm:text-2xl">#{index + 4}</span>
                        <Avatar name={row.full_name} photoUrl={row.photo_url} className="h-10 w-10 text-xs ring-1 ring-white/10 sm:h-11 sm:w-11" />
                        <span className="truncate text-lg font-medium sm:text-xl lg:text-2xl">{row.full_name}</span>
                        <span className="hidden text-right text-sm text-white/40 sm:block">{row.sales_count} {row.sales_count === 1 ? "deal" : "deals"}</span>
                        <span className="min-w-24 text-right text-xl font-semibold sm:text-2xl">{dollars(row.submitted_ap_cents)}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
            </div>
          )}
        </section>

        <footer className="grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-2">
          {[
            { label: "Week so far", period: snapshot.periods.week },
            { label: "Month so far", period: snapshot.periods.month },
          ].map(({ label, period }) => (
            <div key={label} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white/80 sm:text-base">{label}</p>
                <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.16em] text-white/30">{period.range.from} → {period.range.to}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold sm:text-xl">{dollars(period.submitted_ap_cents)}</p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">Submitted</p>
              </div>
              <div className="min-w-14 text-right">
                <p className="text-lg font-semibold sm:text-xl">{period.deals}</p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">Deals</p>
              </div>
            </div>
          ))}
        </footer>
      </div>
    </main>
  );
}
