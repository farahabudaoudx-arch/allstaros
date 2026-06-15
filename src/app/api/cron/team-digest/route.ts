// Daily team-digest cron (PRE_LAUNCH_ROADMAP §5 email backlog). Once a day,
// emails each builder a single summary of YESTERDAY for their whole team:
// production, activity, unread team messages, and stalled recruits.
//
// Why this is bespoke: the app's normal team-metrics code (computeLeaderboard,
// getProducerUnread) leans on RLS scoped to the logged-in builder. A cron has no
// session, so we run with the SERVICE ROLE (RLS off → org-wide per-person data)
// and scope each builder's totals to their own downline IN CODE, computed from
// the upline_id tree. One org-wide pass, summed per builder — cheap at our size.
//
// Auth: Vercel sends `Authorization: Bearer <CRON_SECRET>`. For manual testing,
// pass `?key=<CRON_SECRET>`. Modifiers (also require the key/secret):
//   ?only=<email>  → send only to the builder whose email matches (dry run)
//   ?dry=1         → compute + return the summary but DON'T send anything

import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { computeLeaderboard } from "@/lib/producer/metrics";
import { getAppUrl } from "@/lib/site-url";
import { sendEmail } from "@/lib/email";
import { teamDigestEmail, type DigestRecruit } from "@/lib/emails/team-digest";
import { phaseLabel } from "@/lib/pipeline/labels";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TZ = "America/Chicago";

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/** Yesterday's date (YYYY-MM-DD) in Central time. */
function centralYesterday(): string {
  const todayCentral = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const [y, m, d] = todayCentral.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const key = request.nextUrl.searchParams.get("key");
  const authorized = !expected || auth === `Bearer ${expected}` || key === expected;
  if (!authorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const only = request.nextUrl.searchParams.get("only")?.trim().toLowerCase() || null;
  const dry = request.nextUrl.searchParams.get("dry") === "1";

  const admin = createServiceRoleClient();
  const appUrl = getAppUrl();
  const day = centralYesterday();

  // 1) Everyone (for the upline tree + builder roster + recipient emails).
  const { data: people, error: peopleErr } = await admin
    .from("person")
    .select("id, full_name, email, upline_id, is_builder, status");
  if (peopleErr) return NextResponse.json({ error: peopleErr.message }, { status: 500 });
  const persons = (people ?? []) as Array<{
    id: string; full_name: string | null; email: string | null;
    upline_id: string | null; is_builder: boolean; status: string | null;
  }>;

  // 2) Downline (descendant person-ids) for every person, from the upline tree.
  const childrenOf = new Map<string, string[]>();
  for (const p of persons) {
    if (p.upline_id) {
      const arr = childrenOf.get(p.upline_id) ?? [];
      arr.push(p.id);
      childrenOf.set(p.upline_id, arr);
    }
  }
  function downlineOf(rootId: string): Set<string> {
    const out = new Set<string>();
    const stack = [...(childrenOf.get(rootId) ?? [])];
    while (stack.length) {
      const id = stack.pop()!;
      if (out.has(id)) continue;
      out.add(id);
      for (const c of childrenOf.get(id) ?? []) stack.push(c);
    }
    return out;
  }

  // 3) Yesterday's per-person production + activity, org-wide (RLS off).
  const board = await computeLeaderboard(admin, { rangeKey: "custom", tz: TZ, from: day, to: day });
  const statById = new Map(board.rows.map((r) => [r.person_id, r]));

  // 4) Flagged (stalled) recruits org-wide, keyed by person_id.
  const { data: recruitRows } = await admin
    .from("recruit")
    .select("person_id, phase, flagged, flag_reason, person:person_id(full_name)")
    .eq("flagged", true);
  type RecRow = { person_id: string; phase: string | null; flag_reason: string | null; person: { full_name: string | null } | null };
  const stalledByPerson = new Map<string, DigestRecruit>();
  for (const r of (recruitRows ?? []) as unknown as RecRow[]) {
    stalledByPerson.set(r.person_id, {
      name: r.person?.full_name ?? "A recruit",
      detail: r.flag_reason ?? "Flagged",
      phase: r.phase ? phaseLabel(r.phase as Parameters<typeof phaseLabel>[0]) : undefined,
    });
  }

  // 5) Unread team messages: latest builder-channel, non-AI message per recruit
  //    thread + every read receipt, so we can count per builder in code.
  const { data: msgRows } = await admin
    .from("message")
    .select("recruit_id, sender_person_id, created_at")
    .eq("channel", "builder")
    .eq("is_ai", false)
    .order("created_at", { ascending: false });
  const latestMsgByRecruit = new Map<string, { at: string; sender: string | null }>();
  for (const m of (msgRows ?? []) as Array<{ recruit_id: string; sender_person_id: string | null; created_at: string }>) {
    if (!latestMsgByRecruit.has(m.recruit_id)) {
      latestMsgByRecruit.set(m.recruit_id, { at: m.created_at, sender: m.sender_person_id });
    }
  }
  const { data: readRows } = await admin.from("message_read").select("person_id, recruit_id, last_read_at");
  const lastReadByKey = new Map<string, string>();
  for (const r of (readRows ?? []) as Array<{ person_id: string; recruit_id: string; last_read_at: string }>) {
    lastReadByKey.set(`${r.person_id}:${r.recruit_id}`, r.last_read_at);
  }
  // Map recruit_id → person_id so we can test "is this thread in the builder's downline".
  const { data: recruitIdRows } = await admin.from("recruit").select("id, person_id");
  const personByRecruitId = new Map<string, string>();
  for (const r of (recruitIdRows ?? []) as Array<{ id: string; person_id: string }>) {
    personByRecruitId.set(r.id, r.person_id);
  }

  // 6) Build + send one digest per builder with a non-empty downline.
  const builders = persons.filter((p) => p.is_builder && p.status !== "removed" && p.email);
  const results: Array<{ to: string; status: string }> = [];

  for (const b of builders) {
    if (only && b.email!.toLowerCase() !== only) continue;
    const dl = downlineOf(b.id);
    const team = new Set<string>([b.id, ...dl]); // builder counts in their own team totals
    if (dl.size === 0) continue; // solo producer — nothing to digest

    // Production + activity, summed over the team.
    let ap = 0, sales = 0, policies = 0, dials = 0, contacts = 0, presentations = 0;
    for (const pid of team) {
      const s = statById.get(pid);
      if (!s) continue;
      ap += s.ap_cents; sales += s.sales; policies += s.policies;
      dials += s.dials; contacts += s.contacts; presentations += s.presentations;
    }

    // Stalled recruits in the downline.
    const stalled: DigestRecruit[] = [];
    for (const pid of dl) {
      const r = stalledByPerson.get(pid);
      if (r) stalled.push(r);
    }

    // Unread team threads for this builder.
    let unread = 0;
    for (const [recruitId, latest] of latestMsgByRecruit) {
      const threadPerson = personByRecruitId.get(recruitId);
      if (!threadPerson || !dl.has(threadPerson)) continue; // only downline threads
      if (latest.sender === b.id) continue; // messages they sent don't count
      const lastRead = lastReadByKey.get(`${b.id}:${recruitId}`);
      if (!lastRead || latest.at > lastRead) unread += 1;
    }

    const mail = teamDigestEmail({
      builderFirstName: (b.full_name ?? "").trim().split(/\s+/)[0] || undefined,
      periodLabel: "Yesterday",
      production: {
        value: `${money(ap)} AP`,
        caption: `${policies} polic${policies === 1 ? "y" : "ies"} · ${sales} sale${sales === 1 ? "" : "s"}`,
        url: `${appUrl}/producer/team`,
      },
      activity: {
        value: `${dials.toLocaleString("en-US")} dials · ${contacts.toLocaleString("en-US")} contacts`,
        caption: `${presentations} presentation${presentations === 1 ? "" : "s"}`,
        url: `${appUrl}/producer/team`,
      },
      unreadMessages: { count: unread, url: `${appUrl}/producer/messages` },
      stalledRecruits: stalled,
      flaggedBehavior: [], // no separate behavior-flag system yet
      dashboardUrl: `${appUrl}/producer`,
    });

    if (dry) {
      results.push({ to: b.email!, status: `would send (ap=${money(ap)}, stalled=${stalled.length}, unread=${unread})` });
      continue;
    }
    const sent = await sendEmail({ to: b.email!, subject: mail.subject, html: mail.html, text: mail.text });
    results.push({ to: b.email!, status: sent.ok ? `sent (${sent.id})` : `FAILED: ${sent.error}` });
  }

  return NextResponse.json({ day, builders: results.length, dry, results });
}
