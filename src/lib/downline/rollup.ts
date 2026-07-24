// Slice 2 of the Downline Tree view (see plans/downline-tree-view.md).
//
// Folds per-person IP onto the structural tree from tree.ts: each node gains a
// team-IP rollup (self + every descendant), a descendant headcount, and its
// children sorted by team IP descending (pending / zero-production people sink
// to the bottom). All pure — no data access, no React.

import type { TreeNode } from "./tree";

export type RollupPerson = {
  id: string;
  name: string;
  // Lowercased "name email" used by the tree search (Slice 6).
  searchText: string;
  role: string;
  direct: boolean;
  pending: boolean;
  ownIpCents: number;
};

export type RollupNode = {
  person: RollupPerson;
  ownIpCents: number;
  // Self + every descendant. At a leaf this equals ownIpCents.
  teamIpCents: number;
  // People strictly below this node.
  descendantCount: number;
  isLeaf: boolean;
  children: RollupNode[];
};

// Heaviest legs first. Equal team IP: active before pending, then name A–Z.
function compareSiblings(a: RollupNode, b: RollupNode): number {
  if (a.teamIpCents !== b.teamIpCents) return b.teamIpCents - a.teamIpCents;
  if (a.person.pending !== b.person.pending) return a.person.pending ? 1 : -1;
  return a.person.name.localeCompare(b.person.name);
}

export function rollupTree(node: TreeNode<RollupPerson>): RollupNode {
  const children = node.children.map(rollupTree).sort(compareSiblings);
  const teamIpCents =
    node.person.ownIpCents + children.reduce((s, c) => s + c.teamIpCents, 0);
  const descendantCount = children.reduce(
    (s, c) => s + 1 + c.descendantCount,
    0,
  );
  return {
    person: node.person,
    ownIpCents: node.person.ownIpCents,
    teamIpCents,
    descendantCount,
    isLeaf: children.length === 0,
    children,
  };
}

// Total people in the tree (root included). Drives the default-expansion rule.
export function countNodes(node: RollupNode): number {
  return 1 + node.descendantCount;
}
