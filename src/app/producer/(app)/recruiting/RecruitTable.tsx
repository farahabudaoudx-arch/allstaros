"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type RecruitListItem = {
  id: string;
  name: string;
  email: string;
  stageLabel: string;
  signedUpAt: string;
  flagged: boolean;
};

type Sort = "recent" | "name";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function RecruitTable({ items }: { items: RecruitListItem[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter(
          (r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
        )
      : items;
    const sorted = [...filtered].sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : b.signedUpAt.localeCompare(a.signedUpAt),
    );
    return sorted;
  }, [items, query, sort]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3-3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-full border border-hairline bg-card py-2 pl-9 pr-3 text-sm text-ink outline-none transition placeholder:text-mute focus:border-mute"
          />
        </div>

        <div className="flex items-center gap-1 rounded-full border border-hairline bg-card p-1">
          <button
            type="button"
            onClick={() => setSort("recent")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              sort === "recent" ? "bg-accent text-black" : "text-subtle hover:text-ink"
            }`}
          >
            Newest
          </button>
          <button
            type="button"
            onClick={() => setSort("name")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              sort === "name" ? "bg-accent text-black" : "text-subtle hover:text-ink"
            }`}
          >
            Name
          </button>
        </div>

        <span className="text-xs text-mute">
          {rows.length} {rows.length === 1 ? "recruit" : "recruits"}
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-hairline text-left text-[10px] uppercase tracking-[0.16em] text-mute">
            <tr>
              <th className="px-5 py-3 font-normal">Recruit</th>
              <th className="hidden px-5 py-3 font-normal sm:table-cell">Stage</th>
              <th className="hidden px-5 py-3 font-normal md:table-cell">Signed up</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-5 py-12 text-center text-subtle">
                  No recruits match.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="transition hover:bg-card-hi/60">
                  <td className="px-5 py-3">
                    <Link href={`/producer/recruiting/recruit/${r.id}`} className="block">
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-ink">{r.name}</span>
                        {r.flagged ? <span className="size-1.5 rounded-full bg-warn" /> : null}
                      </span>
                      <span className="text-xs text-mute">{r.email}</span>
                    </Link>
                  </td>
                  <td className="hidden px-5 py-3 text-subtle sm:table-cell">{r.stageLabel}</td>
                  <td className="hidden px-5 py-3 text-subtle md:table-cell">
                    {fmtDate(r.signedUpAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
