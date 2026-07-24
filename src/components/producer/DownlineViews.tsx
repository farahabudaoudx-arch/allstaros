"use client";

import { useEffect, useState } from "react";
import { DownlineList, type DownlineItem } from "@/components/producer/DownlineList";
import { DownlineTree, type TreePerson } from "@/components/producer/DownlineTree";

type View = "list" | "tree";
const STORE_KEY = "downline.view";

export function DownlineViews({
  items,
  treePeople,
  rootId,
}: {
  items: DownlineItem[];
  treePeople: TreePerson[];
  rootId: string;
}) {
  const [view, setView] = useState<View>("list");

  // Restore the last-used view after mount (avoids an SSR hydration mismatch).
  useEffect(() => {
    const stored = window.localStorage.getItem(STORE_KEY);
    if (stored === "tree" || stored === "list") setView(stored);
  }, []);

  const choose = (next: View) => {
    setView(next);
    window.localStorage.setItem(STORE_KEY, next);
  };

  return (
    <div className="mt-6">
      <div className="inline-flex rounded-xl border border-hairline bg-card p-1">
        {(["list", "tree"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => choose(v)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
              view === v
                ? "bg-card-hi text-ink ring-1 ring-hairline"
                : "text-mute hover:text-ink"
            }`}
          >
            {v === "list" ? "List" : "Tree"}
          </button>
        ))}
      </div>

      {view === "list" ? (
        <DownlineList items={items} />
      ) : (
        <DownlineTree people={treePeople} rootId={rootId} />
      )}
    </div>
  );
}
