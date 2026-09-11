"use client";

import { useEffect, useState } from "react";

type Snapshot = {
  scope: "team" | "organization";
  asOf: string;
  range: { from: string; to: string };
  totals: { submitted_ap_cents: number; deals: number; people: number };
  rows: Array<{
    full_name: string;
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
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-white">
        <p className="text-xl text-white/70">Loading Live Leaderboard…</p>
      </main>
    );
  }

  if (state.kind === "dead") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-white">
        <div className="max-w-xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-white/50">All Star OS Live</p>
          <h1 className="mt-4 text-4xl font-semibold">Ask for a new link.</h1>
        </div>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-white">
        <div className="max-w-xl text-center">
          <h1 className="text-3xl font-semibold">Live Leaderboard is temporarily unavailable.</h1>
          <p className="mt-3 text-white/60">Reload this display to try again.</p>
        </div>
      </main>
    );
  }

  const { snapshot } = state;
  const title = snapshot.scope === "team" ? "Team Today" : "All Star Today";

  return (
    <main className="min-h-screen bg-neutral-950 px-5 py-8 text-white sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-white/45">All Star OS Live</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-white/5 px-5 py-4">
              <div className="text-2xl font-semibold">{dollars(snapshot.totals.submitted_ap_cents)}</div>
              <div className="mt-1 text-xs uppercase tracking-wider text-white/45">Submitted</div>
            </div>
            <div className="rounded-2xl bg-white/5 px-5 py-4">
              <div className="text-2xl font-semibold">{snapshot.totals.deals}</div>
              <div className="mt-1 text-xs uppercase tracking-wider text-white/45">Deals</div>
            </div>
            <div className="rounded-2xl bg-white/5 px-5 py-4">
              <div className="text-2xl font-semibold">{snapshot.totals.people}</div>
              <div className="mt-1 text-xs uppercase tracking-wider text-white/45">People</div>
            </div>
          </div>
        </header>

        {snapshot.rows.length === 0 ? (
          <div className="py-24 text-center text-2xl text-white/55">No deals yet today.</div>
        ) : (
          <ol className="mt-7 divide-y divide-white/10 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            {snapshot.rows.map((row, index) => (
              <li key={row.full_name + "-" + index} className="grid grid-cols-[4rem_1fr_auto] items-center gap-4 px-5 py-5 sm:grid-cols-[5rem_1fr_auto_auto] sm:px-7">
                <span className="text-2xl font-semibold text-white/35">#{index + 1}</span>
                <span className="truncate text-xl font-medium sm:text-2xl">{row.full_name}</span>
                <span className="hidden text-right text-sm text-white/50 sm:block">{row.sales_count} {row.sales_count === 1 ? "deal" : "deals"}</span>
                <span className="min-w-28 text-right text-xl font-semibold sm:text-2xl">{dollars(row.submitted_ap_cents)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
