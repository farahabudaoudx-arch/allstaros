// Slices 4 & 6 of the Downline Tree view (see plans/downline-tree-view.md).
// Pure helpers for the tree's default expansion and its search filter.

import type { RollupNode } from "./rollup";
import { countNodes } from "./rollup";

export const DEFAULT_COLLAPSE_THRESHOLD = 100;

/**
 * How the tree lands on first render. Fully expanded for small orgs; collapsed
 * to direct reports once the subtree hits the threshold (default 100 people,
 * root included).
 */
export function defaultExpansion(
  root: RollupNode,
  threshold = DEFAULT_COLLAPSE_THRESHOLD,
): "all" | "directs" {
  return countNodes(root) >= threshold ? "directs" : "all";
}

/** Every node id in the tree — used to expand-all. */
export function collectIds(node: RollupNode, into: Set<string> = new Set()): Set<string> {
  into.add(node.person.id);
  for (const c of node.children) collectIds(c, into);
  return into;
}

/**
 * Prune the tree to nodes matching `query` plus the ancestor chain above each
 * match (so you see where a match sits). Matching is case-insensitive substring
 * over each person's `searchText`. The root is always kept as the trunk.
 * Returns the original tree when the query is blank.
 */
export function filterTree(root: RollupNode, query: string): RollupNode {
  const q = query.trim().toLowerCase();
  if (!q) return root;

  const prune = (node: RollupNode): RollupNode | null => {
    const keptChildren = node.children
      .map(prune)
      .filter((c): c is RollupNode => c !== null);
    const selfMatches = node.person.searchText.includes(q);
    if (!selfMatches && keptChildren.length === 0) return null;
    return { ...node, children: keptChildren };
  };

  // Keep the root as the trunk even if it doesn't match, so matches stay anchored.
  const keptChildren = root.children
    .map(prune)
    .filter((c): c is RollupNode => c !== null);
  return { ...root, children: keptChildren };
}
