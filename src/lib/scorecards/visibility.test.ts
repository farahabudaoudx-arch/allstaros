import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type FixturePerson = {
  id: string;
  uplineId: string | null;
  isProducer: boolean;
  isBuilder: boolean;
};

type CardType = "producer" | "builder";

const people: FixturePerson[] = [
  { id: "producerOnly", uplineId: null, isProducer: true, isBuilder: false },
  { id: "builder", uplineId: null, isProducer: false, isBuilder: true },
  { id: "directDownlineMember", uplineId: "builder", isProducer: true, isBuilder: false },
  { id: "deeperDownlineMember", uplineId: "directDownlineMember", isProducer: true, isBuilder: true },
  { id: "peerOutsideTree", uplineId: null, isProducer: true, isBuilder: true },
  { id: "unrelatedOutsider", uplineId: "peerOutsideTree", isProducer: true, isBuilder: false },
  { id: "dualRole", uplineId: null, isProducer: true, isBuilder: true },
  { id: "dualDirect", uplineId: "dualRole", isProducer: true, isBuilder: false },
];

function visibleScope(viewerId: string): Set<string> {
  const viewer = people.find((person) => person.id === viewerId);
  if (!viewer) return new Set();
  const result = new Set<string>();
  if (viewer.isProducer || viewer.isBuilder) result.add(`${viewer.id}:producer`);
  if (viewer.isBuilder) result.add(`${viewer.id}:builder`);
  if (!viewer.isBuilder) return result;

  const queue = [viewer.id];
  const seen = new Set(queue);
  while (queue.length) {
    const parentId = queue.shift()!;
    for (const person of people) {
      if (person.uplineId !== parentId || seen.has(person.id)) continue;
      seen.add(person.id);
      queue.push(person.id);
      result.add(`${person.id}:producer`);
      result.add(`${person.id}:builder`);
    }
  }
  return result;
}

function canSee(viewerId: string, personId: string, cardType: CardType): boolean {
  return visibleScope(viewerId).has(`${personId}:${cardType}`);
}

const snapshotFixtures = [
  { id: "00000000-0000-0000-0000-000000000001", personId: "producerOnly", cardType: "producer" as const, secret: "producer-own-frozen" },
  { id: "00000000-0000-0000-0000-000000000002", personId: "producerOnly", cardType: "builder" as const, secret: "producer-own-builder-frozen" },
  { id: "00000000-0000-0000-0000-000000000003", personId: "directDownlineMember", cardType: "producer" as const, secret: "direct-frozen" },
  { id: "00000000-0000-0000-0000-000000000004", personId: "deeperDownlineMember", cardType: "builder" as const, secret: "deep-frozen" },
  { id: "00000000-0000-0000-0000-000000000005", personId: "peerOutsideTree", cardType: "producer" as const, secret: "peer-frozen" },
  { id: "00000000-0000-0000-0000-000000000006", personId: "unrelatedOutsider", cardType: "builder" as const, secret: "outsider-frozen" },
  { id: "00000000-0000-0000-0000-000000000007", personId: "dualRole", cardType: "producer" as const, secret: "dual-producer-frozen" },
  { id: "00000000-0000-0000-0000-000000000008", personId: "dualRole", cardType: "builder" as const, secret: "dual-builder-frozen" },
];

function authorizedSnapshotById(viewerId: string, id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const snapshot = snapshotFixtures.find((candidate) => candidate.id === id);
  if (!snapshot || !canSee(viewerId, snapshot.personId, snapshot.cardType)) return null;
  return snapshot;
}

function repoFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Scorecard visibility contract", () => {
  it("restricts a Producer-only viewer to their own Producer card", () => {
    expect(canSee("producerOnly", "producerOnly", "producer")).toBe(true);
    expect(canSee("producerOnly", "producerOnly", "builder")).toBe(false);
    expect(canSee("producerOnly", "directDownlineMember", "producer")).toBe(false);
    expect(canSee("producerOnly", "peerOutsideTree", "producer")).toBe(false);
    expect(canSee("producerOnly", "unrelatedOutsider", "builder")).toBe(false);
  });

  it("gives a Builder both own card types and the full recursive downline, but not another branch", () => {
    expect(canSee("builder", "builder", "producer")).toBe(true);
    expect(canSee("builder", "builder", "builder")).toBe(true);
    expect(canSee("builder", "directDownlineMember", "producer")).toBe(true);
    expect(canSee("builder", "directDownlineMember", "builder")).toBe(true);
    expect(canSee("builder", "deeperDownlineMember", "producer")).toBe(true);
    expect(canSee("builder", "deeperDownlineMember", "builder")).toBe(true);
    expect(canSee("builder", "peerOutsideTree", "producer")).toBe(false);
    expect(canSee("builder", "unrelatedOutsider", "builder")).toBe(false);
  });

  it("keeps dual-role own Producer and Builder cards distinct while retaining recursive downline access", () => {
    const scope = visibleScope("dualRole");
    expect(scope.has("dualRole:producer")).toBe(true);
    expect(scope.has("dualRole:builder")).toBe(true);
    expect(scope.has("dualDirect:producer")).toBe(true);
    expect(scope.has("dualDirect:builder")).toBe(true);
    expect(scope.has("peerOutsideTree:producer")).toBe(false);
  });
});

describe("direct snapshot ID authorization", () => {
  it("never returns frozen contents for Producer-only guesses outside their allowed card", () => {
    expect(authorizedSnapshotById("producerOnly", "00000000-0000-0000-0000-000000000001")?.secret)
      .toBe("producer-own-frozen");
    expect(authorizedSnapshotById("producerOnly", "00000000-0000-0000-0000-000000000002")).toBeNull();
    expect(authorizedSnapshotById("producerOnly", "00000000-0000-0000-0000-000000000003")).toBeNull();
    expect(authorizedSnapshotById("producerOnly", "00000000-0000-0000-0000-000000000005")).toBeNull();
  });

  it("allows recursive Builder IDs but fails closed for outside-tree IDs", () => {
    expect(authorizedSnapshotById("builder", "00000000-0000-0000-0000-000000000003")?.secret)
      .toBe("direct-frozen");
    expect(authorizedSnapshotById("builder", "00000000-0000-0000-0000-000000000004")?.secret)
      .toBe("deep-frozen");
    expect(authorizedSnapshotById("builder", "00000000-0000-0000-0000-000000000005")).toBeNull();
    expect(authorizedSnapshotById("builder", "00000000-0000-0000-0000-000000000006")).toBeNull();
  });

  it("keeps dual-role own Producer and Builder snapshot IDs independently accessible", () => {
    expect(authorizedSnapshotById("dualRole", "00000000-0000-0000-0000-000000000007")?.secret)
      .toBe("dual-producer-frozen");
    expect(authorizedSnapshotById("dualRole", "00000000-0000-0000-0000-000000000008")?.secret)
      .toBe("dual-builder-frozen");
  });

  it("fails closed for malformed and valid-but-nonexistent snapshot IDs", () => {
    expect(authorizedSnapshotById("builder", "not-a-uuid")).toBeNull();
    expect(authorizedSnapshotById("builder", "00000000-0000-0000-0000-000000000099")).toBeNull();
  });
});

describe("Scorecard visibility SQL boundary", () => {
  const sql = repoFile("supabase/migrations/20260829000200_scorecard_visibility.sql");

  it("uses the canonical recursive upline hierarchy with a Builder-only downline expansion", () => {
    expect(sql).toContain("with recursive viewer as");
    expect(sql).toContain("join downline parent on child.upline_id = parent.id");
    expect(sql).toContain("where v.is_producer or v.is_builder");
    expect(sql).toContain("select v.id, 'builder'::text");
    expect(sql).toContain("where v.is_builder");
    expect(sql).toContain("join downline d on d.id <> v.id");
  });

  it("does not inherit generic admin/owner org-wide visibility", () => {
    expect(sql).not.toContain("is_admin()");
    expect(sql).not.toContain("visible_person_ids()");
    expect(sql).not.toContain("is_owner");
    expect(sql).not.toContain("is_super_admin");
  });

  it("replaces own-only snapshot RLS with authenticated set-based person/card scope", () => {
    expect(sql).toContain("drop policy if exists scorecard_snapshot_read_own on scorecard_snapshot");
    expect(sql).toContain("create policy scorecard_snapshot_read_visible on scorecard_snapshot");
    expect(sql).toContain("for select to authenticated");
    expect(sql).toContain("lifecycle_status in ('final', 'corrected')");
    expect(sql).toContain("(person_id, card_type) in (");
    expect(sql).toContain("from scorecard_visible_scope() scope");
    expect(sql).toContain("grant select on scorecard_snapshot to authenticated");
    expect(sql).toContain("revoke all on function scorecard_visible_scope() from public, anon");
  });
});

describe("member-facing Scorecard server queries", () => {
  const listPage = repoFile("src/app/producer/(app)/scorecards/page.tsx");
  const detailPage = repoFile("src/app/producer/(app)/scorecards/[id]/page.tsx");

  it("uses authenticated RLS reads and never service-role Scorecard reads", () => {
    expect(listPage).toContain('import { createClient } from "@/lib/supabase/server"');
    expect(detailPage).toContain('import { createClient } from "@/lib/supabase/server"');
    expect(listPage).not.toContain("createServiceRoleClient");
    expect(detailPage).not.toContain("createServiceRoleClient");
    expect(listPage).not.toContain('.eq("person_id", person.id)');
    expect(detailPage).not.toContain('.eq("person_id", person.id)');
  });

  it("keeps same-period same-card downline snapshots distinct in the archive", () => {
    expect(listPage).toContain("`${row.person_id}:${row.card_type}:${row.period_kind}:${row.period_start}`");
    expect(listPage).toContain("memberName: published.member.fullName");
  });

  it("fails closed for malformed, unauthorized, and nonexistent detail IDs before frozen data renders", () => {
    expect(detailPage).toContain("if (!isUuid(id)) notFound()");
    expect(detailPage).toContain('.eq("id", id)');
    expect(detailPage).toContain("if (!data) notFound()");
    expect(detailPage.indexOf("if (!data) notFound()")).toBeLessThan(
      detailPage.indexOf("const published = requirePublishedScorecardSnapshotPayload"),
    );
    expect(detailPage).not.toContain("error.message");
  });
});
