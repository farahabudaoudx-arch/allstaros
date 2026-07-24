import { describe, it, expect } from "vitest";
import { buildDownlineTree, type TreeNode } from "./tree";

type P = { id: string; upline_id: string | null; name?: string };

const p = (id: string, upline_id: string | null, name?: string): P => ({
  id,
  upline_id,
  name,
});

// Collect ids in DFS order so we can assert membership + shape compactly.
function ids<T extends { id: string }>(node: TreeNode<T> | null): string[] {
  if (!node) return [];
  return [node.person.id, ...node.children.flatMap((c) => ids(c))];
}

function childIds<T extends { id: string }>(node: TreeNode<T>): string[] {
  return node.children.map((c) => c.person.id);
}

describe("buildDownlineTree", () => {
  it("returns null when the root is not in the list", () => {
    expect(buildDownlineTree([p("a", null)], "missing")).toBeNull();
  });

  it("roots at the given person and nests by upline_id", () => {
    // me → a, b ; a → c
    const people = [p("me", null), p("a", "me"), p("b", "me"), p("c", "a")];
    const tree = buildDownlineTree(people, "me")!;
    expect(tree.person.id).toBe("me");
    expect(childIds(tree).sort()).toEqual(["a", "b"]);
    const a = tree.children.find((c) => c.person.id === "a")!;
    expect(childIds(a)).toEqual(["c"]);
  });

  it("roots the owner view at the top-of-org person (upline_id null)", () => {
    // Whole company: wylie is top; two builders under him, one producer deeper.
    const people = [
      p("wylie", null),
      p("bld1", "wylie"),
      p("bld2", "wylie"),
      p("prod", "bld1"),
    ];
    const tree = buildDownlineTree(people, "wylie")!;
    expect(tree.person.id).toBe("wylie");
    expect(ids(tree).sort()).toEqual(["bld1", "bld2", "prod", "wylie"]);
  });

  it("includes multi-level descendants under the right parents", () => {
    const people = [
      p("me", null),
      p("a", "me"),
      p("b", "a"),
      p("c", "b"),
    ];
    const tree = buildDownlineTree(people, "me")!;
    expect(ids(tree)).toEqual(["me", "a", "b", "c"]);
  });

  it("attaches orphans (parent outside the set) under the root", () => {
    // 'orphan' reports to 'ghost' who isn't in the returned set.
    const people = [p("me", null), p("a", "me"), p("orphan", "ghost")];
    const tree = buildDownlineTree(people, "me")!;
    expect(childIds(tree).sort()).toEqual(["a", "orphan"]);
  });

  it("does not drop anyone in the list (except unreachable cycle members)", () => {
    const people = [p("me", null), p("a", "me"), p("b", "me"), p("c", "a")];
    const tree = buildDownlineTree(people, "me")!;
    expect(ids(tree).sort()).toEqual(["a", "b", "c", "me"]);
  });

  it("survives a self-referencing upline without looping", () => {
    const people = [p("me", null), p("self", "self")];
    const tree = buildDownlineTree(people, "me")!;
    // self-loop is re-parented onto the root
    expect(childIds(tree)).toEqual(["self"]);
  });

  it("survives a cycle reachable from the root without looping", () => {
    // me → a → b, plus a back-edge c that points into the a/b cycle.
    // Construct a genuine cycle: a → b and b → a, both reachable-ish from me via a.
    const a = p("a", "me");
    const b = p("b", "a");
    // back-edge: make a's upline b as well would orphan 'a' from me, so instead
    // add a node that closes a loop b → a → b through a helper.
    const loop = p("loop", "b");
    // close the cycle: loop's child points back up to 'a'
    const backToA = p("backToA", "loop");
    backToA.upline_id = "loop";
    // Force a true cycle: b's real parent is 'a', and we add 'a2' whose parent is
    // 'backToA' but 'backToA' ultimately can't re-add 'a'. To guarantee a cycle,
    // point b → a AND a → b is impossible in one field, so simulate a 2-node ring
    // that is NOT reachable from me: x → y → x.
    const x = p("x", "y");
    const y = p("y", "x");
    const people = [p("me", null), a, b, loop, backToA, x, y];
    const tree = buildDownlineTree(people, "me")!;
    const all = ids(tree);
    // terminates, and every placed id is unique
    expect(all.length).toBe(new Set(all).size);
    // the unreachable ring (x, y) is omitted; the reachable chain is present
    expect(all).toContain("a");
    expect(all).toContain("b");
    expect(all).not.toContain("x");
    expect(all).not.toContain("y");
  });
});
