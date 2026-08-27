import type { SupabaseClient } from "@supabase/supabase-js";
import { ProducerQueryError } from "@/lib/producer/query-error";
import { zonedParts, zonedIsoDay } from "@/lib/producer/time";
import { isLeaderboardExcluded } from "@/lib/producer/leaderboardExclusions";

// Closed-loop producer metrics, sourced from the data producers actually enter:
//
//   - tracker_entry      → daily activity counts (dials, leads, contacts,
//                          appointments, presentations, sales). "Leads" is now a
//                          punched-in daily field, not a derived lead-row count.
//   - clients            → the book of business. Each closed client (sale_status
//                          = 'sale') is one sale; annual_premium is the AP. A
//                          client with an issue_date is an issued policy (IP).
//   - client_deposits    → money in (status = 'successful', actual_amount).
//   - lead_purchases     → real lead spend (amount, dated by purchase_date).
//
// The old frozen funnel (sales_lead / sale / issued_policy / deposit /
// contact_attempt) is no longer read; those tables were never written by the
// app. There is no per-call contact heatmap anymore (no per-call data exists).

export type RangeKey = "today" | "wtd" | "mtd" | "ytd" | "all" | "custom";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export const AGE_BANDS: Array<{ band: string; min: number; max: number }> = [
  { band: "50–59", min: 50, max: 59 },
  { band: "60–64", min: 60, max: 64 },
  { band: "65–69", min: 65, max: 69 },
  { band: "70–74", min: 70, max: 74 },
  { band: "75–80", min: 75, max: 80 },
];

// ---------------------------------------------------------------------------
// Money / date helpers for the clients + deposits + lead_purchases tables.
// ---------------------------------------------------------------------------

// clients store premiums as plain numeric dollars (annual_premium) or as
// free-form quote strings ("$50", "50/mo"). Normalize either to integer cents.
export function dollarsToCents(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// Date-typed columns ('YYYY-MM-DD'); the calendar day IS the value.
function dayOfDateCol(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.slice(0, 10);
  return ISO_DATE.test(s) ? s : null;
}

// timestamptz columns; convert to the viewer's local calendar day.
function dayOfTs(v: string | null | undefined, tz: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return zonedIsoDay(d, tz);
}

// The subset of a client row needed to date and value a sale. Exported for
// the Discord submitted-AP leaderboard helper.
export type ClientSaleFields = {
  annual_premium: number | null;
  sale_status: string | null;
  submit_date: string | null;
  date: string | null;
  created_at: string | null;
};

// The day a client counts as a sale: when the policy was written, falling back
// to the record date, then the row's creation day.
export function saleDay(c: ClientSaleFields, tz: string): string | null {
  return dayOfDateCol(c.submit_date) ?? dayOfDateCol(c.date) ?? dayOfTs(c.created_at, tz);
}
export function isSale(c: ClientSaleFields): boolean {
  return (c.sale_status ?? "sale") === "sale";
}

export function resolveRange(
  key: RangeKey,
  tz: string,
  fromParam?: string | null,
  toParam?: string | null,
  earliestAll?: string | null,
): { from: string; to: string } {
  const now = new Date();
  const today = zonedIsoDay(now, tz);

  if (key === "today") return { from: today, to: today };
  if (key === "wtd") {
    const p = zonedParts(now, tz);
    const back = p.dow === 0 ? 6 : p.dow - 1;
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - back);
    return { from: zonedIsoDay(d, tz), to: today };
  }
  if (key === "mtd") {
    const p = zonedParts(now, tz);
    return { from: `${p.y}-${pad2(p.m)}-01`, to: today };
  }
  if (key === "ytd") {
    const p = zonedParts(now, tz);
    return { from: `${p.y}-01-01`, to: today };
  }
  if (key === "all") {
    return { from: earliestAll && ISO_DATE.test(earliestAll) ? earliestAll : today, to: today };
  }
  if (key === "custom" && fromParam && toParam && ISO_DATE.test(fromParam) && ISO_DATE.test(toParam)) {
    return { from: fromParam, to: toParam };
  }
  return { from: today, to: today };
}

function expandDates(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    out.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// Earliest activity day for the producer; lower bound for the ALL range.
async function findEarliestActivityDate(
  supabase: SupabaseClient,
  personId: string,
): Promise<string | null> {
  const [tracker, clients, spendByDate, spendByCreated] = await Promise.all([
    supabase.from("tracker_entry").select("entry_date").eq("person_id", personId).order("entry_date", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("clients").select("created_at").eq("person_id", personId).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    // Lead spend often predates the first tracked dial/client. If the "All"
    // range didn't reach back to it, the spend was silently excluded from Cost
    // Analysis / ROI; the bug where logged spend "never showed up". Consider
    // both the entered purchase_date and the row's created_at (for undated rows).
    supabase.from("lead_purchases").select("purchase_date").eq("person_id", personId).not("purchase_date", "is", null).order("purchase_date", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("lead_purchases").select("created_at").eq("person_id", personId).order("created_at", { ascending: true }).limit(1).maybeSingle(),
  ]);
  const candidates: string[] = [];
  if (tracker.data?.entry_date) candidates.push((tracker.data.entry_date as string).slice(0, 10));
  if (clients.data?.created_at) candidates.push((clients.data.created_at as string).slice(0, 10));
  const spendDay = dayOfDateCol(spendByDate.data?.purchase_date as string | undefined);
  if (spendDay) candidates.push(spendDay);
  if (spendByCreated.data?.created_at) candidates.push((spendByCreated.data.created_at as string).slice(0, 10));
  return candidates.length ? candidates.sort()[0] : null;
}

// ---------------------------------------------------------------------------
// Dashboard: per-bucket series (day, or hour for "today") + totals.
// ---------------------------------------------------------------------------
export type DashboardSeriesPoint = {
  date: string;
  leads: number;
  dials: number;
  contacts: number;
  appointments: number;
  presentations: number;
  sales: number;
  ap_cents: number;
  ip_cents: number;
};

export type DashboardResult = {
  range: { key: RangeKey; from: string; to: string };
  granularity: "day" | "hour";
  totals: Omit<DashboardSeriesPoint, "date">;
  series: DashboardSeriesPoint[];
};

export async function computeDashboard(
  supabase: SupabaseClient,
  personId: string,
  opts: { rangeKey: RangeKey; tz: string; from?: string | null; to?: string | null },
): Promise<DashboardResult> {
  const { rangeKey, tz } = opts;
  const earliestAll = rangeKey === "all" ? await findEarliestActivityDate(supabase, personId) : null;
  const { from, to } = resolveRange(rangeKey, tz, opts.from, opts.to, earliestAll);
  const isHourly = rangeKey === "today";

  const currentHourKey = (() => {
    const p = zonedParts(new Date(), tz);
    return `${from}T${pad2(p.h)}:00`;
  })();

  const { data, error } = await supabase.rpc("producer_dashboard_day_buckets", {
    p_person_id: personId,
    p_from: from,
    p_to: to,
    p_tz: tz,
  });
  if (error) throw new ProducerQueryError(error.message, "dashboard_buckets");

  type BucketRow = {
    bucket_date: string;
    leads: number | string | null;
    dials: number | string | null;
    contacts: number | string | null;
    appointments: number | string | null;
    presentations: number | string | null;
    tracker_sales: number | string | null;
    sale_count: number | string | null;
    ap_cents: number | string | null;
    ip_cents: number | string | null;
  };

  const byDay = new Map<string, BucketRow>();
  for (const row of (data ?? []) as BucketRow[]) {
    const day = String(row.bucket_date).slice(0, 10);
    byDay.set(day, row);
  }

  function pointForKey(key: string, row: BucketRow | undefined): DashboardSeriesPoint {
    const trackerSales = Number(row?.tracker_sales ?? 0);
    const saleCount = Number(row?.sale_count ?? 0);
    return {
      date: key,
      leads: Number(row?.leads ?? 0),
      dials: Number(row?.dials ?? 0),
      contacts: Number(row?.contacts ?? 0),
      appointments: Number(row?.appointments ?? 0),
      presentations: Number(row?.presentations ?? 0),
      sales: Math.max(trackerSales, saleCount),
      ap_cents: Number(row?.ap_cents ?? 0),
      ip_cents: Number(row?.ip_cents ?? 0),
    };
  }

  // Hourly "today": activity is date-grained; collapse onto the current local hour
  // (same behavior as the previous JS path).
  const series: DashboardSeriesPoint[] = isHourly
    ? Array.from({ length: 24 }, (_, h) => {
        const key = `${from}T${pad2(h)}:00`;
        if (key !== currentHourKey) {
          return {
            date: key,
            leads: 0,
            dials: 0,
            contacts: 0,
            appointments: 0,
            presentations: 0,
            sales: 0,
            ap_cents: 0,
            ip_cents: 0,
          };
        }
        return pointForKey(key, byDay.get(from));
      })
    : expandDates(from, to).map((day) => pointForKey(day, byDay.get(day)));

  const totals = series.reduce(
    (a, s) => ({
      leads: a.leads + s.leads,
      dials: a.dials + s.dials,
      contacts: a.contacts + s.contacts,
      appointments: a.appointments + s.appointments,
      presentations: a.presentations + s.presentations,
      sales: a.sales + s.sales,
      ap_cents: a.ap_cents + s.ap_cents,
      ip_cents: a.ip_cents + s.ip_cents,
    }),
    { leads: 0, dials: 0, contacts: 0, appointments: 0, presentations: 0, sales: 0, ap_cents: 0, ip_cents: 0 },
  );

  return { range: { key: rangeKey, from, to }, granularity: isHourly ? "hour" : "day", totals, series };
}

// ---------------------------------------------------------------------------
// Analytics: totals + state/age/carrier breakdowns.
// (The per-call contact heatmap was removed; no per-call data is captured.)
// ---------------------------------------------------------------------------
export type AnalyticsResult = {
  range: { key: RangeKey; from: string; to: string };
  totals: {
    leads: number;
    dials: number;
    contacts: number;
    appointments: number;
    presentations: number;
    sales: number;
    ap_cents: number;
    ip_cents: number;
    issuedCount: number;
    deposits_cents: number;
    leadSpend_cents: number;
  };
  // `leads` is retained for shape compatibility but is always 0; leads are a
  // daily total now, with no per-state/per-age dimension.
  state_perf: Array<{ state: string; leads: number; sales: number; ap_cents: number }>;
  age_bands: Array<{ band: string; leads: number; sales: number; ap_cents: number }>;
  carrier_perf: Array<{ name: string; sales: number; ap_cents: number; avg_monthly_premium_cents: number; avg_face_amount_cents: number }>;
};

export async function computeAnalytics(
  supabase: SupabaseClient,
  personId: string,
  opts: { rangeKey: RangeKey; tz: string; from?: string | null; to?: string | null },
): Promise<AnalyticsResult> {
  const { rangeKey, tz } = opts;
  const earliestAll = rangeKey === "all" ? await findEarliestActivityDate(supabase, personId) : null;
  const { from, to } = resolveRange(rangeKey, tz, opts.from, opts.to, earliestAll);

  const { data, error } = await supabase.rpc("producer_analytics_bundle", {
    p_person_id: personId,
    p_from: from,
    p_to: to,
    p_tz: tz,
  });
  if (error) throw new ProducerQueryError(error.message, "analytics_bundle");

  const bundle = (data ?? {}) as {
    totals?: AnalyticsResult["totals"];
    state_perf?: AnalyticsResult["state_perf"];
    age_bands?: AnalyticsResult["age_bands"];
    carrier_perf?: AnalyticsResult["carrier_perf"];
  };

  const emptyTotals: AnalyticsResult["totals"] = {
    leads: 0,
    dials: 0,
    contacts: 0,
    appointments: 0,
    presentations: 0,
    sales: 0,
    ap_cents: 0,
    ip_cents: 0,
    issuedCount: 0,
    deposits_cents: 0,
    leadSpend_cents: 0,
  };

  const totalsRaw = bundle.totals ?? emptyTotals;
  const totals: AnalyticsResult["totals"] = {
    leads: Number(totalsRaw.leads ?? 0),
    dials: Number(totalsRaw.dials ?? 0),
    contacts: Number(totalsRaw.contacts ?? 0),
    appointments: Number(totalsRaw.appointments ?? 0),
    presentations: Number(totalsRaw.presentations ?? 0),
    sales: Number(totalsRaw.sales ?? 0),
    ap_cents: Number(totalsRaw.ap_cents ?? 0),
    ip_cents: Number(totalsRaw.ip_cents ?? 0),
    issuedCount: Number(totalsRaw.issuedCount ?? 0),
    deposits_cents: Number(totalsRaw.deposits_cents ?? 0),
    leadSpend_cents: Number(totalsRaw.leadSpend_cents ?? 0),
  };

  const state_perf = (bundle.state_perf ?? []).map((r) => ({
    state: r.state,
    leads: Number(r.leads ?? 0),
    sales: Number(r.sales ?? 0),
    ap_cents: Number(r.ap_cents ?? 0),
  }));

  const age_bands = (bundle.age_bands ?? AGE_BANDS.map((b) => ({ band: b.band, leads: 0, sales: 0, ap_cents: 0 }))).map(
    (r) => ({
      band: r.band,
      leads: Number(r.leads ?? 0),
      sales: Number(r.sales ?? 0),
      ap_cents: Number(r.ap_cents ?? 0),
    }),
  );

  const carrier_perf = (bundle.carrier_perf ?? []).map((r) => ({
    name: r.name,
    sales: Number(r.sales ?? 0),
    ap_cents: Number(r.ap_cents ?? 0),
    avg_monthly_premium_cents: Number(r.avg_monthly_premium_cents ?? 0),
    avg_face_amount_cents: Number(r.avg_face_amount_cents ?? 0),
  }));

  return { range: { key: rangeKey, from, to }, totals, state_perf, age_bands, carrier_perf };
}

// ---------------------------------------------------------------------------
// Leaderboard: org-wide per-producer ranking over a range.
//
// Not scoped to one person_id; it aggregates every producer so the ranking is
// the same for everyone. Call it with a service-role client; RLS would
// otherwise clip the result to the viewer's own downline.
// ---------------------------------------------------------------------------
export type LeaderboardMetric =
  | "ap_cents"
  | "ip_cents"
  | "sales"
  | "policies"
  | "deposits_cents"
  | "dials"
  | "contacts"
  | "presentations";

export type LeaderboardRow = {
  person_id: string;
  full_name: string;
  photo_url?: string | null;
  ap_cents: number;
  ip_cents: number;
  /** Ranked sales metric: max(tracker_sales, client sale_count). */
  sales: number;
  /** Raw sum of tracker_entry.sales — Team "Policies Sold" uses this. */
  tracker_sales: number;
  policies: number;
  deposits_cents: number;
  dials: number;
  contacts: number;
  appointments: number;
  presentations: number;
};

export type LeaderboardResult = {
  range: { key: RangeKey; from: string; to: string };
  metric: LeaderboardMetric;
  rows: LeaderboardRow[];
};

type LeaderboardAggregateRpcRow = {
  person_id: string;
  full_name: string | null;
  ap_cents: number | string | null;
  ip_cents: number | string | null;
  sale_count: number | string | null;
  policies: number | string | null;
  deposits_cents: number | string | null;
  tracker_sales: number | string | null;
  dials: number | string | null;
  contacts: number | string | null;
  appointments: number | string | null;
  presentations: number | string | null;
};

function n(v: number | string | null | undefined): number {
  return Number(v ?? 0);
}

async function findEarliestActivityDateAll(supabase: SupabaseClient): Promise<string | null> {
  const [tracker, clients] = await Promise.all([
    supabase.from("tracker_entry").select("entry_date").order("entry_date", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("clients").select("created_at").order("created_at", { ascending: true }).limit(1).maybeSingle(),
  ]);
  const candidates: string[] = [];
  if (tracker.data?.entry_date) candidates.push((tracker.data.entry_date as string).slice(0, 10));
  if (clients.data?.created_at) candidates.push((clients.data.created_at as string).slice(0, 10));
  return candidates.length ? candidates.sort()[0] : null;
}

// PostgREST caps a select at 1000 rows unless you page through it. Org-wide
// boards can exceed that (thousands of clients), so fetch every page instead of
// silently truncating to the first 1000 — which understated team/leaderboard IP.
// Every caller must apply a stable `.order("id")` before `.range()`: Postgres
// gives no row order without one, so pages can repeat and skip rows.
export async function fetchAllRows<T>(
  makeQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const pageSize = 1000;
  const out: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await makeQuery(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
}

/**
 * Org-wide / team leaderboard aggregates via `leaderboard_aggregates` SQL.
 *
 * One round trip: the database groups every visible client / tracker / deposit
 * row per person (RLS scope of the given client applies — SECURITY INVOKER).
 * Replaces three org-wide row fetches that were paged 1000 rows per round trip
 * and aggregated in Node — payload now scales with team size, not book size.
 *
 * Failures throw ProducerQueryError so routes can tag Sentry without leaking
 * Postgres text to the client (Ticket #001).
 */
export async function computeLeaderboard(
  supabase: SupabaseClient,
  opts: { rangeKey: RangeKey; tz: string; from?: string | null; to?: string | null; metric?: LeaderboardMetric },
): Promise<LeaderboardResult> {
  const { rangeKey, tz } = opts;
  const metric: LeaderboardMetric = opts.metric ?? "ap_cents";
  const earliestAll = rangeKey === "all" ? await findEarliestActivityDateAll(supabase) : null;
  const { from, to } = resolveRange(rangeKey, tz, opts.from, opts.to, earliestAll);

  const { data, error } = await supabase.rpc("leaderboard_aggregates", {
    p_from: from,
    p_to: to,
    p_tz: tz,
  });
  if (error) throw new ProducerQueryError(error.message, "leaderboard_aggregates");

  // Internal/test/owner rows never appear on any board; keep accounts alive,
  // just exclude them from the ranked output. See leaderboardExclusions.ts.
  const rows: LeaderboardRow[] = ((data ?? []) as LeaderboardAggregateRpcRow[])
    .filter((r) => r.person_id && !isLeaderboardExcluded(r.person_id))
    .map((r) => {
      const saleCount = n(r.sale_count);
      const trackerSales = n(r.tracker_sales);
      return {
        person_id: r.person_id,
        full_name: r.full_name ?? "Unknown",
        ap_cents: n(r.ap_cents),
        ip_cents: n(r.ip_cents),
        sales: Math.max(trackerSales, saleCount),
        tracker_sales: trackerSales,
        policies: n(r.policies),
        deposits_cents: n(r.deposits_cents),
        dials: n(r.dials),
        contacts: n(r.contacts),
        appointments: n(r.appointments),
        presentations: n(r.presentations),
      };
    });

  rows.sort(
    (x, y) =>
      (y[metric] as number) - (x[metric] as number) ||
      y.ap_cents - x.ap_cents ||
      x.full_name.localeCompare(y.full_name),
  );

  return { range: { key: rangeKey, from, to }, metric, rows };
}

// ---------------------------------------------------------------------------
// Calendar: per-day AP / IP / sale-count + submitted flag for one month.
// ---------------------------------------------------------------------------
export type CalendarDay = { ap_cents: number; ip_cents: number; sales: number; submitted: boolean };
export type CalendarResult = { month: string; days: Record<string, CalendarDay> };

export async function computeCalendar(
  supabase: SupabaseClient,
  personId: string,
  ym: string,
  tz: string,
): Promise<CalendarResult> {
  const [y, m] = ym.split("-").map(Number);
  const fromIso = `${ym}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const toIso = `${ym}-${pad2(lastDay)}`;

  const { data, error } = await supabase.rpc("producer_calendar_days", {
    p_person_id: personId,
    p_from: fromIso,
    p_to: toIso,
    p_tz: tz,
  });
  if (error) throw new ProducerQueryError(error.message, "calendar_days");

  const days: Record<string, CalendarDay> = {};
  for (const row of (data ?? []) as Array<{
    day: string;
    ap_cents: number | string | null;
    ip_cents: number | string | null;
    sales: number | string | null;
    submitted: boolean | null;
  }>) {
    const iso = String(row.day).slice(0, 10);
    days[iso] = {
      ap_cents: Number(row.ap_cents ?? 0),
      ip_cents: Number(row.ip_cents ?? 0),
      sales: Number(row.sales ?? 0),
      submitted: !!row.submitted,
    };
  }

  return { month: ym, days };
}
