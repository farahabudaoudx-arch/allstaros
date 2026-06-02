import type { SupabaseClient } from "@supabase/supabase-js";
import { zonedParts, zonedIsoDay } from "@/lib/producer/time";

// Closed-loop producer metrics. Ported from the LifeLeads dashboard/analytics
// routes but scoped to a single producer (person_id) and sourced only from the
// OS tables: sales_lead, tracker_entry, sale, issued_policy, deposit,
// contact_attempt. There is no separate "clients" write-up source here — sale
// + issued_policy are the single source of truth for AP / IP / sale counts.

export type RangeKey = "today" | "wtd" | "mtd" | "ytd" | "all" | "custom";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Each producer table carries the AP-bearing premium. $7.50/lead is the
// working cost-per-lead default for final-expense exclusives until a spend
// table ships.
const PRICE_PER_LEAD_CENTS = 750;

export const AGE_BANDS: Array<{ band: string; min: number; max: number }> = [
  { band: "50–59", min: 50, max: 59 },
  { band: "60–64", min: 60, max: 64 },
  { band: "65–69", min: 65, max: 69 },
  { band: "70–74", min: 70, max: 74 },
  { band: "75–80", min: 75, max: 80 },
];

export const HEATMAP_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
// Rows are Mon..Sun: Date dow (0=Sun..6=Sat) → row index (0=Mon..6=Sun).
const DOW_TO_ROW = [6, 0, 1, 2, 3, 4, 5];

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

// Earliest activity date across the producer's tables — lower bound for ALL.
async function findEarliestActivityDate(
  supabase: SupabaseClient,
  personId: string,
): Promise<string | null> {
  const [leads, tracker, sales, deposits] = await Promise.all([
    supabase.from("sales_lead").select("received_at").eq("person_id", personId).order("received_at", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("tracker_entry").select("entry_date").eq("person_id", personId).order("entry_date", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("sale").select("created_at").eq("person_id", personId).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("deposit").select("received_at").eq("person_id", personId).order("received_at", { ascending: true }).limit(1).maybeSingle(),
  ]);
  const candidates: string[] = [];
  const push = (v: string | null | undefined) => {
    if (v) candidates.push(v.slice(0, 10));
  };
  push(leads.data?.received_at as string | undefined);
  push(tracker.data?.entry_date as string | undefined);
  push(sales.data?.created_at as string | undefined);
  push(deposits.data?.received_at as string | undefined);
  if (candidates.length === 0) return null;
  return candidates.sort()[0];
}

// Window the SQL query ±24h around the local-day bounds so any timestamp that
// lands in the local [from..to] range (after tz conversion) is captured; we
// filter back to the exact local day in JS.
function sqlWindow(from: string, to: string): { fromTs: string; toTs: string } {
  return {
    fromTs: new Date(`${from}T00:00:00Z`).toISOString().slice(0, -1),
    toTs: new Date(new Date(`${to}T00:00:00Z`).getTime() + 48 * 3600_000).toISOString().slice(0, -1),
  };
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
  const { fromTs, toTs } = sqlWindow(from, to);

  const currentHourKey = (() => {
    const p = zonedParts(new Date(), tz);
    return `${from}T${pad2(p.h)}:00`;
  })();

  function bucketKey(ts: string | null | undefined): string | null {
    if (!ts) return null;
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    if (!isHourly) return zonedIsoDay(d, tz);
    const p = zonedParts(d, tz);
    const ymd = `${p.y}-${pad2(p.m)}-${pad2(p.day)}`;
    if (ymd !== from) return null;
    return `${ymd}T${pad2(p.h)}:00`;
  }
  function dateOnlyKey(ymd: string | null | undefined): string | null {
    if (!ymd) return null;
    if (isHourly) return currentHourKey;
    return ymd.slice(0, 10);
  }

  const [leadsRes, trackerRes, salesRes, policyRes] = await Promise.all([
    supabase.from("sales_lead").select("received_at").eq("person_id", personId).gte("received_at", fromTs).lte("received_at", toTs),
    supabase.from("tracker_entry").select("entry_date, dials, contacts, appointments, presentations, sales").eq("person_id", personId).gte("entry_date", from).lte("entry_date", to),
    supabase.from("sale").select("created_at, annual_premium_cents").eq("person_id", personId).gte("created_at", fromTs).lte("created_at", toTs),
    supabase.from("issued_policy").select("issued_at, status, sale:sale_id(annual_premium_cents)").eq("person_id", personId).gte("issued_at", fromTs).lte("issued_at", toTs),
  ]);
  if (leadsRes.error) throw new Error(leadsRes.error.message);
  if (trackerRes.error) throw new Error(trackerRes.error.message);
  if (salesRes.error) throw new Error(salesRes.error.message);
  if (policyRes.error) throw new Error(policyRes.error.message);

  const leadsPerBucket = new Map<string, number>();
  for (const r of leadsRes.data ?? []) {
    const key = bucketKey(r.received_at as string);
    if (key) leadsPerBucket.set(key, (leadsPerBucket.get(key) ?? 0) + 1);
  }

  const trackerByBucket = new Map<string, { dials: number; contacts: number; appointments: number; presentations: number; sales: number }>();
  for (const r of (trackerRes.data ?? []) as Array<Record<string, number | string | null>>) {
    const key = dateOnlyKey(r.entry_date as string);
    if (!key) continue;
    const existing = trackerByBucket.get(key);
    const vals = {
      dials: Number(r.dials ?? 0),
      contacts: Number(r.contacts ?? 0),
      appointments: Number(r.appointments ?? 0),
      presentations: Number(r.presentations ?? 0),
      sales: Number(r.sales ?? 0),
    };
    if (existing) {
      existing.dials += vals.dials;
      existing.contacts += vals.contacts;
      existing.appointments += vals.appointments;
      existing.presentations += vals.presentations;
      existing.sales += vals.sales;
    } else {
      trackerByBucket.set(key, vals);
    }
  }

  const apCentsPerBucket = new Map<string, number>();
  const salesCountPerBucket = new Map<string, number>();
  for (const r of (salesRes.data ?? []) as Array<{ created_at: string; annual_premium_cents: number | null }>) {
    const key = bucketKey(r.created_at);
    if (!key) continue;
    apCentsPerBucket.set(key, (apCentsPerBucket.get(key) ?? 0) + (r.annual_premium_cents ?? 0));
    salesCountPerBucket.set(key, (salesCountPerBucket.get(key) ?? 0) + 1);
  }

  const ipCentsPerBucket = new Map<string, number>();
  for (const p of (policyRes.data ?? []) as Array<{ issued_at: string; status: string | null; sale: { annual_premium_cents?: number | null } | Array<{ annual_premium_cents?: number | null }> | null }>) {
    if (p.status !== "issued" && p.status !== "lapsed") continue;
    const joined = Array.isArray(p.sale) ? p.sale[0] : p.sale;
    const ap = joined?.annual_premium_cents ?? 0;
    if (!ap) continue;
    const key = bucketKey(p.issued_at);
    if (key) ipCentsPerBucket.set(key, (ipCentsPerBucket.get(key) ?? 0) + ap);
  }

  const buckets = isHourly
    ? Array.from({ length: 24 }, (_, h) => `${from}T${pad2(h)}:00`)
    : expandDates(from, to);

  const series: DashboardSeriesPoint[] = buckets.map((key) => {
    const t = trackerByBucket.get(key);
    const derivedSales = salesCountPerBucket.get(key) ?? 0;
    return {
      date: key,
      leads: leadsPerBucket.get(key) ?? 0,
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
// Analytics: totals + state/age/carrier breakdowns + contact heatmap.
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
  state_perf: Array<{ state: string; leads: number; sales: number; ap_cents: number }>;
  age_bands: Array<{ band: string; leads: number; sales: number; ap_cents: number }>;
  carrier_perf: Array<{ name: string; sales: number; ap_cents: number; avg_monthly_premium_cents: number; avg_face_amount_cents: number }>;
  heatmap: number[][];
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

  function inLocalRange(ts: string | null | undefined): boolean {
    if (!ts) return false;
    const d = new Date(ts);
    if (isNaN(d.getTime())) return false;
    const day = zonedIsoDay(d, tz);
    return day >= from && day <= to;
  }

  const [leadsRes, trackerRes, salesRes, policyRes, depositRes, attemptRes] = await Promise.all([
    supabase.from("sales_lead").select("state, age, received_at").eq("person_id", personId).gte("received_at", fromTs).lte("received_at", toTs),
    supabase.from("tracker_entry").select("dials, contacts, appointments, presentations, sales").eq("person_id", personId).gte("entry_date", from).lte("entry_date", to),
    supabase.from("sale").select("carrier, annual_premium_cents, monthly_premium_cents, face_amount_cents, created_at, lead:lead_id(state, age)").eq("person_id", personId).gte("created_at", fromTs).lte("created_at", toTs),
    supabase.from("issued_policy").select("status, issued_at, sale:sale_id(annual_premium_cents)").eq("person_id", personId).gte("issued_at", fromTs).lte("issued_at", toTs),
    supabase.from("deposit").select("amount_cents, status, received_at").eq("person_id", personId).gte("received_at", fromTs).lte("received_at", toTs),
    supabase.from("contact_attempt").select("created_at, outcome").eq("person_id", personId).gte("created_at", fromTs).lte("created_at", toTs),
  ]);
  if (leadsRes.error) throw new Error(leadsRes.error.message);
  if (trackerRes.error) throw new Error(trackerRes.error.message);
  if (salesRes.error) throw new Error(salesRes.error.message);
  if (policyRes.error) throw new Error(policyRes.error.message);
  if (depositRes.error) throw new Error(depositRes.error.message);
  if (attemptRes.error) throw new Error(attemptRes.error.message);

  const leadsRows = (leadsRes.data ?? []).filter((r: { received_at: string }) => inLocalRange(r.received_at)) as Array<{ state: string | null; age: number | null }>;
  const salesRows = (salesRes.data ?? []).filter((r: { created_at: string }) => inLocalRange(r.created_at)) as Array<{ carrier: string | null; annual_premium_cents: number | null; monthly_premium_cents: number | null; face_amount_cents: number | null; lead: { state?: string | null; age?: number | null } | Array<{ state?: string | null; age?: number | null }> | null }>;
  const policyRows = (policyRes.data ?? []).filter((r: { issued_at: string }) => inLocalRange(r.issued_at)) as Array<{ status: string | null; sale: { annual_premium_cents?: number | null } | Array<{ annual_premium_cents?: number | null }> | null }>;
  const depositRows = (depositRes.data ?? []).filter((r: { received_at: string }) => inLocalRange(r.received_at)) as Array<{ amount_cents: number | null; status: string | null }>;
  const attemptRows = (attemptRes.data ?? []).filter((r: { created_at: string }) => inLocalRange(r.created_at)) as Array<{ created_at: string; outcome: string | null }>;

  const tracker = { dials: 0, contacts: 0, appointments: 0, presentations: 0, sales: 0 };
  for (const r of (trackerRes.data ?? []) as Array<Record<string, number | null>>) {
    tracker.dials += r.dials ?? 0;
    tracker.contacts += r.contacts ?? 0;
    tracker.appointments += r.appointments ?? 0;
    tracker.presentations += r.presentations ?? 0;
    tracker.sales += r.sales ?? 0;
  }

  let ap_cents = 0;
  for (const s of salesRows) ap_cents += s.annual_premium_cents ?? 0;

  let ip_cents = 0;
  let issuedCount = 0;
  for (const p of policyRows) {
    if (p.status === "issued" || p.status === "lapsed") {
      issuedCount++;
      const joined = Array.isArray(p.sale) ? p.sale[0] : p.sale;
      ip_cents += joined?.annual_premium_cents ?? 0;
    }
  }

  let deposits_cents = 0;
  for (const d of depositRows) {
    if (d.status === "received") deposits_cents += d.amount_cents ?? 0;
  }

  const leadSpend_cents = leadsRows.length * PRICE_PER_LEAD_CENTS;

  const totals = {
    leads: leadsRows.length,
    dials: tracker.dials,
    contacts: tracker.contacts,
    appointments: tracker.appointments,
    presentations: tracker.presentations,
    sales: Math.max(tracker.sales, salesRows.length),
    ap_cents,
    ip_cents,
    issuedCount,
    deposits_cents,
    leadSpend_cents,
  };

  // State performance
  type StateAgg = { state: string; leads: number; sales: number; ap_cents: number };
  const stateMap = new Map<string, StateAgg>();
  for (const l of leadsRows) {
    const st = (l.state ?? "").toUpperCase().trim();
    if (!st) continue;
    const e = stateMap.get(st) ?? { state: st, leads: 0, sales: 0, ap_cents: 0 };
    e.leads++;
    stateMap.set(st, e);
  }
  for (const s of salesRows) {
    const joined = Array.isArray(s.lead) ? s.lead[0] : s.lead;
    const st = (joined?.state ?? "").toUpperCase().trim();
    if (!st) continue;
    const e = stateMap.get(st) ?? { state: st, leads: 0, sales: 0, ap_cents: 0 };
    e.sales++;
    e.ap_cents += s.annual_premium_cents ?? 0;
    stateMap.set(st, e);
  }
  const state_perf = Array.from(stateMap.values())
    .sort((a, b) => b.ap_cents - a.ap_cents || b.leads - a.leads)
    .slice(0, 10);

  // Age bands
  const age_bands = AGE_BANDS.map((b) => ({ band: b.band, leads: 0, sales: 0, ap_cents: 0 }));
  function bandIndex(age: number | null | undefined): number {
    if (age == null) return -1;
    for (let i = 0; i < AGE_BANDS.length; i++) {
      if (age >= AGE_BANDS[i].min && age <= AGE_BANDS[i].max) return i;
    }
    return -1;
  }
  for (const l of leadsRows) {
    const i = bandIndex(l.age);
    if (i >= 0) age_bands[i].leads++;
  }
  for (const s of salesRows) {
    const joined = Array.isArray(s.lead) ? s.lead[0] : s.lead;
    const i = bandIndex(joined?.age);
    if (i >= 0) {
      age_bands[i].sales++;
      age_bands[i].ap_cents += s.annual_premium_cents ?? 0;
    }
  }

  // Carrier performance
  type CarrierAgg = { name: string; sales: number; ap_cents: number; monthly_total_cents: number; face_total_cents: number };
  const carrierMap = new Map<string, CarrierAgg>();
  for (const s of salesRows) {
    const name = (s.carrier ?? "Other").trim() || "Other";
    const e = carrierMap.get(name) ?? { name, sales: 0, ap_cents: 0, monthly_total_cents: 0, face_total_cents: 0 };
    e.sales++;
    e.ap_cents += s.annual_premium_cents ?? 0;
    e.monthly_total_cents += s.monthly_premium_cents ?? 0;
    e.face_total_cents += s.face_amount_cents ?? 0;
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

  // Heatmap: connected contact_attempts per (row=dow Mon..Sun, col=hour 8..19)
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(HEATMAP_HOURS.length).fill(0));
  for (const a of attemptRows) {
    if (a.outcome !== "connected") continue;
    const d = new Date(a.created_at);
    if (isNaN(d.getTime())) continue;
    const p = zonedParts(d, tz);
    const row = DOW_TO_ROW[p.dow];
    const col = HEATMAP_HOURS.indexOf(p.h);
    if (col >= 0) heatmap[row][col]++;
  }

  return { range: { key: rangeKey, from, to }, totals, state_perf, age_bands, carrier_perf, heatmap };
}

// ---------------------------------------------------------------------------
// Leaderboard: org-wide per-producer ranking over a range.
//
// Unlike the dashboard/analytics computations this is NOT scoped to one
// person_id — it aggregates every producer so the ranking is the same for
// everyone. Call it with a service-role client; RLS would otherwise clip the
// result to the viewer's own downline.
// ---------------------------------------------------------------------------
export type LeaderboardMetric = "ap_cents" | "ip_cents" | "sales" | "policies" | "deposits_cents";

export type LeaderboardRow = {
  person_id: string;
  full_name: string;
  ap_cents: number;
  ip_cents: number;
  sales: number;
  policies: number;
  deposits_cents: number;
};

export type LeaderboardResult = {
  range: { key: RangeKey; from: string; to: string };
  metric: LeaderboardMetric;
  rows: LeaderboardRow[];
};

// Earliest activity date across ALL producers — lower bound for the ALL range.
async function findEarliestActivityDateAll(supabase: SupabaseClient): Promise<string | null> {
  const [tracker, sales] = await Promise.all([
    supabase.from("tracker_entry").select("entry_date").order("entry_date", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("sale").select("created_at").order("created_at", { ascending: true }).limit(1).maybeSingle(),
  ]);
  const candidates: string[] = [];
  if (tracker.data?.entry_date) candidates.push((tracker.data.entry_date as string).slice(0, 10));
  if (sales.data?.created_at) candidates.push((sales.data.created_at as string).slice(0, 10));
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

  function inLocalRange(ts: string | null | undefined): boolean {
    if (!ts) return false;
    const d = new Date(ts);
    if (isNaN(d.getTime())) return false;
    const day = zonedIsoDay(d, tz);
    return day >= from && day <= to;
  }

  const [salesRes, policyRes, trackerRes, depositRes] = await Promise.all([
    supabase.from("sale").select("person_id, annual_premium_cents, created_at").gte("created_at", fromTs).lte("created_at", toTs),
    supabase.from("issued_policy").select("person_id, status, issued_at, sale:sale_id(annual_premium_cents)").gte("issued_at", fromTs).lte("issued_at", toTs),
    supabase.from("tracker_entry").select("person_id, sales, entry_date").gte("entry_date", from).lte("entry_date", to),
    supabase.from("deposit").select("person_id, amount_cents, status, received_at").gte("received_at", fromTs).lte("received_at", toTs),
  ]);
  if (salesRes.error) throw new Error(salesRes.error.message);
  if (policyRes.error) throw new Error(policyRes.error.message);
  if (trackerRes.error) throw new Error(trackerRes.error.message);
  if (depositRes.error) throw new Error(depositRes.error.message);

  type Agg = { ap_cents: number; ip_cents: number; saleCount: number; trackerSales: number; policies: number; deposits_cents: number };
  const byPerson = new Map<string, Agg>();
  const bump = (pid: string): Agg => {
    let a = byPerson.get(pid);
    if (!a) {
      a = { ap_cents: 0, ip_cents: 0, saleCount: 0, trackerSales: 0, policies: 0, deposits_cents: 0 };
      byPerson.set(pid, a);
    }
    return a;
  };

  for (const r of (salesRes.data ?? []) as Array<{ person_id: string; annual_premium_cents: number | null; created_at: string }>) {
    if (!inLocalRange(r.created_at)) continue;
    const a = bump(r.person_id);
    a.ap_cents += r.annual_premium_cents ?? 0;
    a.saleCount += 1;
  }

  for (const p of (policyRes.data ?? []) as Array<{ person_id: string; status: string | null; issued_at: string; sale: { annual_premium_cents?: number | null } | Array<{ annual_premium_cents?: number | null }> | null }>) {
    if (p.status !== "issued" && p.status !== "lapsed") continue;
    if (!inLocalRange(p.issued_at)) continue;
    const joined = Array.isArray(p.sale) ? p.sale[0] : p.sale;
    const a = bump(p.person_id);
    a.ip_cents += joined?.annual_premium_cents ?? 0;
    a.policies += 1;
  }

  for (const t of (trackerRes.data ?? []) as Array<{ person_id: string; sales: number | null }>) {
    bump(t.person_id).trackerSales += Number(t.sales ?? 0);
  }

  for (const d of (depositRes.data ?? []) as Array<{ person_id: string; amount_cents: number | null; status: string | null; received_at: string }>) {
    if (d.status !== "received") continue;
    if (!inLocalRange(d.received_at)) continue;
    bump(d.person_id).deposits_cents += d.amount_cents ?? 0;
  }

  const ids = Array.from(byPerson.keys());
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
  const { fromTs, toTs } = sqlWindow(fromIso, toIso);

  function dayIfInMonth(ts: string | null | undefined): string | null {
    if (!ts) return null;
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    const day = zonedIsoDay(d, tz);
    return day >= fromIso && day <= toIso ? day : null;
  }

  const [salesRes, policyRes, trackerRes] = await Promise.all([
    supabase.from("sale").select("created_at, annual_premium_cents").eq("person_id", personId).gte("created_at", fromTs).lte("created_at", toTs),
    supabase.from("issued_policy").select("status, issued_at, sale:sale_id(annual_premium_cents)").eq("person_id", personId).gte("issued_at", fromTs).lte("issued_at", toTs),
    supabase.from("tracker_entry").select("entry_date").eq("person_id", personId).gte("entry_date", fromIso).lte("entry_date", toIso),
  ]);
  if (salesRes.error) throw new Error(salesRes.error.message);
  if (policyRes.error) throw new Error(policyRes.error.message);
  if (trackerRes.error) throw new Error(trackerRes.error.message);

  const days: Record<string, CalendarDay> = {};
  const bumpDay = (iso: string): CalendarDay => {
    const existing = days[iso];
    if (existing) return existing;
    const next: CalendarDay = { ap_cents: 0, ip_cents: 0, sales: 0, submitted: false };
    days[iso] = next;
    return next;
  };

  for (const s of (salesRes.data ?? []) as Array<{ created_at: string | null; annual_premium_cents: number | null }>) {
    const iso = dayIfInMonth(s.created_at);
    if (!iso) continue;
    const d = bumpDay(iso);
    d.ap_cents += s.annual_premium_cents ?? 0;
    d.sales += 1;
  }
  for (const p of (policyRes.data ?? []) as Array<{ status: string | null; issued_at: string | null; sale: { annual_premium_cents?: number | null } | Array<{ annual_premium_cents?: number | null }> | null }>) {
    if (p.status !== "issued" && p.status !== "lapsed") continue;
    const iso = dayIfInMonth(p.issued_at);
    if (!iso) continue;
    const joined = Array.isArray(p.sale) ? p.sale[0] : p.sale;
    bumpDay(iso).ip_cents += joined?.annual_premium_cents ?? 0;
  }
  for (const t of (trackerRes.data ?? []) as Array<{ entry_date: string }>) {
    bumpDay(t.entry_date).submitted = true;
  }

  return { month: ym, days };
}
