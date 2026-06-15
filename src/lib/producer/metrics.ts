import type { SupabaseClient } from "@supabase/supabase-js";
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
// contact_attempt) is no longer read — those tables were never written by the
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
function dollarsToCents(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// Date-typed columns ('YYYY-MM-DD') — the calendar day IS the value.
function dayOfDateCol(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.slice(0, 10);
  return ISO_DATE.test(s) ? s : null;
}

// timestamptz columns — convert to the viewer's local calendar day.
function dayOfTs(v: string | null | undefined, tz: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return zonedIsoDay(d, tz);
}

type ClientRow = {
  annual_premium: number | null;
  sale_status: string | null;
  submit_date: string | null;
  date: string | null;
  created_at: string | null;
  issue_date: string | null;
  state: string | null;
  age: number | null;
  quotes: Array<{ carrier?: string | null; premium?: string | null; coverage?: string | null }> | null;
  chosen_quote_index: number | null;
};

const CLIENT_COLS =
  "annual_premium, sale_status, submit_date, date, created_at, issue_date, state, age, quotes, chosen_quote_index";

// The day a client counts as a sale: when the policy was written, falling back
// to the record date, then the row's creation day.
function saleDay(c: ClientRow, tz: string): string | null {
  return dayOfDateCol(c.submit_date) ?? dayOfDateCol(c.date) ?? dayOfTs(c.created_at, tz);
}
function isSale(c: ClientRow): boolean {
  return (c.sale_status ?? "sale") === "sale";
}
function chosenQuote(c: ClientRow): { carrier?: string | null; premium?: string | null; coverage?: string | null } {
  const qs = Array.isArray(c.quotes) ? c.quotes : [];
  const idx = c.chosen_quote_index;
  return (idx != null ? qs[idx] : undefined) ?? qs.find((q) => q?.carrier) ?? qs[0] ?? {};
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

// Window timestamptz queries ±24h around the local-day bounds so any timestamp
// that lands in the local [from..to] range (after tz conversion) is captured;
// we filter back to the exact local day in JS.
function sqlWindow(from: string, to: string): { fromTs: string; toTs: string } {
  return {
    fromTs: new Date(`${from}T00:00:00Z`).toISOString().slice(0, -1),
    toTs: new Date(new Date(`${to}T00:00:00Z`).getTime() + 48 * 3600_000).toISOString().slice(0, -1),
  };
}

// Earliest activity day for the producer — lower bound for the ALL range.
async function findEarliestActivityDate(
  supabase: SupabaseClient,
  personId: string,
): Promise<string | null> {
  const [tracker, clients, spendByDate, spendByCreated] = await Promise.all([
    supabase.from("tracker_entry").select("entry_date").eq("person_id", personId).order("entry_date", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("clients").select("created_at").eq("person_id", personId).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    // Lead spend often predates the first tracked dial/client. If the "All"
    // range didn't reach back to it, the spend was silently excluded from Cost
    // Analysis / ROI — the bug where logged spend "never showed up". Consider
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

  // tracker is date-grained; clients are attributed by calendar day. On the
  // hourly "today" view everything collapses onto the current hour.
  function dayBucket(day: string | null | undefined): string | null {
    if (!day || day < from || day > to) return null;
    return isHourly ? currentHourKey : day;
  }

  const [trackerRes, clientsRes] = await Promise.all([
    supabase.from("tracker_entry").select("entry_date, dials, contacts, appointments, presentations, sales, leads").eq("person_id", personId).gte("entry_date", from).lte("entry_date", to),
    supabase.from("clients").select(CLIENT_COLS).eq("person_id", personId),
  ]);
  if (trackerRes.error) throw new Error(trackerRes.error.message);
  if (clientsRes.error) throw new Error(clientsRes.error.message);

  type TrackerAgg = { leads: number; dials: number; contacts: number; appointments: number; presentations: number; sales: number };
  const trackerByBucket = new Map<string, TrackerAgg>();
  for (const r of (trackerRes.data ?? []) as Array<Record<string, number | string | null>>) {
    const key = dayBucket((r.entry_date as string)?.slice(0, 10));
    if (!key) continue;
    const e = trackerByBucket.get(key) ?? { leads: 0, dials: 0, contacts: 0, appointments: 0, presentations: 0, sales: 0 };
    e.leads += Number(r.leads ?? 0);
    e.dials += Number(r.dials ?? 0);
    e.contacts += Number(r.contacts ?? 0);
    e.appointments += Number(r.appointments ?? 0);
    e.presentations += Number(r.presentations ?? 0);
    e.sales += Number(r.sales ?? 0);
    trackerByBucket.set(key, e);
  }

  const apCentsPerBucket = new Map<string, number>();
  const salesCountPerBucket = new Map<string, number>();
  const ipCentsPerBucket = new Map<string, number>();
  for (const c of (clientsRes.data ?? []) as ClientRow[]) {
    if (isSale(c)) {
      const key = dayBucket(saleDay(c, tz));
      if (key) {
        apCentsPerBucket.set(key, (apCentsPerBucket.get(key) ?? 0) + dollarsToCents(c.annual_premium));
        salesCountPerBucket.set(key, (salesCountPerBucket.get(key) ?? 0) + 1);
      }
    }
    const issueKey = dayBucket(dayOfDateCol(c.issue_date));
    if (issueKey) ipCentsPerBucket.set(issueKey, (ipCentsPerBucket.get(issueKey) ?? 0) + dollarsToCents(c.annual_premium));
  }

  const buckets = isHourly
    ? Array.from({ length: 24 }, (_, h) => `${from}T${pad2(h)}:00`)
    : expandDates(from, to);

  const series: DashboardSeriesPoint[] = buckets.map((key) => {
    const t = trackerByBucket.get(key);
    const derivedSales = salesCountPerBucket.get(key) ?? 0;
    return {
      date: key,
      leads: t?.leads ?? 0,
      dials: t?.dials ?? 0,
      contacts: t?.contacts ?? 0,
      appointments: t?.appointments ?? 0,
      presentations: t?.presentations ?? 0,
      sales: Math.max(t?.sales ?? 0, derivedSales),
      ap_cents: apCentsPerBucket.get(key) ?? 0,
      ip_cents: ipCentsPerBucket.get(key) ?? 0,
    };
  });

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
// (The per-call contact heatmap was removed — no per-call data is captured.)
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
  // `leads` is retained for shape compatibility but is always 0 — leads are a
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
  const { fromTs, toTs } = sqlWindow(from, to);
  const inRange = (day: string | null) => !!day && day >= from && day <= to;

  const [trackerRes, clientsRes, depositRes, spendRes] = await Promise.all([
    supabase.from("tracker_entry").select("dials, contacts, appointments, presentations, sales, leads").eq("person_id", personId).gte("entry_date", from).lte("entry_date", to),
    supabase.from("clients").select(CLIENT_COLS).eq("person_id", personId),
    supabase.from("client_deposits").select("actual_amount, status, updated_at, created_at").eq("person_id", personId).gte("updated_at", fromTs).lte("updated_at", toTs),
    supabase.from("lead_purchases").select("amount, purchase_date, created_at").eq("person_id", personId),
  ]);
  if (trackerRes.error) throw new Error(trackerRes.error.message);
  if (clientsRes.error) throw new Error(clientsRes.error.message);
  if (depositRes.error) throw new Error(depositRes.error.message);
  if (spendRes.error) throw new Error(spendRes.error.message);

  const clients = (clientsRes.data ?? []) as ClientRow[];
  const saleRows = clients.filter((c) => isSale(c) && inRange(saleDay(c, tz)));
  const issuedRows = clients.filter((c) => inRange(dayOfDateCol(c.issue_date)));

  const tracker = { leads: 0, dials: 0, contacts: 0, appointments: 0, presentations: 0, sales: 0 };
  for (const r of (trackerRes.data ?? []) as Array<Record<string, number | null>>) {
    tracker.leads += r.leads ?? 0;
    tracker.dials += r.dials ?? 0;
    tracker.contacts += r.contacts ?? 0;
    tracker.appointments += r.appointments ?? 0;
    tracker.presentations += r.presentations ?? 0;
    tracker.sales += r.sales ?? 0;
  }

  let ap_cents = 0;
  for (const c of saleRows) ap_cents += dollarsToCents(c.annual_premium);

  let ip_cents = 0;
  for (const c of issuedRows) ip_cents += dollarsToCents(c.annual_premium);
  const issuedCount = issuedRows.length;

  let deposits_cents = 0;
  for (const d of (depositRes.data ?? []) as Array<{ actual_amount: number | null; status: string | null; updated_at: string | null; created_at: string | null }>) {
    if (d.status !== "successful") continue;
    if (!inRange(dayOfTs(d.updated_at, tz) ?? dayOfTs(d.created_at, tz))) continue;
    deposits_cents += dollarsToCents(d.actual_amount);
  }

  let leadSpend_cents = 0;
  for (const p of (spendRes.data ?? []) as Array<{ amount: number | null; purchase_date: string | null; created_at: string | null }>) {
    // Fall back to created_at when purchase_date is missing, so an undated
    // lead-spend entry still counts (the SQL date filter used to drop it
    // entirely, which is why $2k of spend never reached ROI).
    const day = dayOfDateCol(p.purchase_date) ?? dayOfTs(p.created_at, tz);
    if (!inRange(day)) continue;
    leadSpend_cents += dollarsToCents(p.amount);
  }

  const totals = {
    leads: tracker.leads,
    dials: tracker.dials,
    contacts: tracker.contacts,
    appointments: tracker.appointments,
    presentations: tracker.presentations,
    sales: Math.max(tracker.sales, saleRows.length),
    ap_cents,
    ip_cents,
    issuedCount,
    deposits_cents,
    leadSpend_cents,
  };

  // State performance (sales + AP by the client's state)
  type StateAgg = { state: string; leads: number; sales: number; ap_cents: number };
  const stateMap = new Map<string, StateAgg>();
  for (const c of saleRows) {
    const st = (c.state ?? "").toUpperCase().trim();
    if (!st) continue;
    const e = stateMap.get(st) ?? { state: st, leads: 0, sales: 0, ap_cents: 0 };
    e.sales++;
    e.ap_cents += dollarsToCents(c.annual_premium);
    stateMap.set(st, e);
  }
  const state_perf = Array.from(stateMap.values())
    .sort((a, b) => b.ap_cents - a.ap_cents || b.sales - a.sales)
    .slice(0, 10);

  // Age bands (sales + AP by the client's age)
  const age_bands = AGE_BANDS.map((b) => ({ band: b.band, leads: 0, sales: 0, ap_cents: 0 }));
  function bandIndex(age: number | null | undefined): number {
    if (age == null) return -1;
    for (let i = 0; i < AGE_BANDS.length; i++) {
      if (age >= AGE_BANDS[i].min && age <= AGE_BANDS[i].max) return i;
    }
    return -1;
  }
  for (const c of saleRows) {
    const i = bandIndex(c.age);
    if (i >= 0) {
      age_bands[i].sales++;
      age_bands[i].ap_cents += dollarsToCents(c.annual_premium);
    }
  }

  // Carrier performance (from each sold client's chosen quote)
  type CarrierAgg = { name: string; sales: number; ap_cents: number; monthly_total_cents: number; face_total_cents: number };
  const carrierMap = new Map<string, CarrierAgg>();
  for (const c of saleRows) {
    const q = chosenQuote(c);
    const name = (q.carrier ?? "Other").trim() || "Other";
    const e = carrierMap.get(name) ?? { name, sales: 0, ap_cents: 0, monthly_total_cents: 0, face_total_cents: 0 };
    e.sales++;
    e.ap_cents += dollarsToCents(c.annual_premium);
    e.monthly_total_cents += dollarsToCents(q.premium);
    e.face_total_cents += dollarsToCents(q.coverage);
    carrierMap.set(name, e);
  }
  const carrier_perf = Array.from(carrierMap.values())
    .map((c) => ({
      name: c.name,
      sales: c.sales,
      ap_cents: c.ap_cents,
      avg_monthly_premium_cents: c.sales > 0 ? Math.round(c.monthly_total_cents / c.sales) : 0,
      avg_face_amount_cents: c.sales > 0 ? Math.round(c.face_total_cents / c.sales) : 0,
    }))
    .sort((a, b) => b.ap_cents - a.ap_cents);

  return { range: { key: rangeKey, from, to }, totals, state_perf, age_bands, carrier_perf };
}

// ---------------------------------------------------------------------------
// Leaderboard: org-wide per-producer ranking over a range.
//
// Not scoped to one person_id — it aggregates every producer so the ranking is
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
  ap_cents: number;
  ip_cents: number;
  sales: number;
  policies: number;
  deposits_cents: number;
  dials: number;
  contacts: number;
  presentations: number;
};

export type LeaderboardResult = {
  range: { key: RangeKey; from: string; to: string };
  metric: LeaderboardMetric;
  rows: LeaderboardRow[];
};

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

export async function computeLeaderboard(
  supabase: SupabaseClient,
  opts: { rangeKey: RangeKey; tz: string; from?: string | null; to?: string | null; metric?: LeaderboardMetric },
): Promise<LeaderboardResult> {
  const { rangeKey, tz } = opts;
  const metric: LeaderboardMetric = opts.metric ?? "ap_cents";
  const earliestAll = rangeKey === "all" ? await findEarliestActivityDateAll(supabase) : null;
  const { from, to } = resolveRange(rangeKey, tz, opts.from, opts.to, earliestAll);
  const { fromTs, toTs } = sqlWindow(from, to);
  const inRange = (day: string | null) => !!day && day >= from && day <= to;

  const [clientsRes, trackerRes, depositRes] = await Promise.all([
    // All clients org-wide; we attribute each to a day in JS (sale vs issue
    // dates can diverge from created_at, so we don't bound by created_at here).
    supabase.from("clients").select(`person_id, ${CLIENT_COLS}`),
    supabase.from("tracker_entry").select("person_id, sales, dials, contacts, presentations, entry_date").gte("entry_date", from).lte("entry_date", to),
    supabase.from("client_deposits").select("person_id, actual_amount, status, updated_at, created_at").gte("updated_at", fromTs).lte("updated_at", toTs),
  ]);
  if (clientsRes.error) throw new Error(clientsRes.error.message);
  if (trackerRes.error) throw new Error(trackerRes.error.message);
  if (depositRes.error) throw new Error(depositRes.error.message);

  type Agg = { ap_cents: number; ip_cents: number; saleCount: number; trackerSales: number; policies: number; deposits_cents: number; dials: number; contacts: number; presentations: number };
  const byPerson = new Map<string, Agg>();
  const bump = (pid: string): Agg => {
    let a = byPerson.get(pid);
    if (!a) {
      a = { ap_cents: 0, ip_cents: 0, saleCount: 0, trackerSales: 0, policies: 0, deposits_cents: 0, dials: 0, contacts: 0, presentations: 0 };
      byPerson.set(pid, a);
    }
    return a;
  };

  for (const c of (clientsRes.data ?? []) as Array<ClientRow & { person_id: string }>) {
    if (isSale(c) && inRange(saleDay(c, tz))) {
      const a = bump(c.person_id);
      a.ap_cents += dollarsToCents(c.annual_premium);
      a.saleCount += 1;
    }
    if (inRange(dayOfDateCol(c.issue_date))) {
      const a = bump(c.person_id);
      a.ip_cents += dollarsToCents(c.annual_premium);
      a.policies += 1;
    }
  }

  for (const t of (trackerRes.data ?? []) as Array<{ person_id: string; sales: number | null; dials: number | null; contacts: number | null; presentations: number | null }>) {
    const a = bump(t.person_id);
    a.trackerSales += Number(t.sales ?? 0);
    a.dials += Number(t.dials ?? 0);
    a.contacts += Number(t.contacts ?? 0);
    a.presentations += Number(t.presentations ?? 0);
  }

  for (const d of (depositRes.data ?? []) as Array<{ person_id: string; actual_amount: number | null; status: string | null; updated_at: string | null; created_at: string | null }>) {
    if (d.status !== "successful") continue;
    if (!inRange(dayOfTs(d.updated_at, tz) ?? dayOfTs(d.created_at, tz))) continue;
    bump(d.person_id).deposits_cents += dollarsToCents(d.actual_amount);
  }

  // Internal/test/owner rows never appear on any board — keep accounts alive,
  // just exclude them from the ranked output. See leaderboardExclusions.ts.
  const ids = Array.from(byPerson.keys()).filter((id) => !isLeaderboardExcluded(id));
  const nameById = new Map<string, string>();
  if (ids.length) {
    const peopleRes = await supabase.from("person").select("id, full_name").in("id", ids);
    if (peopleRes.error) throw new Error(peopleRes.error.message);
    for (const p of (peopleRes.data ?? []) as Array<{ id: string; full_name: string | null }>) {
      nameById.set(p.id, p.full_name ?? "Unknown");
    }
  }

  const rows: LeaderboardRow[] = ids.map((pid) => {
    const a = byPerson.get(pid)!;
    return {
      person_id: pid,
      full_name: nameById.get(pid) ?? "Unknown",
      ap_cents: a.ap_cents,
      ip_cents: a.ip_cents,
      sales: Math.max(a.trackerSales, a.saleCount),
      policies: a.policies,
      deposits_cents: a.deposits_cents,
      dials: a.dials,
      contacts: a.contacts,
      presentations: a.presentations,
    };
  });

  rows.sort((x, y) => (y[metric] as number) - (x[metric] as number) || y.ap_cents - x.ap_cents || x.full_name.localeCompare(y.full_name));

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
  const inMonth = (day: string | null) => !!day && day >= fromIso && day <= toIso;

  const [clientsRes, trackerRes] = await Promise.all([
    supabase.from("clients").select(CLIENT_COLS).eq("person_id", personId),
    supabase.from("tracker_entry").select("entry_date").eq("person_id", personId).gte("entry_date", fromIso).lte("entry_date", toIso),
  ]);
  if (clientsRes.error) throw new Error(clientsRes.error.message);
  if (trackerRes.error) throw new Error(trackerRes.error.message);

  const days: Record<string, CalendarDay> = {};
  const bumpDay = (iso: string): CalendarDay => {
    const existing = days[iso];
    if (existing) return existing;
    const next: CalendarDay = { ap_cents: 0, ip_cents: 0, sales: 0, submitted: false };
    days[iso] = next;
    return next;
  };

  for (const c of (clientsRes.data ?? []) as ClientRow[]) {
    if (isSale(c)) {
      const day = saleDay(c, tz);
      if (inMonth(day)) {
        const d = bumpDay(day!);
        d.ap_cents += dollarsToCents(c.annual_premium);
        d.sales += 1;
      }
    }
    const issueDay = dayOfDateCol(c.issue_date);
    if (inMonth(issueDay)) bumpDay(issueDay!).ip_cents += dollarsToCents(c.annual_premium);
  }
  for (const t of (trackerRes.data ?? []) as Array<{ entry_date: string }>) {
    bumpDay((t.entry_date as string).slice(0, 10)).submitted = true;
  }

  return { month: ym, days };
}
