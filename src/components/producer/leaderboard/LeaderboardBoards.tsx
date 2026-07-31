"use client";

import { useState } from "react";
import { LeaderboardView } from "@/components/producer/LeaderboardView";
import { IpLeaderboardView } from "@/components/producer/leaderboard/IpLeaderboardView";
import { PageHeader } from "@/components/producer/PageHeader";
import type { LeaderboardMetric } from "@/lib/producer/metrics";

/**
 * The Leaderboard page hosts three boards behind one row of pills: the two IP
 * boards rank Gateway issued premium (personal for every writing producer,
 * team totals for builders), and the rest rank logged activity from the daily
 * tracker and client book. IP leads because it's the number people care about.
 *
 * The pill row is handed down to whichever board is showing, so it sits on the
 * same line as that board's timeframe control instead of floating above it.
 */
type Selection =
  | { kind: "ip"; board: "producer" | "team" }
  | { kind: "activity"; metric: LeaderboardMetric };

const OPTIONS: Array<{ key: string; label: string; selection: Selection }> = [
  { key: "producer-ip", label: "Producer IP", selection: { kind: "ip", board: "producer" } },
  { key: "team-ip", label: "Team IP", selection: { kind: "ip", board: "team" } },
  { key: "ap_cents", label: "Annual Premium", selection: { kind: "activity", metric: "ap_cents" } },
  { key: "sales", label: "Policies Sold", selection: { kind: "activity", metric: "sales" } },
  { key: "dials", label: "Dials", selection: { kind: "activity", metric: "dials" } },
  { key: "contacts", label: "Contacts", selection: { kind: "activity", metric: "contacts" } },
  { key: "presentations", label: "Presentations", selection: { kind: "activity", metric: "presentations" } },
];

export function LeaderboardBoards({ backHref }: { backHref: string }) {
  const [activeKey, setActiveKey] = useState<string>(OPTIONS[0].key);

  const selection = (OPTIONS.find((o) => o.key === activeKey) ?? OPTIONS[0]).selection;

  const selector = (
    <div className="flex flex-wrap items-center gap-1.5">
      {OPTIONS.map((o) => {
        const active = activeKey === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => setActiveKey(o.key)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
              active
                ? "border-accent/50 bg-accent/[0.08] text-accent"
                : "border-hairline bg-card text-subtle hover:border-mute hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <section>
      <PageHeader title="Leaderboard" backHref={backHref} />

      <div className="mt-6">
        {selection.kind === "ip" ? (
          <IpLeaderboardView key={activeKey} board={selection.board} selector={selector} />
        ) : (
          <LeaderboardView metric={selection.metric} selector={selector} />
        )}
      </div>
    </section>
  );
}
