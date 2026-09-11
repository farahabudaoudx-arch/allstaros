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

export type SubmittedApLeaderboardScope =
  | { kind: "team"; ownerPersonId: string }
  | { kind: "organization" };

export async function computeSubmittedApScopedLeaderboards(
  admin: SupabaseClient,
  opts: {
    scope: SubmittedApLeaderboardScope;
    periods: DiscordPeriod[];
    tz?: string;
    /** Preserve the historical Discord query that excludes null sale_status rows. */
    strictSaleStatus?: boolean;
  },
): Promise<Map<DiscordPeriod, SubmittedApLeaderboard>> {
  const tz = opts.tz ?? DISCORD_LEADERBOARD_TZ;
  const periods = Array.from(new Set(opts.periods));
  const result = new Map<DiscordPeriod, SubmittedApLeaderboard>();
  if (!periods.length) return result;

  const ranges = new Map<DiscordPeriod, { from: string; to: string }>();
  for (const period of periods) {
    ranges.set(period, resolveRange(PERIOD_TO_RANGE_KEY[period], tz));
  }

  const persons: PersonRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const peopleRes = await admin
      .from("person")
      .select("id, full_name, upline_id, status")
      .order("id")
      .range(offset, offset + 999);
    if (peopleRes.error) throw new Error(peopleRes.error.message);
    const page = (peopleRes.data ?? []) as PersonRow[];
    persons.push(...page);
    if (page.length < 1000) break;
  }

  const childrenOf = new Map<string, string[]>();
  for (const p of persons) {
    if (!p.upline_id) continue;
    const arr = childrenOf.get(p.upline_id) ?? [];
    arr.push(p.id);
    childrenOf.set(p.upline_id, arr);
  }

  function downlineOf(rootId: string): Set<string> {
    const out = new Set<string>();
    const stack = [...(childrenOf.get(rootId) ?? [])];
    while (stack.length) {
      const id = stack.pop()!;
      if (out.has(id)) continue;
      out.add(id);
      for (const childId of childrenOf.get(id) ?? []) stack.push(childId);
    }
    return out;
  }

  const statusById = new Map(persons.map((p) => [p.id, p.status]));
  const nameById = new Map(persons.map((p) => [p.id, p.full_name ?? "Unknown"]));
  const candidateIds =
    opts.scope.kind === "organization"
      ? persons.map((p) => p.id)
      : [opts.scope.ownerPersonId, ...downlineOf(opts.scope.ownerPersonId)];

  const eligibleIds = new Set<string>();
  for (const id of candidateIds) {
    // Live excludes inactive people for both Team and Organization boards.
    // The normal Leaderboard's service-role SQL does not apply this roster
    // filter itself, so Live enforces the product visibility rule here.
    if (statusById.get(id) !== "active") continue;
    if (isLeaderboardExcluded(id)) continue;
    eligibleIds.add(id);
  }

  if (!eligibleIds.size) {
    for (const period of periods) {
      const range = ranges.get(period)!;
      result.set(period, { from: range.from, to: range.to, rows: [] });
    }
    return result;
  }

  const widestFrom = Array.from(ranges.values())
    .map((r) => r.from)
    .sort()[0];
  const ids = Array.from(eligibleIds);
  const sales: SaleRow[] = [];
  for (const part of chunk(ids, 100)) {
    for (let offset = 0; ; offset += 1000) {
      let query = admin
        .from("clients")
        .select("person_id, annual_premium, sale_status, submit_date, date, created_at")
        .in("person_id", part);
      query = opts.strictSaleStatus
        ? query.eq("sale_status", "sale")
        : query.or("sale_status.eq.sale,sale_status.is.null");
      const res = await query
        .or(`submit_date.gte.${widestFrom},submit_date.is.null`)
        .order("id")
        .range(offset, offset + 999);
      if (res.error) throw new Error(res.error.message);
      const page = (res.data ?? []) as SaleRow[];
      sales.push(...page);
      if (page.length < 1000) break;
    }
  }

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
      for (const baseline of (res.data ?? []) as BaselineRow[]) {
        baselineByPerson.set(baseline.person_id, baseline);
      }
    }
  }

  for (const period of periods) {
    const range = ranges.get(period)!;
    const aggregate = new Map<string, { cents: number; count: number }>();
    const bump = (personId: string): { cents: number; count: number } => {
      let current = aggregate.get(personId);
      if (!current) {
        current = { cents: 0, count: 0 };
        aggregate.set(personId, current);
      }
      return current;
    };

    if (period === "ytd") {
      for (const [personId, baseline] of baselineByPerson) {
        if (!eligibleIds.has(personId)) continue;
        const current = bump(personId);
        current.cents += Number(baseline.submitted_ap_cents ?? 0);
        current.count += Number(baseline.sales_count ?? 0);
      }
    }

    for (const sale of sales) {
      if (!isSale(sale)) continue;
      const day = saleDay(sale, tz);
      if (!day || day < range.from || day > range.to) continue;
      if (period === "ytd") {
        const through = baselineByPerson.get(sale.person_id)?.baseline_through_date;
        if (through && day <= through) continue;
      }
      const current = bump(sale.person_id);
      current.cents += dollarsToCents(sale.annual_premium);
      current.count += 1;
    }

    const rows: SubmittedApLeaderboardRow[] = [];
    for (const [personId, aggregateRow] of aggregate) {
      if (aggregateRow.cents === 0 && aggregateRow.count === 0) continue;
      rows.push({
        person_id: personId,
        full_name: nameById.get(personId) ?? "Unknown",
        submitted_ap_cents: aggregateRow.cents,
        sales_count: aggregateRow.count,
      });
    }
    rows.sort(
      (left, right) =>
        right.submitted_ap_cents - left.submitted_ap_cents ||
        right.sales_count - left.sales_count ||
        left.full_name.localeCompare(right.full_name),
    );

    result.set(period, { from: range.from, to: range.to, rows });
  }

  return result;
}

export async function computeSubmittedApTeamLeaderboards(
  admin: SupabaseClient,
  opts: { ownerPersonId: string; periods: DiscordPeriod[]; tz?: string },
): Promise<Map<DiscordPeriod, SubmittedApLeaderboard>> {
  return computeSubmittedApScopedLeaderboards(admin, {
    scope: { kind: "team", ownerPersonId: opts.ownerPersonId },
    periods: opts.periods,
    tz: opts.tz,
    strictSaleStatus: true,
  });
}
