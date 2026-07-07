import type { SupabaseClient } from "@supabase/supabase-js";
import { isLeaderboardExcluded } from "@/lib/producer/leaderboardExclusions";

// Gateway issued-premium leaderboards. Two boards share one data shape:
//  - "producer": every active writing producer, ranked by personal IP
//  - "team": active builders only, ranked by team IP
//
// Gateway data is snapshot-shaped, which dictates the aggregation rule:
// WTD/MTD/YTD tabs read the LATEST report only (each row is already the
// running total for its period), while a custom range SUMS the weekly WTD
// buckets between two report dates. Summing MTD/YTD rows would double-count.

export type IpBoard = "producer" | "team";
export type IpPeriod = "wtd" | "mtd" | "ytd" | "custom";

export const IP_BOARDS: readonly IpBoard[] = ["producer", "team"];
export const IP_SNAPSHOT_PERIODS = ["wtd", "mtd", "ytd"] as const;

export type IpLeaderboardRow = {
  person_id: string;
  full_name: string;
  personal_ip_cents: number;
  team_ip_cents: number;
  // Snapshot tabs only; null for custom ranges where legs vary week to week.
  first_leg_producer: string | null;
  first_leg_percent: number | null;
  outside_first_leg_cents: number | null;
};

export type IpLeaderboardResult = {
  board: IpBoard;
  period: IpPeriod;
  reportDate: string | null; // snapshot tabs
  from: string | null; // custom range
  to: string | null;
  rows: IpLeaderboardRow[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type PremiumRow = {
  person_id: string;
  personal_ip_cents: number;
  team_ip_cents: number;
  first_leg_producer: string | null;
  first_leg_percent: string | number | null;
  outside_first_leg_cents: number | null;
};

export async function computeIpLeaderboard(
  supabase: SupabaseClient,
  opts: { board: IpBoard; period: IpPeriod; from?: string | null; to?: string | null },
): Promise<IpLeaderboardResult> {
  const { board, period } = opts;

  const empty: IpLeaderboardResult = {
    board,
    period,
    reportDate: null,
    from: null,
    to: null,
    rows: [],
  };

  const byPerson = new Map<string, IpLeaderboardRow>();
  let reportDate: string | null = null;
  let from: string | null = null;
  let to: string | null = null;

  if (period === "custom") {
    if (!opts.from || !opts.to || !ISO_DATE.test(opts.from) || !ISO_DATE.test(opts.to)) {
      throw new Error("custom range requires from/to dates (YYYY-MM-DD)");
    }
    from = opts.from;
    to = opts.to;

    // Weekly buckets only; see module comment.
    const { data, error } = await supabase
      .from("producer_issued_premium")
      .select("person_id, personal_ip_cents, team_ip_cents")
      .eq("period_type", "wtd")
      .gte("report_date", from)
      .lte("report_date", to);
    if (error) throw new Error(error.message);

    for (const r of (data ?? []) as PremiumRow[]) {
      const agg = byPerson.get(r.person_id) ?? {
        person_id: r.person_id,
        full_name: "",
        personal_ip_cents: 0,
        team_ip_cents: 0,
        first_leg_producer: null,
        first_leg_percent: null,
        outside_first_leg_cents: null,
      };
      agg.personal_ip_cents += r.personal_ip_cents;
      agg.team_ip_cents += r.team_ip_cents;
      byPerson.set(r.person_id, agg);
    }
  } else {
    const { data: latest, error: latestError } = await supabase
      .from("producer_issued_premium")
      .select("report_date")
      .eq("period_type", period)
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw new Error(latestError.message);
    if (!latest) return empty;
    reportDate = latest.report_date as string;

    const { data, error } = await supabase
      .from("producer_issued_premium")
      .select(
        "person_id, personal_ip_cents, team_ip_cents, first_leg_producer, first_leg_percent, outside_first_leg_cents",
      )
      .eq("period_type", period)
      .eq("report_date", reportDate);
    if (error) throw new Error(error.message);

    for (const r of (data ?? []) as PremiumRow[]) {
      byPerson.set(r.person_id, {
        person_id: r.person_id,
        full_name: "",
        personal_ip_cents: r.personal_ip_cents,
        team_ip_cents: r.team_ip_cents,
        first_leg_producer: r.first_leg_producer || null,
        first_leg_percent:
          r.first_leg_percent == null ? null : Number(r.first_leg_percent),
        outside_first_leg_cents: r.outside_first_leg_cents,
      });
    }
  }

  const ids = [...byPerson.keys()].filter((id) => !isLeaderboardExcluded(id));
  if (!ids.length) return { ...empty, reportDate, from, to };

  const { data: people, error: peopleError } = await supabase
    .from("person")
    .select("id, full_name, status, is_producer, is_builder")
    .in("id", ids);
  if (peopleError) throw new Error(peopleError.message);

  const rows: IpLeaderboardRow[] = [];
  for (const p of (people ?? []) as Array<{
    id: string;
    full_name: string | null;
    status: string;
    is_producer: boolean;
    is_builder: boolean;
  }>) {
    if (p.status !== "active") continue;
    // Builders count as writing producers (roles are additive), so the
    // producer board includes them; the team board is builders only.
    if (board === "producer" && !p.is_producer && !p.is_builder) continue;
    if (board === "team" && !p.is_builder) continue;
    const agg = byPerson.get(p.id)!;
    rows.push({ ...agg, full_name: p.full_name ?? "Unknown" });
  }

  const metric = board === "team" ? "team_ip_cents" : "personal_ip_cents";
  rows.sort(
    (a, b) => b[metric] - a[metric] || a.full_name.localeCompare(b.full_name),
  );

  return { board, period, reportDate, from, to, rows };
}
