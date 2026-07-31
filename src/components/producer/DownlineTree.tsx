"use client";

import { useMemo, useState, useRef } from "react";
import Link from "next/link";
import { SearchInput } from "@/components/producer/SearchInput";
import { buildDownlineTree } from "@/lib/downline/tree";
import { rollupTree, type RollupNode, type RollupPerson } from "@/lib/downline/rollup";
import { filterTree, collectIds } from "@/lib/downline/view";

// One flat person as handed down from the server (same scoped set as the list,
// plus the viewer as the root, plus each person's own MTD issued premium).
export type TreePerson = RollupPerson & {
  upline_id: string | null;
  displayName: string;
};

// Compact money that rolls into millions ($1.05M) instead of "$1045k".
function fmtIp(cents: number): string {
  const d = (cents ?? 0) / 100;
  if (d >= 1_000_000) return `$${(d / 1_000_000).toFixed(d >= 10_000_000 ? 1 : 2)}M`;
  if (d >= 1_000) return `$${(d / 1_000).toFixed(d >= 100_000 ? 0 : 1)}k`;
  return `$${Math.round(d)}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

export function DownlineTree({
  people,
  rootId,
}: {
  people: TreePerson[];
  rootId: string;
}) {
  const [query, setQuery] = useState("");

  const root = useMemo<RollupNode | null>(() => {
    const tree = buildDownlineTree(people, rootId);
    return tree ? rollupTree(tree) : null;
  }, [people, rootId]);

  // Open to the root + its direct legs; expand a leg on demand.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (!root) return new Set();
    return new Set([root.person.id]);
  });

  const filtered = useMemo(() => (root ? filterTree(root, query) : null), [root, query]);

  // While searching, force the pruned tree fully open so matches are visible.
  const searching = query.trim().length > 0;
  const effectiveExpanded = useMemo(() => {
    if (!filtered) return expanded;
    return searching ? collectIds(filtered) : expanded;
  }, [filtered, searching, expanded]);

  // Optional zoom for very large trees.
  const contentRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const zoomBy = (delta: number) =>
    setZoom((z) => Math.max(0.4, Math.min(1.4, Math.round((z + delta) * 100) / 100)));
  const resetZoom = () => setZoom(1);

  if (!root || !filtered) return null;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandAll = () => setExpanded(collectIds(root));
  const collapseAll = () => setExpanded(new Set([root.person.id]));

  const totalPeople = root.descendantCount; // people below you

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search by name or email…"
          className="flex-1 min-w-[12rem]"
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={expandAll}
            className="rounded-lg border border-hairline px-2.5 py-1.5 text-xs text-subtle transition hover:bg-card-hi/60"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="rounded-lg border border-hairline px-2.5 py-1.5 text-xs text-subtle transition hover:bg-card-hi/60"
          >
            Collapse all
          </button>
        </div>
      </div>

      {totalPeople === 0 ? (
        <div className="mt-4 rounded-2xl border border-hairline bg-card p-10 text-center text-sm text-mute">
          No one in your downline yet.
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => zoomBy(-0.1)}
              aria-label="Zoom out"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-hairline text-subtle transition hover:bg-card-hi/60"
            >
              −
            </button>
            <button
              type="button"
              onClick={resetZoom}
              className="w-11 text-center text-xs text-mute transition hover:text-ink"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => zoomBy(0.1)}
              aria-label="Zoom in"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-hairline text-subtle transition hover:bg-card-hi/60"
            >
              +
            </button>
          </div>

          <div className="mt-2 max-h-[74vh] overflow-auto rounded-2xl border border-hairline bg-card p-6">
            <div ref={contentRef} className="dl-ltr" style={{ zoom }}>
              <Branch
                node={filtered}
                expandedIds={effectiveExpanded}
                onToggle={toggle}
              />
            </div>
          </div>
        </>
      )}

      <TreeStyles />
    </>
  );
}

function Branch({
  node,
  expandedIds,
  onToggle,
}: {
  node: RollupNode;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const isOpen = expandedIds.has(node.person.id);
  const hasChildren = node.children.length > 0;

  return (
    <div className="ltr-node">
      <NodeCard node={node} isOpen={isOpen} hasChildren={hasChildren} onToggle={onToggle} />
      {hasChildren && isOpen ? (
        <div className="ltr-kids">
          {node.children.map((child) => (
            <div className="ltr-branch" key={child.person.id}>
              <Branch node={child} expandedIds={expandedIds} onToggle={onToggle} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NodeCard({
  node,
  isOpen,
  hasChildren,
  onToggle,
}: {
  node: RollupNode;
  isOpen: boolean;
  hasChildren: boolean;
  onToggle: (id: string) => void;
}) {
  const p = node.person as TreePerson;
  const name = p.displayName ?? p.name;
  const showTeam = !node.isLeaf;

  return (
    <div className="flex shrink-0 items-center">
      <Link
        href={`/producer/downline/${p.id}`}
        className="flex w-72 items-center gap-3 rounded-xl border border-hairline bg-card-hi/40 px-3 py-2.5 transition hover:border-accent/50 hover:bg-card-hi/70"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card-hi text-[11px] font-semibold text-ink ring-1 ring-hairline">
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">{name}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-mute">
            <span className="truncate">{p.role}</span>
            {p.pending ? (
              <span className="shrink-0 uppercase tracking-wide text-warn">
                · invite sent
              </span>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {showTeam ? (
            <>
              <div className="text-sm text-ink">
                {fmtIp(node.teamIpCents)}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-mute">
                team
              </div>
            </>
          ) : (
            <div className="text-sm text-ink">
              {fmtIp(node.ownIpCents)}
            </div>
          )}
        </div>
      </Link>

      {/* Expand/collapse — separate hit-target, never navigates */}
      {hasChildren ? (
        <button
          type="button"
          onClick={() => onToggle(p.id)}
          aria-label={isOpen ? "Collapse" : "Expand"}
          aria-expanded={isOpen}
          title={isOpen ? "Collapse" : `Expand — ${node.descendantCount} below`}
          className="ml-1 flex h-7 items-center gap-1 rounded-full border border-hairline bg-card px-2 text-[10px] text-mute transition hover:text-ink"
        >
          <span className={`transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden>
            ▸
          </span>
          {!isOpen ? node.descendantCount : ""}
        </button>
      ) : null}
    </div>
  );
}

// Left-to-right tree connectors: pure CSS, no graph library. Each node's card
// sits on the left; its children stack vertically to the right, joined by an
// elbow line and a shared vertical spine.
function TreeStyles() {
  return (
    <style>{`
      /* --cc = vertical distance from a branch's top to its CARD's center.
         Connectors anchor here (not to 50% of the branch) so lines stay glued
         to the cards no matter how tall an expanded subtree grows. */
      .dl-ltr { display: inline-block; --cc: 37px; }
      .dl-ltr .ltr-node { display: flex; align-items: flex-start; }
      .dl-ltr .ltr-kids { display: flex; flex-direction: column; }
      .dl-ltr .ltr-branch {
        position: relative;
        padding-left: 44px;
        padding-top: 8px;
        padding-bottom: 8px;
      }
      /* elbow: horizontal line from the spine into each child's card */
      .dl-ltr .ltr-branch::before {
        content: "";
        position: absolute;
        left: 0;
        top: var(--cc);
        width: 44px;
        height: 2px;
        background: var(--color-hairline);
      }
      /* spine: vertical line joining siblings, trimmed to the first/last card
         centers so it never overshoots into an expanded subtree. */
      .dl-ltr .ltr-branch::after {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 2px;
        background: var(--color-hairline);
      }
      .dl-ltr .ltr-branch:first-child::after { top: var(--cc); bottom: 0; }
      .dl-ltr .ltr-branch:last-child::after { top: 0; height: var(--cc); bottom: auto; }
      .dl-ltr .ltr-branch:only-child::after { display: none; }
    `}</style>
  );
}
