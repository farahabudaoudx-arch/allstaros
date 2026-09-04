import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeAnalytics,
  dollarsToCents,
  fetchAllRows,
  isSale,
  resolveRange,
  saleDay,
  type ClientSaleFields,
} from "@/lib/producer/metrics";
import { isLeaderboardExcluded } from "@/lib/producer/leaderboardExclusions";

/**
 * The year-to-date lines on the producer/builder home screen.
 *
 * The home screen used to be a grid of tiles. The sidebar took over navigation,
 * so the first thing you see on login is your own scoreboard instead: five
 * sentences, year to date, and nothing to click.
 *
 * Everything here reuses the same helpers the page it describes reads from, so
 * a number on this screen can never disagree with the page you click through
 * to. Two different sources, deliberately:
 *
 *   - ISSUED premium (IP) comes from the Gateway feed, the same
 *     `producer_issued_premium` rows behind /producer/issued-premium. Gateway
 *     is the carrier-side record of what actually issued; the in-app clients
 *     book is what producers typed in, and the two are far apart (Jackson
 *     Rapaport: $235k on Gateway vs $29k in clients). Gateway wins for IP.
 *   - Everything else (dials, presentations, deals, SUBMITTED AP) has no
 *     Gateway equivalent, so it comes from the tracker and clients tables via
 *     the same helpers Analytics and Team Performance use.
 *
 * Team figures run through the AUTHED client, so RLS scopes them to the
 * viewer's own downline exactly like /api/producer/team does.
 */

/** The org's operating timezone. The window is year-to-date, so this only
 *  matters within a few hours of New Year's. */
const TZ = "America/Chicago";

/** PostgREST .in() lists go on the query string; ~100 UUIDs stays under typical
 *  URL limits. Larger downlines (scale seed / big builders) must be chunked or
 *  the request returns HTTP 400 Bad Request. */
const IN_FILTER_CHUNK = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type ProducerNumbers = {
  dials: number;
  presentations: number;
  sales: number;
  apCents: number;
  ipCents: number | null;
  /** Gateway's team IP for this person, null whenever Gateway is unavailable. */
  teamIpCents: number | null;
};

/**
 * This person's newest Gateway year-to-date row: what the carriers say issued,
 * personally and across their team. Null when they've never appeared in a
 * report (no NPN match, or no production yet).
 */
async function gatewayYtd(
  supabase: SupabaseClient,
  personId: string,
): Promise<{ personalCents: number; teamCents: number } | null> {
  const { data } = await supabase
    .from("producer_issued_premium")
    .select("personal_ip_cents, team_ip_cents")
    .eq("person_id", personId)
    .eq("period_type", "ytd")
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as { personal_ip_cents: number; team_ip_cents: number };
  return { personalCents: row.personal_ip_cents, teamCents: row.team_ip_cents };
}

/** How many weekly Gateway reports back a "writer" counts. Someone who wrote
 *  in any of the last six weeks is still an active writer; someone who hasn't
 *  written in six weeks isn't, however long they've been licensed. */
const WRITER_WEEKS = 6;

/** Weeks far enough back to be sure of catching six weekly reports, even with
 *  a skipped upload or two. */
const WRITER_LOOKBACK_DAYS = 120;

/**
 * Writers on a builder's team: people in `teamIds` who personally issued
 * business in at least one of the last six weekly Gateway reports. The builder
 * themself is never counted — the line reads "on your team".
 *
 * Deliberately not a headcount of the downline. Someone licensed but not
 * writing isn't a writer, and Gateway's own weekly figure is what the org
 * reads its production off.
 */
async function activeWriters(
  supabase: SupabaseClient,
  personId: string,
  teamIds: Set<string>,
): Promise<number> {
  const ids = [...teamIds].filter((id) => id !== personId);
  if (!ids.length) return 0;

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - WRITER_LOOKBACK_DAYS);
  const sinceDay = since.toISOString().slice(0, 10);

  // Both reads go out together and are intersected here. Asking for the week
  // list first and the rows second would be two round trips to a remote
  // database for no reason.
  //
  // The row read is scoped to the team by id: with the service role there's no
  // RLS to clip it, and scanning every producer in the org is what made this
  // screen crawl. Chunk .in() so large downlines don't blow the URL limit.
  const [weeks, ...rowChunks] = await Promise.all([
    // The six weeks are the org's six most recent uploads, NOT the six most
    // recent this team happens to appear in. A small team that skipped a
    // couple of reports would otherwise reach further back and count stale
    // production as current.
    recentReportDates(supabase),
    ...chunk(ids, IN_FILTER_CHUNK).map((part) =>
      fetchAllRows<{ person_id: string; report_date: string }>((lo, hi) =>
        supabase
          .from("producer_issued_premium")
          .select("person_id, report_date")
          .eq("period_type", "wtd")
          .in("person_id", part)
          .gte("report_date", sinceDay)
          .gt("personal_ip_cents", 0)
          .order("id")
          .range(lo, hi),
      ),
    ),
  ]);

  const inWindow = new Set(weeks);
  const writers = new Set<string>();
  for (const r of rowChunks.flat()) {
    if (inWindow.has(r.report_date)) writers.add(r.person_id);
  }
  return writers.size;
}

/**
 * The last `WRITER_WEEKS` weekly report dates, org-wide. PostgREST has no
 * DISTINCT, so this walks pages of the date column newest-first and stops as
 * soon as it has enough — usually one page.
 */
async function recentReportDates(supabase: SupabaseClient): Promise<string[]> {
  const pageSize = 1000;
  const seen = new Set<string>();
  for (let page = 0; page < 5; page++) {
    const { data } = await supabase
      .from("producer_issued_premium")
      .select("report_date")
      .eq("period_type", "wtd")
      .order("report_date", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    const rows = (data ?? []) as Array<{ report_date: string }>;
    for (const r of rows) seen.add(r.report_date);
    if (seen.size >= WRITER_WEEKS || rows.length < pageSize) break;
  }
  return [...seen].sort().slice(-WRITER_WEEKS);
}

/** A builder's five lines. Deliberately NOT an extension of ProducerNumbers:
 *  the builder screen never shows dials, presentations, deals or personal AP,
 *  so it must not pay for computing them. */
export type BuilderNumbers = {
  ipCents: number | null;
  recruitsInPipeline: number;
  writers: number | null;
  teamApCents: number;
  teamIpCents: number | null;
};

/**
 * Submitted AP across a team, year to date. Same rule the leaderboard applies
 * (a row counts on its submit date, falling back to its record date, then its
 * creation day) but scoped to these people only.
 *
 * computeLeaderboard would answer this too, and used to — but it ranks every
 * producer in the org and computes seven other metrics to get there, which is
 * indefensible when the screen wants one sum for one team.
 */
async function teamSubmittedApCents(
  supabase: SupabaseClient,
  teamIds: Set<string>,
): Promise<number> {
  const ids = [...teamIds];
  if (!ids.length) return 0;
  const { from, to } = resolveRange("ytd", TZ);

  const rowChunks = await Promise.all(
    chunk(ids, IN_FILTER_CHUNK).map((part) =>
      fetchAllRows<ClientSaleFields>((lo, hi) =>
        supabase
          .from("clients")
          .select("annual_premium, sale_status, submit_date, date, created_at")
          .in("person_id", part)
          .order("id")
          .range(lo, hi),
      ),
    ),
  );

  let cents = 0;
  for (const c of rowChunks.flat()) {
    if (!isSale(c)) continue;
    const day = saleDay(c, TZ);
    if (!day || day < from || day > to) continue;
    cents += dollarsToCents(c.annual_premium);
  }
  return cents;
}

export async function producerYtd(
  supabase: SupabaseClient,
  personId: string,
  gatewayConnected: boolean,
): Promise<ProducerNumbers> {
  const [{ totals }, gateway] = await Promise.all([
    computeAnalytics(supabase, personId, { rangeKey: "ytd", tz: TZ }),
    gatewayConnected ? gatewayYtd(supabase, personId) : Promise.resolve(null),
  ]);
  return {
    dials: totals.dials,
    presentations: totals.presentations,
    sales: totals.sales,
    apCents: totals.ap_cents,
    // Ticket #005: never substitute the in-app client book for Gateway. If the
    // personal Gateway session is unavailable, issued values are unknown.
    ipCents: gatewayConnected ? (gateway?.personalCents ?? null) : null,
    teamIpCents: gatewayConnected ? (gateway?.teamCents ?? null) : null,
  };
}

export type Downline = {
  /** Everyone at or below the root, any role or status — the exact set the
   *  can_view() policy returns. Recruits live here and nowhere else. */
  all: Set<string>;
  /** The subset that counts as team: active producers/builders, minus the
   *  internal/test rows the boards hide. */
  roster: Set<string>;
};

/**
 * Everyone at or below `rootId`, walked over person.upline_id (the live org
 * chart — recruit.builder_id is a stale inviter stamp).
 *
 * Only needed when the caller can't lean on RLS to scope things for them, i.e.
 * the dev "view as someone else" preview, which reads with the service role.
 * The normal path passes nothing and lets RLS do the clipping.
 *
 * The walk itself is deliberately UNFILTERED, matching can_view(): filtering
 * to producers mid-walk would stop at a recruit and silently drop any producer
 * sitting beneath one. Role and status are applied after the walk instead.
 */
export async function downlineIds(
  service: SupabaseClient,
  rootId: string,
): Promise<Downline> {
  type Row = {
    id: string;
    upline_id: string | null;
    status: string | null;
    is_producer: boolean | null;
    is_builder: boolean | null;
  };
  const { data } = await service
    .from("person")
    .select("id, upline_id, status, is_producer, is_builder");
  const people = (data ?? []) as Row[];

  const childrenByParent = new Map<string, string[]>();
  for (const p of people) {
    if (!p.upline_id) continue;
    const bucket = childrenByParent.get(p.upline_id);
    if (bucket) bucket.push(p.id);
    else childrenByParent.set(p.upline_id, [p.id]);
  }

  const all = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    for (const child of childrenByParent.get(queue.shift()!) ?? []) {
      if (all.has(child)) continue;
      all.add(child);
      queue.push(child);
    }
  }

  const roster = new Set(
    people
      .filter(
        (p) =>
          all.has(p.id) &&
          p.status === "active" &&
          (p.is_producer || p.is_builder) &&
          !isLeaderboardExcluded(p.id),
      )
      .map((p) => p.id),
  );

  return { all, roster };
}

export async function builderYtd(
  supabase: SupabaseClient,
  personId: string,
  /** Pre-resolved downline, for callers reading past RLS (see downlineIds). */
  explicit: Downline | undefined,
  gatewayConnected: boolean,
): Promise<BuilderNumbers> {
  const [gateway, rosterRes, pipeline] = await Promise.all([
    gatewayConnected ? gatewayYtd(supabase, personId) : Promise.resolve(null),
    // Licensed people the viewer can see. RLS already clips this to their
    // downline; the exclusion list drops internal/test rows so the count
    // matches the leaderboards.
    explicit
      ? null
      : supabase
          .from("person")
          .select("id")
          .eq("status", "active")
          .or("is_producer.eq.true,is_builder.eq.true"),
    // Recruits still working through licensing ? the same set the Recruiting
    // Pipeline page counts. That page leans on can_view(), which asks whether
    // the recruit's own person row is anywhere in the downline, so the explicit
    // path has to ask the same question of the same unfiltered set.
    explicit
      ? supabase.from("recruit").select("person_id").is("removed_at", null)
      : supabase
          .from("recruit")
          .select("id", { count: "exact", head: true })
          .is("removed_at", null),
  ]);

  const teamIds =
    explicit?.roster ??
    new Set(
      (rosterRes?.data ?? [])
        .map((p) => p.id as string)
        .filter((id) => !isLeaderboardExcluded(id)),
    );

  const recruitsInPipeline = explicit
    ? ((pipeline.data ?? []) as Array<{ person_id: string }>).filter((r) =>
        explicit.all.has(r.person_id),
      ).length
    : (pipeline.count ?? 0);

  const [writers, teamApCents] = await Promise.all([
    gatewayConnected
      ? activeWriters(supabase, personId, teamIds)
      : Promise.resolve<number | null>(null),
    // Submitted AP has no Gateway equivalent ? Gateway only reports what
    // issued ? so it stays a sum over the team's own submissions.
    teamSubmittedApCents(supabase, teamIds),
  ]);

  return {
    ipCents: gatewayConnected ? (gateway?.personalCents ?? null) : null,
    writers,
    recruitsInPipeline,
    teamApCents,
    teamIpCents: gatewayConnected ? (gateway?.teamCents ?? null) : null,
  };
}
