import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/db/types";
import { AddPerson } from "@/components/producer/AddPerson";
import { type DownlineItem } from "@/components/producer/DownlineList";
import { DownlineViews } from "@/components/producer/DownlineViews";
import { type TreePerson } from "@/components/producer/DownlineTree";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEV_LOGIN_ENABLED } from "@/lib/devLogin";

const PERSON_SELECT =
  "id, full_name, email, is_builder, is_producer, upline_id, auth_user_id";

// Per-person issued premium (sum of annual_premium for policies whose issue_date
// falls in [from..to]) — computed directly and PAGINATED so we never hit the
// 1000-row PostgREST cap that silently truncated the leaderboard helper. Returns
// dollars-as-cents keyed by person_id.
async function ipByPerson(
  client: SupabaseClient,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("clients")
      .select("person_id, annual_premium, issue_date")
      .gte("issue_date", from)
      .lte("issue_date", to)
      .range(offset, offset + pageSize - 1);
    if (error || !data || data.length === 0) break;
    for (const c of data as Array<{ person_id: string; annual_premium: number | null }>) {
      const cents = Math.round(Number(c.annual_premium ?? 0) * 100);
      map.set(c.person_id, (map.get(c.person_id) ?? 0) + cents);
    }
    if (data.length < pageSize) break;
  }
  return map;
}

// Year-to-date window: Jan 1 of the current year through today (UTC).
function ytdWindow(): { from: string; to: string } {
  const now = new Date();
  return { from: `${now.getUTCFullYear()}-01-01`, to: now.toISOString().slice(0, 10) };
}

export const dynamic = "force-dynamic";

type Row = Pick<
  Person,
  "id" | "full_name" | "email" | "is_builder" | "is_producer" | "upline_id" | "auth_user_id"
>;

function roleLabel(p: Row): string {
  if (p.is_builder) return "Builder";
  if (p.is_producer) return "Producer";
  return "Recruit";
}

export default async function DownlinePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; preview?: string }>;
}) {
  const me = await getCurrentPerson();
  if (!me) redirect("/auth/signin?next=/producer/downline");
  if (!me.is_builder) redirect("/producer");
  const flash = await searchParams;

  const meRow: Row = {
    id: me.id,
    full_name: me.full_name,
    email: me.email,
    is_builder: me.is_builder,
    is_producer: me.is_producer,
    upline_id: me.upline_id,
    auth_user_id: me.auth_user_id,
  };

  // DEV-ONLY (hard-gated by DEV_LOGIN_ENABLED, never reachable in production):
  // ?preview=<name> renders that real person's whole org chart, read with the
  // service role. Lets us demo a populated tree without impersonating a user.
  const previewName =
    DEV_LOGIN_ENABLED && flash.preview ? flash.preview.trim() : "";

  // viewer = who the tree is rooted at; all = viewer + their subtree; ipById =
  // each person's YTD issued premium.
  let viewer: Row = meRow;
  let all: Row[] = [];
  const ipById = new Map<string, number>();

  if (previewName) {
    const service = createServiceRoleClient();
    const { data: rootData } = await service
      .from("person")
      .select(PERSON_SELECT)
      .eq("status", "active")
      .ilike("full_name", `%${previewName}%`)
      .limit(1)
      .maybeSingle();
    const root = rootData as Row | null;
    if (root) {
      const { data: everyone } = await service
        .from("person")
        .select(PERSON_SELECT)
        .eq("status", "active")
        .or("is_producer.eq.true,is_builder.eq.true");
      const pool = (everyone ?? []) as Row[];
      const childrenByParent = new Map<string, Row[]>();
      for (const p of pool) {
        if (!p.upline_id) continue;
        const bucket = childrenByParent.get(p.upline_id);
        if (bucket) bucket.push(p);
        else childrenByParent.set(p.upline_id, [p]);
      }
      const subtree: Row[] = [];
      const seen = new Set<string>([root.id]);
      const queue = [root.id];
      while (queue.length) {
        const id = queue.shift()!;
        for (const child of childrenByParent.get(id) ?? []) {
          if (seen.has(child.id)) continue;
          seen.add(child.id);
          subtree.push(child);
          queue.push(child.id);
        }
      }
      viewer = root;
      all = [root, ...subtree];
      try {
        const { from, to } = ytdWindow();
        const ip = await ipByPerson(service, from, to);
        for (const [pid, cents] of ip) ipById.set(pid, cents);
      } catch {
        // leave ipById empty → zeros
      }
    }
  } else {
    // RLS (can_view) returns the FULL recursive downline plus yourself. We keep
    // only ACTIVE PRODUCERS (and builders, who are producers too) — recruits
    // live in the Recruiting Pipeline. A producer recruited by one of your
    // builders is layers down but still in your downline, so they belong here.
    const supabase = await createClient();
    const { data } = await supabase
      .from("person")
      .select(PERSON_SELECT)
      .eq("status", "active")
      .or("is_producer.eq.true,is_builder.eq.true")
      .order("full_name", { ascending: true });
    all = (data ?? []) as Row[];
    try {
      const { from, to } = ytdWindow();
      const ip = await ipByPerson(supabase, from, to);
      for (const [pid, cents] of ip) ipById.set(pid, cents);
    } catch {
      // leave ipById empty → zeros
    }
  }

  // Map every id → name so we can show who each person reports to.
  const nameById = new Map<string, string>([[viewer.id, viewer.full_name]]);
  for (const p of all) nameById.set(p.id, p.full_name);

  // Direct reports first, then everyone deeper, each alphabetical.
  const people = all
    .filter((p) => p.id !== viewer.id)
    .sort((a, b) => {
      const ad = a.upline_id === viewer.id ? 0 : 1;
      const bd = b.upline_id === viewer.id ? 0 : 1;
      return ad - bd || a.full_name.localeCompare(b.full_name);
    });

  const directCount = people.filter((p) => p.upline_id === viewer.id).length;

  const items: DownlineItem[] = people.map((p) => {
    const pending = !p.auth_user_id;
    return {
      id: p.id,
      displayName: pending ? p.email : p.full_name,
      searchText: `${p.full_name} ${p.email}`.toLowerCase(),
      role: roleLabel(p),
      direct: p.upline_id === viewer.id,
      uplineName: p.upline_id ? nameById.get(p.upline_id) ?? null : null,
      pending,
    };
  });

  // Tree view data: the same scoped set PLUS the viewer as the tree's root.
  const treePeople: TreePerson[] = [viewer, ...people].map((p) => {
    const pending = !p.auth_user_id;
    return {
      id: p.id,
      upline_id: p.upline_id,
      name: p.full_name,
      displayName: pending ? p.email : p.full_name,
      searchText: `${p.full_name} ${p.email}`.toLowerCase(),
      role: roleLabel(p),
      direct: p.upline_id === viewer.id,
      pending,
      ownIpCents: ipById.get(p.id) ?? 0,
    };
  });

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">My Team</p>
      <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">My Downline</h1>
      <p className="mt-3 max-w-2xl text-sm text-subtle">
        Every active producer in your downline — your direct producers and everyone producing
        beneath them, at any level. Recruits live in the Recruiting Pipeline.{" "}
        {people.length} total · {directCount} direct.
      </p>

      {previewName && viewer.id !== me.id ? null : <AddPerson />}

      {flash.ok === "removed" ? (
        <div className="mt-4 rounded-xl border border-pos/40 bg-pos/[0.08] px-4 py-3 text-sm text-pos">
          Removed.
        </div>
      ) : null}

      <DownlineViews items={items} treePeople={treePeople} rootId={viewer.id} />
    </main>
  );
}
