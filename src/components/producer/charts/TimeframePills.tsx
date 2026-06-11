"use client";

import { useState } from "react";
import type { RangeKey } from "@/lib/producer/metrics";
import { localIsoDate } from "@/lib/producer/time";

const PRESETS: Array<{ key: RangeKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "wtd", label: "WTD" },
  { key: "mtd", label: "MTD" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All" },
];

export type Timeframe = { key: RangeKey; from?: string; to?: string };

export function TimeframePills({
  value,
  onChange,
}: {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState(value.from ?? "");
  const [to, setTo] = useState(value.to ?? "");
  const today = localIsoDate();
  // Custom counts as "active" the moment its picker is open, so the yellow pill
  // moves over right away — same as clicking a preset.
  const customActive = customOpen || value.key === "custom";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex items-center gap-1 rounded-full border border-hairline bg-card p-1">
        {PRESETS.map((p) => {
          const active = !customActive && value.key === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                setCustomOpen(false);
                onChange({ key: p.key });
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
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
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
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
            min="2000-01-01"
            max={to || today}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-transparent text-xs text-ink outline-none [color-scheme:dark]"
          />
          <span className="text-mute">–</span>
          <input
            type="date"
            value={to}
            min={from || "2000-01-01"}
            max={today}
            onChange={(e) => setTo(e.target.value)}
            className="bg-transparent text-xs text-ink outline-none [color-scheme:dark]"
          />
          <button
            type="button"
            disabled={!from || !to}
            onClick={() => {
              onChange({ key: "custom", from, to });
              setCustomOpen(false);
            }}
            className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-black disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
