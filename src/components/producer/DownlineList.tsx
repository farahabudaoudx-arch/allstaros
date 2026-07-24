"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SearchInput } from "@/components/producer/SearchInput";

export type DownlineItem = {
  id: string;
  displayName: string;
  searchText: string;
  role: string;
  direct: boolean;
  uplineName: string | null;
  pending: boolean;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

export function DownlineList({ items }: { items: DownlineItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => p.searchText.includes(q));
  }, [items, query]);

  if (items.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-hairline bg-card p-10 text-center text-sm text-mute">
        No producers in your downline yet.
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 flex items-center gap-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search by name or email…"
          className="flex-1"
        />
        <span className="shrink-0 font-mono text-xs text-mute">
          {filtered.length} of {items.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-hairline bg-card p-10 text-center text-sm text-mute">
          No one matches your search.
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link
                href={`/producer/downline/${p.id}`}
                className="flex items-center gap-4 px-5 py-4 transition hover:bg-card-hi/60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card-hi text-[11px] font-semibold text-ink ring-1 ring-hairline">
                  {initials(p.displayName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink">{p.displayName}</div>
                  <div className="truncate text-xs text-mute">
                    {p.role} ·{" "}
                    {p.direct ? "reports to you" : <>under {p.uplineName ?? "—"}</>}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                    p.direct
                      ? "border-accent/40 bg-accent/[0.08] text-accent"
                      : "border-hairline text-mute"
                  }`}
                  title={
                    p.direct
                      ? "A direct producer, reports straight to you"
                      : `Indirect: in your downline, under ${p.uplineName ?? "another producer"}`
                  }
                >
                  {p.direct ? "Direct" : "Indirect"}
                </span>
                <span
                  className={`hidden shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] sm:inline ${
                    p.pending
                      ? "border-warn/40 bg-warn/[0.08] text-warn"
                      : "border-pos/40 bg-pos/[0.08] text-pos"
                  }`}
                >
                  {p.pending ? "Invite Sent" : "Active Profile"}
                </span>
                <span className="shrink-0 text-mute" aria-hidden>
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
