"use client";

import { useState } from "react";
import { LeaderboardView } from "@/components/producer/LeaderboardView";
import { IpLeaderboardView } from "@/components/producer/leaderboard/IpLeaderboardView";

// The Leaderboard page hosts three boards. Activity ranks logged work from
// the daily tracker and client book; the two IP boards rank Gateway issued
// premium (personal for every writing producer, team totals for builders).
const BOARDS = [
  { key: "activity", label: "Activity" },
  { key: "producer-ip", label: "Producer IP" },
  { key: "team-ip", label: "Team IP" },
] as const;

type BoardKey = (typeof BOARDS)[number]["key"];

export function LeaderboardBoards() {
  const [board, setBoard] = useState<BoardKey>("activity");

  return (
    <section>
      <h1 className="text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
        Leaderboard
      </h1>

      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        {BOARDS.map((b) => {
          const active = board === b.key;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => setBoard(b.key)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                active
                  ? "border-accent/50 bg-accent/[0.08] text-accent"
                  : "border-hairline bg-card text-subtle hover:border-mute hover:text-ink"
              }`}
            >
              {b.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {board === "activity" ? (
          <LeaderboardView />
        ) : (
          <IpLeaderboardView
            key={board}
            board={board === "team-ip" ? "team" : "producer"}
          />
        )}
      </div>
    </section>
  );
}
