// Slice 1 of the Downline Tree view (see plans/downline-tree-view.md).
//
// Turns the flat, RLS-scoped `person` list the page already fetches into a
// nested tree rooted at one person: the current builder for their own view, or
// the top-of-org person (upline_id === null, e.g. Wylie Hawkins) for the owner's
// god-mode view. Pure structure only — IP rollups, ordering, and headcounts
// live in Slice 2 (rollup.ts).

export type TreeNode<T> = {
  person: T;
  children: TreeNode<T>[];
};

type HasParent = { id: string; upline_id: string | null };

/**
 * Build a single tree from a flat list, rooted at `rootId`.
 *
 * Rules:
 * - Returns `null` when no person in `people` has id === rootId.
 * - A person is nested under `upline_id` when that upline is also in the set.
 * - Orphans (upline_id is null, or points to someone outside the set) attach
 *   directly under the root, so nobody in the list is dropped.
 * - Cycles are safe: a person is placed at most once (first reachable path
 *   from the root wins); cycle members unreachable from the root are omitted.
 */
export function buildDownlineTree<T extends HasParent>(
  people: T[],
  rootId: string,
): TreeNode<T> | null {
  const byId = new Map<string, T>();
  for (const p of people) byId.set(p.id, p);

  const root = byId.get(rootId);
  if (!root) return null;

  // parentId -> children persons. Anything that can't resolve to an in-set,
  // non-self parent is re-parented onto the root.
  const childrenByParent = new Map<string, T[]>();
  for (const p of people) {
    if (p.id === rootId) continue;
    const upline = p.upline_id;
    const parentId =
      upline && upline !== p.id && byId.has(upline) ? upline : rootId;
    const bucket = childrenByParent.get(parentId);
    if (bucket) bucket.push(p);
    else childrenByParent.set(parentId, [p]);
  }

  const visited = new Set<string>();
  const build = (person: T): TreeNode<T> => {
    visited.add(person.id);
    const kids = childrenByParent.get(person.id) ?? [];
    const children: TreeNode<T>[] = [];
    for (const kid of kids) {
      if (visited.has(kid.id)) continue; // cycle guard
      children.push(build(kid));
    }
    return { person, children };
  };

  return build(root);
}
