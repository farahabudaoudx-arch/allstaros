import { describe, it, expect } from "vitest";
import { buildDownlineTree } from "./tree";
import { rollupTree, type RollupPerson } from "./rollup";
import { defaultExpansion, filterTree, collectIds } from "./view";

const person = (
  id: string,
  upline_id: string | null,
  name = id,
): RollupPerson & { upline_id: string | null } => ({
  id,
  upline_id,
  name,
  searchText: `${name} ${id}@ex.com`.toLowerCase(),
  role: "Producer",
  direct: false,
  pending: false,
  ownIpCents: 0,
});

function build(people: (RollupPerson & { upline_id: string | null })[], root = "me") {
  return rollupTree(buildDownlineTree(people, root)!);
}

// Build a tree of N people under 'me' (me + N-1 directs).
function orgOfSize(n: number) {
  const people = [person("me", null)];
  for (let i = 1; i < n; i++) people.push(person(`p${i}`, "me"));
  return build(people);
}

describe("defaultExpansion", () => {
  it("expands all below the threshold", () => {
    expect(defaultExpansion(orgOfSize(99))).toBe("all");
  });
  it("collapses to directs at the threshold", () => {
    expect(defaultExpansion(orgOfSize(100))).toBe("directs");
  });
  it("collapses above the threshold", () => {
    expect(defaultExpansion(orgOfSize(250))).toBe("directs");
  });
});

describe("collectIds", () => {
  it("gathers every node id including the root", () => {
    const root = build([person("me", null), person("a", "me"), person("b", "a")]);
    expect([...collectIds(root)].sort()).toEqual(["a", "b", "me"]);
  });
});

describe("filterTree", () => {
  const people = [
    person("me", null, "Me Boss"),
    person("a", "me", "Alice Green"),
    person("b", "a", "Bob Deep"),
    person("c", "me", "Carol Side"),
  ];

  it("returns the whole tree for a blank query", () => {
    const root = build(people);
    expect(filterTree(root, "   ")).toBe(root);
  });

  it("keeps a deep match plus its ancestor chain, dropping unrelated branches", () => {
    const root = build(people);
    const filtered = filterTree(root, "bob");
    // me → a → b kept; c dropped
    expect(filtered.children.map((n) => n.person.id)).toEqual(["a"]);
    const a = filtered.children[0];
    expect(a.children.map((n) => n.person.id)).toEqual(["b"]);
  });

  it("matches on email text too and unions multiple match chains", () => {
    const root = build(people);
    const filtered = filterTree(root, "c@ex.com");
    expect(filtered.children.map((n) => n.person.id).sort()).toEqual(["c"]);
  });

  it("keeps the root as the trunk even when only a child matches", () => {
    const root = build(people);
    const filtered = filterTree(root, "alice");
    expect(filtered.person.id).toBe("me");
    expect(filtered.children.map((n) => n.person.id)).toEqual(["a"]);
  });
});
