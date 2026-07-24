import { describe, it, expect } from "vitest";
import { buildDownlineTree } from "./tree";
import { rollupTree, countNodes, type RollupPerson } from "./rollup";

const person = (
  id: string,
  upline_id: string | null,
  ownIpCents: number,
  opts: Partial<RollupPerson> = {},
): RollupPerson & { upline_id: string | null } => ({
  id,
  upline_id,
  name: opts.name ?? id,
  searchText: (opts.name ?? id).toLowerCase(),
  role: opts.role ?? "Producer",
  direct: opts.direct ?? false,
  pending: opts.pending ?? false,
  ownIpCents,
});

function build(people: (RollupPerson & { upline_id: string | null })[], root: string) {
  const tree = buildDownlineTree(people, root)!;
  return rollupTree(tree);
}

describe("rollupTree", () => {
  it("rolls team IP up as self + all descendants", () => {
    // me(100) → a(50) → b(25) ; me → c(10)
    const people = [
      person("me", null, 100),
      person("a", "me", 50),
      person("b", "a", 25),
      person("c", "me", 10),
    ];
    const root = build(people, "me");
    expect(root.teamIpCents).toBe(185); // 100+50+25+10
    const a = root.children.find((n) => n.person.id === "a")!;
    expect(a.teamIpCents).toBe(75); // 50+25
    const b = a.children[0];
    expect(b.teamIpCents).toBe(25); // leaf: own only
  });

  it("marks leaves and makes leaf teamIp equal ownIp", () => {
    const people = [person("me", null, 40)];
    const root = build(people, "me");
    expect(root.isLeaf).toBe(true);
    expect(root.teamIpCents).toBe(root.ownIpCents);
  });

  it("counts descendants (people strictly below a node)", () => {
    const people = [
      person("me", null, 0),
      person("a", "me", 0),
      person("b", "a", 0),
      person("c", "me", 0),
    ];
    const root = build(people, "me");
    expect(root.descendantCount).toBe(3);
    const a = root.children.find((n) => n.person.id === "a")!;
    expect(a.descendantCount).toBe(1);
  });

  it("orders siblings by team IP descending", () => {
    const people = [
      person("me", null, 0),
      person("small", "me", 10),
      person("big", "me", 900),
      person("mid", "me", 100),
    ];
    const root = build(people, "me");
    expect(root.children.map((n) => n.person.id)).toEqual(["big", "mid", "small"]);
  });

  it("ranks by rolled-up team IP, not personal IP", () => {
    // 'weakParent' produces little personally but sits on a heavy leg.
    const people = [
      person("me", null, 0),
      person("strongSolo", "me", 500),
      person("weakParent", "me", 5),
      person("heavyChild", "weakParent", 1000),
    ];
    const root = build(people, "me");
    // weakParent's leg = 1005 > strongSolo 500
    expect(root.children.map((n) => n.person.id)).toEqual(["weakParent", "strongSolo"]);
  });

  it("sinks pending people below equal-IP active people", () => {
    const people = [
      person("me", null, 0),
      person("pendingZero", "me", 0, { pending: true, name: "aaa" }),
      person("activeZero", "me", 0, { pending: false, name: "zzz" }),
    ];
    const root = build(people, "me");
    // equal (0) team IP → active before pending, despite name order
    expect(root.children.map((n) => n.person.id)).toEqual(["activeZero", "pendingZero"]);
  });

  it("counts total nodes including the root", () => {
    const people = [
      person("me", null, 0),
      person("a", "me", 0),
      person("b", "me", 0),
    ];
    expect(countNodes(build(people, "me"))).toBe(3);
  });
});
