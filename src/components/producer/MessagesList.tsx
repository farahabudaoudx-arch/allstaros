"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SearchInput } from "@/components/producer/SearchInput";

export type MessageListItem = {
  recruitId: string;
  name: string;
  searchText: string;
  flagged: boolean;
  removed: boolean;
  unread: boolean;
  lastBody: string | null;
  lastAt: string | null;
  checkIn: string | null;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

export function MessagesList({ items }: { items: MessageListItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) => r.searchText.includes(q));
  }, [items, query]);

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
          {filtered.map((row) => (
            <li key={row.recruitId}>
              <Link
                href={`/producer/messages/${row.recruitId}`}
                className={`flex items-center gap-4 px-4 py-4 transition hover:bg-card-hi ${
                  row.removed ? "opacity-40" : ""
                }`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card-hi text-xs font-semibold text-ink ring-1 ring-hairline">
                  {initials(row.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={`truncate ${
                          row.unread ? "font-semibold text-ink" : "font-medium text-ink"
                        }`}
                      >
                        {row.name}
                      </span>
                      {row.flagged ? (
                        <svg
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5 shrink-0 text-warn"
                          fill="currentColor"
                          aria-label="Flagged"
                        >
                          <path d="M5 3a1 1 0 0 1 1-1h12.5a.5.5 0 0 1 .4.8L16 7l2.9 4.2a.5.5 0 0 1-.4.8H7v9a1 1 0 1 1-2 0V3Z" />
                        </svg>
                      ) : null}
                    </span>
                    {row.lastAt ? (
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-mute">
                        {new Date(row.lastAt).toLocaleDateString()}
                      </span>
                    ) : null}
                  </div>
                  <p
                    className={`mt-0.5 truncate text-sm ${
                      row.unread ? "font-medium text-ink" : "text-subtle"
                    }`}
                  >
                    {row.lastBody ?? "No messages yet. Say hello."}
                  </p>
                </div>
                {row.checkIn ? (
                  <span className="hidden shrink-0 rounded-full border border-hairline px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-mute sm:inline">
                    Checked in {row.checkIn}
                  </span>
                ) : null}
                {row.unread ? (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent"
                    aria-label="Unread"
                  />
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
