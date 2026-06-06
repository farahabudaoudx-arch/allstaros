// Demo data seeder for a single PRODUCER (not the builder).
//
//   node --env-file=.env.local scripts/seed-producer-demo.mjs
//
// Loads a realistic book of business for nickswipe99@gmail.com so the producer
// dashboard / analytics / clients pages render real numbers:
//   • Production  — $100k YTD AP and $600k all-time AP (sale.annual_premium_cents).
//   • Activity    — high dial volume: ~90k dials, ~9k contacts, ~2.2k appts,
//                   ~1.7k presentations all-time, with a current-month slice so
//                   Today / WTD / MTD timeframes populate too.
//   • Clients     — ~50 clients in the clients book.
//
// Idempotent: wipes its own prior demo rows (scoped to this producer) first,
// then re-seeds. Markers: lead email @nickdemo.allstar.test, sale notes='DEMO',
// client lead_vendor='DEMO'. Deleting the leads cascades their sales →
// issued_policy → deposit and contact_attempt.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const PRODUCER_EMAIL = "nickswipe99@gmail.com";
const DEMO_DOMAIN = "nickdemo.allstar.test";

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CARRIERS = [
  "American Amicable", "Americo", "Corebridge", "Ethos",
  "InstaBrain", "Mutual of Omaha", "Transamerica",
];
const STATES = ["AL", "TX", "FL", "GA", "NC", "SC", "TN", "OH", "MI", "LA", "MS", "VA"];
const FIRST = ["James","Mary","Robert","Patricia","John","Jennifer","Michael","Linda","David","Elizabeth","William","Barbara","Richard","Susan","Joseph","Jessica","Thomas","Karen","Chris","Nancy","Daniel","Lisa","Matthew","Sandra","Anthony","Ashley","Mark","Kimberly","Donald","Donna","Steven","Carol","Paul","Michelle","Andrew","Amanda","Josh","Melissa","Kevin","Deborah"];
const LAST = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin","Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson"];

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const randInt = (min, max) => min + rand(max - min + 1);
let _seq = 0;
const fullName = () => `${pick(FIRST)} ${pick(LAST)}`;
const uniqueEmail = (prefix) => `${prefix}-${_seq++}@${DEMO_DOMAIN}`;

// Split `total` across `n` slots proportional to random weights; sums to exactly total.
function weightedDistribute(total, n, lo = 0.6, hi = 1.4) {
  if (n <= 0) return [];
  const weights = Array.from({ length: n }, () => lo + Math.random() * (hi - lo));
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / sum) * total);
  const out = raw.map(Math.floor);
  let rem = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rem > 0; k++, rem--) out[order[k % n][1]]++;
  return out;
}

const now = new Date();
const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const preMonthEnd = new Date(monthStart.getTime() - 24 * 3600_000);
const historyStart = new Date(Date.UTC(now.getUTCFullYear() - 2, 0, 1)); // ~2 years before this year

function isoBetween(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString();
}
function businessTsBetween(start, end) {
  const d = new Date(isoBetween(start, end));
  const dow = d.getUTCDay();
  if (dow === 0) d.setUTCDate(d.getUTCDate() + 1);
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2);
  d.setUTCHours(randInt(9, 18), randInt(0, 59), 0, 0);
  return d.toISOString();
}
// Weekdays in [start, end] inclusive, YYYY-MM-DD.
function weekdaysInRange(start, end) {
  const out = [];
  const d = new Date(end);
  while (d >= start) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

async function insertAll(table, rows, opts = {}) {
  if (rows.length === 0) return [];
  const chunkSize = 500;
  const out = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    let q = admin.from(table).insert(chunk);
    if (opts.select) q = q.select(opts.select);
    const { data, error } = await q;
    if (error) throw new Error(`insert ${table}: ${error.message}`);
    if (opts.select && data) out.push(...data);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 0) Resolve the producer + wipe prior demo data (idempotent).
// ---------------------------------------------------------------------------
const { data: producer, error: pErr } = await admin
  .from("person")
  .select("id, full_name, email, is_producer")
  .ilike("email", PRODUCER_EMAIL)
  .maybeSingle();
if (pErr) throw pErr;
if (!producer) {
  console.error(`No person row for ${PRODUCER_EMAIL}. Run scripts/make-producer.mjs first.`);
  process.exit(1);
}
const PID = producer.id;
console.log(`Producer: ${producer.full_name} (${PID})`);

async function cleanup() {
  // Deleting leads cascades sale → issued_policy → deposit and contact_attempt.
  await admin.from("sales_lead").delete().eq("person_id", PID).ilike("email", `%@${DEMO_DOMAIN}`);
  await admin.from("tracker_entry").delete().eq("person_id", PID);
  await admin.from("clients").delete().eq("person_id", PID).eq("lead_vendor", "DEMO");
  console.log("Cleaned prior demo data for this producer.");
}
await cleanup();

if (process.argv.includes("--clean")) {
  console.log("\n✅ Producer demo data removed. Nothing re-seeded (--clean).");
  process.exit(0);
}

// ===========================================================================
// 1) PRODUCTION — sales summing to $100k YTD and $600k all-time.
//    Buckets: June (MTD) + Jan..May (rest of YTD) + 2 prior years (history).
// ===========================================================================
// Each bucket gets a pool of leads (received in-period); a subset close into
// sales. A high-activity producer works far more leads than they close, so
// leads >> sales — ~200 leads MTD with ~14 closing (~7% close rate).
const MTD = { leads: 200, count: 14, ap: 18_000_00, start: monthStart, end: now };
const YTD_REST = { leads: 1_000, count: 71, ap: 82_000_00, start: yearStart, end: preMonthEnd };
const HIST = { leads: 5_000, count: 415, ap: 500_000_00, start: historyStart, end: new Date(yearStart.getTime() - 24 * 3600_000) };

const insertedLeads = [];
const saleRows = [];
for (const b of [MTD, YTD_REST, HIST]) {
  const leadRows = Array.from({ length: b.leads }, () => ({
    person_id: PID,
    first_name: pick(FIRST),
    last_name: pick(LAST),
    email: uniqueEmail("lead"),
    phone: `555${randInt(1000000, 9999999)}`,
    state: pick(STATES),
    age: randInt(50, 80),
    received_at: businessTsBetween(b.start, b.end),
  }));
  const bucketLeads = await insertAll("sales_lead", leadRows, { select: "id, received_at" });
  insertedLeads.push(...bucketLeads);

  // Convert the first `count` leads of this bucket into sales, AP summing exactly.
  const aps = weightedDistribute(b.ap, b.count);
  for (let i = 0; i < b.count; i++) {
    const lead = bucketLeads[i];
    saleRows.push({
      person_id: PID,
      lead_id: lead.id,
      carrier: pick(CARRIERS),
      face_amount_cents: randInt(10_000, 25_000) * 100,
      monthly_premium_cents: Math.round(aps[i] / 12),
      annual_premium_cents: aps[i],
      beneficiary_name: fullName(),
      effective_date: lead.received_at.slice(0, 10),
      notes: "DEMO",
      created_at: lead.received_at,
    });
  }
}
const insertedSales = await insertAll("sale", saleRows, { select: "id, person_id, created_at" });

// Issued policies for ~78% of sales; deposits for ~70% of those.
const policyRows = insertedSales
  .filter(() => Math.random() < 0.78)
  .map((s) => ({
    person_id: PID,
    sale_id: s.id,
    policy_number: `POL${randInt(100000, 999999)}`,
    status: "issued",
    issued_at: s.created_at,
  }));
const insertedPolicies = await insertAll("issued_policy", policyRows, { select: "id, issued_at" });

const depositRows = insertedPolicies
  .filter(() => Math.random() < 0.7)
  .map((p) => ({
    person_id: PID,
    policy_id: p.id,
    amount_cents: randInt(150, 600) * 100,
    status: "received",
    received_at: p.issued_at,
  }));
await insertAll("deposit", depositRows);

const ytdAp = MTD.ap + YTD_REST.ap;
const allAp = ytdAp + HIST.ap;
console.log(
  `Production: ${insertedSales.length} sales — $${(ytdAp / 100).toLocaleString()} YTD AP, ` +
  `$${(allAp / 100).toLocaleString()} all-time AP; ${insertedPolicies.length} issued, ${depositRows.length} deposits.`,
);

// ===========================================================================
// 2) ACTIVITY — high dial volume in tracker_entry (one row per weekday).
//    Current-month slice keeps Today / WTD / MTD populated; the rest is history.
// ===========================================================================
function trackerRows(dates, totals) {
  if (dates.length === 0) return [];
  const cols = {};
  for (const k of Object.keys(totals)) cols[k] = weightedDistribute(totals[k], dates.length);
  return dates.map((date, i) => ({
    person_id: PID,
    entry_date: date,
    dials: cols.dials[i],
    contacts: cols.contacts[i],
    appointments: cols.appointments[i],
    presentations: cols.presentations[i],
    sales: cols.sales[i],
  }));
}

let monthWeekdays = weekdaysInRange(monthStart, now);
if (monthWeekdays.length === 0) monthWeekdays = [now.toISOString().slice(0, 10)];
const preMonthWeekdays = weekdaysInRange(historyStart, preMonthEnd);

const mtdTracker = trackerRows(monthWeekdays, {
  dials: 4_000, contacts: 430, appointments: 100, presentations: 80, sales: MTD.count,
});
// Pin today's dials so the "Today" card reads a clean ~350 instead of a
// distribution-dependent spike.
const todayKey = now.toISOString().slice(0, 10);
const todayRow = mtdTracker.find((r) => r.entry_date === todayKey);
if (todayRow) todayRow.dials = 350;
const histTracker = trackerRows(preMonthWeekdays, {
  dials: 86_000, contacts: 8_570, appointments: 2_100, presentations: 1_620,
  sales: YTD_REST.count + HIST.count,
});
await insertAll("tracker_entry", [...mtdTracker, ...histTracker]);
const allDials = 90_000;
console.log(
  `Activity: ${mtdTracker.length + histTracker.length} tracker days — ~${allDials.toLocaleString()} dials, ` +
  `~9k contacts, ~2.2k appts, ~1.7k presentations all-time.`,
);

// ===========================================================================
// 3) CONTACT ATTEMPTS — connected dials for the analytics heatmap.
// ===========================================================================
const attemptRows = Array.from({ length: 700 }, (_, i) => ({
  person_id: PID,
  lead_id: insertedLeads[rand(insertedLeads.length)].id,
  outcome: "connected",
  duration_sec: randInt(30, 600),
  created_at: i < 90 ? businessTsBetween(monthStart, now) : businessTsBetween(historyStart, preMonthEnd),
}));
await insertAll("contact_attempt", attemptRows);
console.log(`Contact attempts: ${attemptRows.length} connected dials seeded.`);

// ===========================================================================
// 4) CLIENTS — ~50 clients in the book.
// ===========================================================================
const clientRows = Array.from({ length: 50 }, () => {
  const carrier = pick(CARRIERS);
  const monthly = randInt(45, 110);
  return {
    person_id: PID,
    client_name: fullName(),
    state: pick(STATES),
    age: randInt(50, 80),
    phone: `555${randInt(1000000, 9999999)}`,
    email: uniqueEmail("client"),
    lead_vendor: "DEMO",
    policy_number: `POL${randInt(100000, 999999)}`,
    submit_date: businessTsBetween(historyStart, now).slice(0, 10),
    issue_date: businessTsBetween(historyStart, now).slice(0, 10),
    payor_name: fullName(),
    payment_method: Math.random() < 0.7 ? "bank_draft" : "credit_card",
    quotes: [{
      carrier,
      policy_type: pick(["Whole Life", "Term", "Final Expense", "IUL"]),
      coverage: `$${randInt(10, 25)}k`,
      premium: `$${monthly}/mo`,
    }],
    chosen_quote_index: 0,
    annual_premium: monthly * 12,
    sale_status: "sale",
  };
});
await insertAll("clients", clientRows);
console.log(`Clients: ${clientRows.length} clients added to the book.`);

console.log("\n✅ Producer demo data loaded for", PRODUCER_EMAIL);
console.log("   Cleanup only:  node --env-file=.env.local scripts/seed-producer-demo.mjs --clean");
