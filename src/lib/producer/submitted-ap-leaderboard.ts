import type { SupabaseClient } from "@supabase/supabase-js";
import { zonedParts } from "@/lib/producer/time";
import {
  dollarsToCents,
  isSale,
  resolveRange,
  saleDay,
  type ClientSaleFields,
  type RangeKey,
} from "@/lib/producer/metrics";
import { isLeaderboardExcluded } from "@/lib/producer/leaderboardExclusions";

// Team-scoped, submitted-AP-only leaderboards for Discord. Counts
// clients.annual_premium (dollars, converted to cents) where sale_status =
// 'sale' for one owner plus their full downline. Never issued premium,
// deposits, or IP. Manual YTD baselines (pre-app Discord totals, stored in
// cents) are added on top of app sales dated strictly after the baseline's
// through date, and apply ONLY to the ytd period.

export const DISCORD_LEADERBOARD_TZ = "America/Chicago";

export type DiscordPeriod = "daily" | "wtd" | "mtd" | "ytd";

export type SubmittedApLeaderboardRow = {
  person_id: string;
  full_name: string;
  submitted_ap_cents: number;
  sales_count: number;
};

export type SubmittedApLeaderboard = {
  from: string;
  to: string;
  rows: SubmittedApLeaderboardRow[];
};

const PERIOD_TO_RANGE_KEY: Record<DiscordPeriod, RangeKey> = {
  daily: "today",
  wtd: "wtd",
  mtd: "mtd",
  ytd: "ytd",
};

type PersonRow = {
  id: string;
  full_name: string | null;
  upline_id: string | null;
  status: string | null;
};

type BaselineRow = {
  person_id: string;
  submitted_ap_cents: number | null;
  sales_count: number | null;
  baseline_through_date: string | null;
};

type SaleRow = ClientSaleFields & { person_id: string };

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function computeSubmittedApTeamLeaderboards(
  admin: SupabaseClient,
  opts: { ownerPersonId: string; periods: DiscordPeriod[]; tz?: string },
): Promise<Map<DiscordPeriod, SubmittedApLeaderboard>> {
  const tz = opts.tz ?? DISCORD_LEADERBOARD_TZ;
  const periods = Array.from(new Set(opts.periods));
  const result = new Map<DiscordPeriod, SubmittedApLeaderboard>();
  if (!periods.length) return result;

  const ranges = new Map<DiscordPeriod, { from: string; to: string }>();
  for (const period of periods) {
    ranges.set(period, resolveRange(PERIOD_TO_RANGE_KEY[period], tz));
  }

  // Upline tree from every person row (same pattern as the team-digest cron).
  const peopleRes = await admin.from("person").select("id, full_name, upline_id, status");
  if (peopleRes.error) throw new Error(peopleRes.error.message);
  const persons = (peopleRes.data ?? []) as PersonRow[];

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

  const statusById = new Map(persons.map((p) => [p.id, p.status]));
  const nameById = new Map(persons.map((p) => [p.id, p.full_name ?? "Unknown"]));

  // The team is the owner plus their full downline, active people only, minus
  // the internal/test/owner rows that never appear on any board.
  const teamIds = new Set<string>();
  for (const id of [opts.ownerPersonId, ...downlineOf(opts.ownerPersonId)]) {
    if (statusById.get(id) !== "active") continue;
    if (isLeaderboardExcluded(id)) continue;
    teamIds.add(id);
  }
  if (!teamIds.size) {
    for (const period of periods) {
      const range = ranges.get(period)!;
      result.set(period, { from: range.from, to: range.to, rows: [] });
    }
    return result;
  }

  // One clients fetch covering the widest requested range, chunked so .in()
  // stays sane on big teams. Rows with a null submit_date stay in the fetch
  // because saleDay falls back to date / created_at; the per-period bucketing
  // below applies the exact day bounds in JS.
  const widestFrom = Array.from(ranges.values())
    .map((r) => r.from)
    .sort()[0];
  const ids = Array.from(teamIds);
  const sales: SaleRow[] = [];
  for (const part of chunk(ids, 100)) {
    const res = await admin
      .from("clients")
      .select("person_id, annual_premium, sale_status, submit_date, date, created_at")
      .in("person_id", part)
      .eq("sale_status", "sale")
      .or(`submit_date.gte.${widestFrom},submit_date.is.null`);
    if (res.error) throw new Error(res.error.message);
    sales.push(...((res.data ?? []) as SaleRow[]));
  }

  // Manual YTD baselines for the current Chicago year (cents already).
  const baselineByPerson = new Map<string, BaselineRow>();
  if (periods.includes("ytd")) {
    const year = zonedParts(new Date(), tz).y;
    for (const part of chunk(ids, 100)) {
      const res = await admin
        .from("leaderboard_ap_baselines")
        .select("person_id, submitted_ap_cents, sales_count, baseline_through_date")
        .eq("year", year)
        .in("person_id", part);
      if (res.error) throw new Error(res.error.message);
      for (const b of (res.data ?? []) as BaselineRow[]) baselineByPerson.set(b.person_id, b);
    }
  }

  for (const period of periods) {
    const range = ranges.get(period)!;
    const agg = new Map<string, { cents: number; count: number }>();
    const bump = (pid: string): { cents: number; count: number } => {
      let a = agg.get(pid);
      if (!a) {
        a = { cents: 0, count: 0 };
        agg.set(pid, a);
      }
      return a;
    };

    // Seed baselines first (ytd only) so baseline-only producers still rank.
    if (period === "ytd") {
      for (const [pid, b] of baselineByPerson) {
        if (!teamIds.has(pid)) continue;
        const a = bump(pid);
        a.cents += Number(b.submitted_ap_cents ?? 0);
        a.count += Number(b.sales_count ?? 0);
      }
    }

    for (const c of sales) {
      if (!isSale(c)) continue;
      const day = saleDay(c, tz);
      if (!day || day < range.from || day > range.to) continue;
      if (period === "ytd") {
        const through = baselineByPerson.get(c.person_id)?.baseline_through_date;
        // Strictly after the through date, so baselined sales never double count.
        if (through && day <= through) continue;
      }
      const a = bump(c.person_id);
      a.cents += dollarsToCents(c.annual_premium);
      a.count += 1;
    }

    const rows: SubmittedApLeaderboardRow[] = [];
    for (const [pid, a] of agg) {
      if (a.cents === 0 && a.count === 0) continue;
      rows.push({
        person_id: pid,
        full_name: nameById.get(pid) ?? "Unknown",
        submitted_ap_cents: a.cents,
        sales_count: a.count,
      });
    }
    rows.sort(
      (x, y) =>
        y.submitted_ap_cents - x.submitted_ap_cents ||
        y.sales_count - x.sales_count ||
        x.full_name.localeCompare(y.full_name),
    );

    result.set(period, { from: range.from, to: range.to, rows });
  }

  return result;
}
