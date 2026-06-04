// Demo data seeder for a live walkthrough.
//
//   node --env-file=.env.local scripts/seed-demo.mjs
//
// Loads realistic-looking data into every demo surface, scoped to the real
// builder account (nicholasverge@gmail.com):
//   • Team performance — 15 producers under the builder, ~$130k team AP (MTD).
//   • Leaderboard       — those same producers rank by AP this month.
//   • Recruiting        — recruits parked at every funnel stage.
//   • Inbox             — message threads, some unread, several recruits flagged.
//   • Clients           — a book of dummy clients.
//   • Analytics         — the builder's own all-time funnel: ~1000 leads,
//                         ~20k dials, ~2.3k contacts, ~530 appts, ~430 pres,
//                         ~110 sales, ~$110k AP.
//
// EVERYTHING is tagged for easy cleanup and the script is idempotent — it wipes
// its own prior demo data first, then re-seeds. Fake humans use @demo.allstar.test
// emails; the builder's own seeded rows carry DEMO markers (lead emails, sale
// notes='DEMO', client lead_vendor='DEMO').

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with: node --env-file=.env.local scripts/seed-demo.mjs",
  );
  process.exit(1);
}

const BUILDER_EMAIL = "nicholasverge@gmail.com";
const DEMO_DOMAIN = "demo.allstar.test";

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const CARRIERS = [
  "American Amicable",
  "Americo",
  "Corebridge",
  "Ethos",
  "InstaBrain",
  "Mutual of Omaha",
  "Transamerica",
];
const STATES = ["AL", "TX", "FL", "GA", "NC", "SC", "TN", "OH", "MI", "LA", "MS", "VA"];
const FIRST = ["James","Mary","Robert","Patricia","John","Jennifer","Michael","Linda","David","Elizabeth","William","Barbara","Richard","Susan","Joseph","Jessica","Thomas","Karen","Chris","Nancy","Daniel","Lisa","Matthew","Sandra","Anthony","Ashley","Mark","Kimberly","Donald","Donna","Steven","Carol","Paul","Michelle","Andrew","Amanda","Josh","Melissa","Kevin","Deborah","Brian","Stephanie","George","Rebecca","Ed","Laura","Ron","Sharon","Tim","Cynthia"];
const LAST = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin","Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson","Walker","Young","Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores","Green","Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts"];

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const randInt = (min, max) => min + rand(max - min + 1);
let _nameSeq = 0;
function fullName() {
  return `${pick(FIRST)} ${pick(LAST)}`;
}
function uniqueEmail(prefix) {
  return `${prefix}-${_nameSeq++}@${DEMO_DOMAIN}`;
}

// Split `total` into `n` non-negative ints that sum to exactly `total`.
function distribute(total, n) {
  const base = Math.floor(total / n);
  let rem = total - base * n;
  return Array.from({ length: n }, () => base + (rem-- > 0 ? 1 : 0));
}
// Split `total` proportional to random weights; sums to exactly `total`.
function weightedDistribute(total, n, lo = 0.6, hi = 1.4) {
  const weights = Array.from({ length: n }, () => lo + Math.random() * (hi - lo));
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / sum) * total);
  const out = raw.map(Math.floor);
  let rem = total - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => [r - Math.floor(r), i])
    .sort((a, b) => b[0] - a[0]);
  for (let k = 0; rem > 0; k++, rem--) out[order[k % n][1]]++;
  return out;
}

const now = new Date();
const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const prevMonthEnd = new Date(monthStart.getTime() - 24 * 3600_000);
const historyStart = new Date(prevMonthEnd.getTime() - 180 * 24 * 3600_000);

function isoBetween(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString();
}
// random timestamp in the current month, up to "now"
const thisMonthTs = () => isoBetween(monthStart, now);
// random timestamp in the 6 months before this month (all-time history)
const historyTs = () => isoBetween(historyStart, prevMonthEnd);
// a connected-attempt timestamp landing on a weekday business hour in history
function historyBusinessTs() {
  const d = new Date(historyTs());
  const dow = d.getUTCDay();
  if (dow === 0) d.setUTCDate(d.getUTCDate() + 1);
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2);
  d.setUTCHours(randInt(9, 18), randInt(0, 59), 0, 0);
  return d.toISOString();
}
function weekdaysBefore(endDate, count) {
  const out = [];
  const d = new Date(endDate);
  while (out.length < count) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}
// Weekdays from `start`..`end` inclusive, YYYY-MM-DD, most-recent-first.
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
// A business-hour timestamp on a given YYYY-MM-DD.
function tsOnDate(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCHours(randInt(9, 18), randInt(0, 59), 0, 0);
  return d.toISOString();
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
// 0) Resolve the builder + wipe any prior demo data (idempotent).
// ---------------------------------------------------------------------------
const { data: builder, error: builderErr } = await admin
  .from("person")
  .select("id, full_name, email")
  .ilike("email", BUILDER_EMAIL)
  .maybeSingle();
if (builderErr) throw builderErr;
if (!builder) {
  console.error(`No person row for ${BUILDER_EMAIL}. Run scripts/make-builder.mjs first.`);
  process.exit(1);
}
const BUILDER_ID = builder.id;
console.log(`Builder: ${builder.full_name} (${BUILDER_ID})`);

async function cleanup() {
  // Fake humans (team + recruits) — delete their recruit rows first (FK RESTRICT),
  // then the person rows (cascades their producer/lead/client rows).
  const { data: demoPeople } = await admin
    .from("person")
    .select("id")
    .ilike("email", `%@${DEMO_DOMAIN}`);
  const demoIds = (demoPeople ?? []).map((p) => p.id);
  if (demoIds.length) {
    await admin.from("recruit").delete().in("person_id", demoIds);
    await admin.from("person").delete().in("id", demoIds);
  }
  // Builder's own seeded rows, by marker. Deleting the leads cascades their
  // sales → issued_policy → deposit and contact_attempt.
  await admin.from("sales_lead").delete().eq("person_id", BUILDER_ID).ilike("email", `%@${DEMO_DOMAIN}`);
  await admin.from("sale").delete().eq("person_id", BUILDER_ID).eq("notes", "DEMO");
  await admin.from("tracker_entry").delete().eq("person_id", BUILDER_ID);
  await admin.from("clients").delete().eq("person_id", BUILDER_ID).eq("lead_vendor", "DEMO");
  console.log(`Cleaned prior demo data (${demoIds.length} fake people).`);
}
await cleanup();

// `--clean` wipes the demo data and stops (no re-seed).
if (process.argv.includes("--clean")) {
  console.log("\n✅ Demo data removed. Nothing re-seeded (--clean).");
  process.exit(0);
}

// ===========================================================================
// 1) TEAM — 15 producers under the builder, VARIED AP this month.
//    Member totals are deliberately uneven ($40k top down to a few hundred);
//    the builder's own ~$16k MTD AP brings the team total to ~$130k.
// ===========================================================================
const MEMBER_AP = [
  40000, 21000, 14000, 9500, 7000, 5500, 4200, 3300, 2600, 2000, 1600, 1200, 900, 600, 400,
].map((d) => d * 100); // cents

const memberPeople = await insertAll(
  "person",
  MEMBER_AP.map(() => ({
    full_name: fullName(),
    email: uniqueEmail("producer"),
    upline_id: BUILDER_ID,
    is_builder: false,
    is_producer: true,
    status: "active",
  })),
  { select: "id, full_name" },
);

const teamLeads = [];
const teamTracker = [];
memberPeople.forEach((m, i) => {
  const apTarget = MEMBER_AP[i];
  const saleCount = Math.max(2, Math.round(apTarget / 200_000)); // ~$2k AP/sale
  const apPerSale = weightedDistribute(apTarget, saleCount);
  for (let s = 0; s < saleCount; s++) {
    teamLeads.push({
      person_id: m.id,
      first_name: pick(FIRST),
      last_name: pick(LAST),
      email: uniqueEmail("teamlead"),
      phone: `555${randInt(1000000, 9999999)}`,
      state: pick(STATES),
      age: randInt(50, 80),
      received_at: thisMonthTs(),
      _ap: apPerSale[s],
    });
  }
  // one tracker entry this month so the team activity columns aren't empty
  teamTracker.push({
    person_id: m.id,
    entry_date: now.toISOString().slice(0, 10),
    dials: randInt(120, 320),
    contacts: randInt(12, 34),
    appointments: randInt(3, 9),
    presentations: randInt(2, 7),
    sales: saleCount,
  });
});

const insertedTeamLeads = await insertAll(
  "sales_lead",
  teamLeads.map(({ _ap, ...row }) => row),
  { select: "id, person_id" },
);
const teamSales = insertedTeamLeads.map((lead, idx) => ({
  person_id: lead.person_id,
  lead_id: lead.id,
  carrier: pick(CARRIERS),
  face_amount_cents: randInt(10_000, 25_000) * 100,
  monthly_premium_cents: Math.round(teamLeads[idx]._ap / 12),
  annual_premium_cents: teamLeads[idx]._ap,
  beneficiary_name: fullName(),
  effective_date: thisMonthTs().slice(0, 10),
  notes: "DEMO",
  created_at: thisMonthTs(),
}));
const insertedTeamSales = await insertAll("sale", teamSales, { select: "id, person_id" });
await insertAll("tracker_entry", teamTracker);

// Issued policies + deposits for ~60% of team sales so IP/Policies/Deposits show.
const teamPolicies = [];
insertedTeamSales.forEach((sale) => {
  if (Math.random() < 0.6) {
    teamPolicies.push({
      person_id: sale.person_id,
      sale_id: sale.id,
      policy_number: `POL${randInt(100000, 999999)}`,
      status: "issued",
      issued_at: thisMonthTs(),
    });
  }
});
const insertedTeamPolicies = await insertAll("issued_policy", teamPolicies, { select: "id, person_id" });
const teamDeposits = insertedTeamPolicies
  .filter(() => Math.random() < 0.7)
  .map((p) => ({
    person_id: p.person_id,
    policy_id: p.id,
    amount_cents: randInt(150, 600) * 100,
    status: "received",
    received_at: thisMonthTs(),
  }));
await insertAll("deposit", teamDeposits);
const teamTotal = MEMBER_AP.reduce((a, b) => a + b, 0);
console.log(
  `Team: 15 producers, ${insertedTeamSales.length} sales = $${Math.round(teamTotal / 100).toLocaleString()} AP (MTD), varied.`,
);

// ===========================================================================
// 2) RECRUITING — 250 recruits scattered across every funnel stage.
// ===========================================================================
// Exam dates: scheduled/studying recruits sit a few days out; anyone who has
// already taken it has a date in the recent past.
const futureExamDate = () => isoBetween(now, new Date(now.getTime() + 14 * 864e5)).slice(0, 10);
const pastExamDate = () => historyTs().slice(0, 10);

// The progress fields that place a recruit at each derived funnel stage.
function recruitFields(kind) {
  switch (kind) {
    case "signed_up":
      return { phase: pick(["interview", "licensing"]), phase_step: null };
    case "watched_video":
      return { phase: "licensing", phase_step: null, guide_read_at: historyTs() };
    case "scheduled_exam":
      return {
        phase: "licensing",
        phase_step: "exam_scheduled",
        guide_read_at: historyTs(),
        exam_date: futureExamDate(),
      };
    case "studying":
      return { phase: "licensing", phase_step: "studying", guide_read_at: historyTs(), exam_date: futureExamDate() };
    case "passed_exam":
      return { phase: "licensing", phase_step: "exam_passed", guide_read_at: historyTs(), exam_date: pastExamDate() };
    case "failed_exam":
      return {
        phase: "licensing",
        phase_step: "studying",
        guide_read_at: historyTs(),
        exam_date: pastExamDate(),
        exam_failures: randInt(1, 2),
      };
    case "license_pending":
      return {
        phase: "licensing",
        phase_step: "exam_passed",
        guide_read_at: historyTs(),
        exam_date: pastExamDate(),
        licensing_submitted_at: historyTs(),
      };
    case "license_approved":
      return { phase: "onboarding", phase_step: "training", exam_date: pastExamDate() };
    case "contracting":
      return { phase: "onboarding", phase_step: "contracting", exam_date: pastExamDate() };
    case "in_bootcamp":
      return { phase: "bootcamp", phase_step: "active", exam_date: pastExamDate(), bootcamp_started_at: pastExamDate() };
    case "passed_bootcamp":
      return { phase: "graduated", phase_step: null, exam_date: pastExamDate() };
    case "failed_bootcamp":
      return {
        phase: "bootcamp",
        phase_step: "active",
        exam_date: pastExamDate(),
        bootcamp_started_at: historyTs().slice(0, 10),
        flagged: true,
        flag_reason: "Behind 8-in-28 pace",
      };
  }
}

// Funnel-shaped counts (widest at the top), summing to 250.
const FUNNEL_COUNTS = [
  ["signed_up", 70],
  ["watched_video", 38],
  ["scheduled_exam", 24],
  ["studying", 22],
  ["passed_exam", 13],
  ["failed_exam", 16],
  ["license_pending", 12],
  ["license_approved", 14],
  ["contracting", 11],
  ["in_bootcamp", 12],
  ["passed_bootcamp", 6],
  ["failed_bootcamp", 12],
];

const recruitSpecs = [];
for (const [kind, count] of FUNNEL_COUNTS) {
  for (let k = 0; k < count; k++) recruitSpecs.push({ kind, ...recruitFields(kind) });
}
// Flag ~15 more recruits at random (beyond the failed-bootcamp ones).
const FLAG_REASONS = [
  "No contact in 7 days",
  "Missed exam date",
  "Behind on study plan",
  "Stalled in contracting",
  "Needs licensing follow-up",
];
let extraFlags = 15;
for (const spec of recruitSpecs) {
  if (extraFlags <= 0) break;
  if (!spec.flagged && Math.random() < 0.12) {
    spec.flagged = true;
    spec.flag_reason = pick(FLAG_REASONS);
    extraFlags--;
  }
}

const recruitPeople = await insertAll(
  "person",
  recruitSpecs.map(() => ({
    full_name: fullName(),
    email: uniqueEmail("recruit"),
    upline_id: BUILDER_ID,
    is_builder: false,
    is_producer: false,
    status: "active",
  })),
  { select: "id" },
);

const recruitRows = recruitSpecs.map((spec, i) => ({
  person_id: recruitPeople[i].id,
  builder_id: BUILDER_ID,
  phone: `(${randInt(200, 989)}) ${randInt(200, 989)}-${String(randInt(0, 9999)).padStart(4, "0")}`,
  state: pick(STATES),
  phase: spec.phase,
  phase_step: spec.phase_step ?? null,
  exam_date: spec.exam_date ?? null,
  bootcamp_started_at: spec.bootcamp_started_at ?? null,
  guide_read_at: spec.guide_read_at ?? null,
  licensing_submitted_at: spec.licensing_submitted_at ?? null,
  exam_failures: spec.exam_failures ?? 0,
  flagged: spec.flagged ?? false,
  flag_reason: spec.flag_reason ?? null,
  created_at: historyTs(),
}));
const insertedRecruits = await insertAll("recruit", recruitRows, { select: "id, person_id" });
const totalFlagged = recruitSpecs.filter((s) => s.flagged).length;
console.log(
  `Recruiting: ${insertedRecruits.length} recruits scattered across every funnel stage (${totalFlagged} flagged).`,
);

// ===========================================================================
// 3) INBOX — message threads; some unread (recruit sent last), several flagged.
// ===========================================================================
const RECRUIT_LINES = [
  "Hey! Just finished the first training video.",
  "Quick question on the licensing course — do I need to pay for the exam separately?",
  "Booked my exam for next week 🙏",
  "I passed!! 🎉",
  "Struggling a bit with the practice tests, any tips?",
  "Submitted my license application today.",
  "When does bootcamp start?",
  "Got my first appointment booked!",
];
const BUILDER_LINES = [
  "Welcome aboard — proud to have you!",
  "Great work, keep that momentum going.",
  "Let me know if you hit any snags, I'm here.",
  "Crushing it 💪 talk soon.",
];

const messages = [];
let threads = 0;
const MAX_THREADS = 36;
insertedRecruits.forEach((r, i) => {
  if (threads >= MAX_THREADS) return;
  // Prioritise flagged recruits (so the flag icon shows in the inbox), plus a
  // spread of others.
  const wantThread = recruitSpecs[i].flagged || i % 7 === 0;
  if (!wantThread) return;
  threads++;
  const turns = randInt(2, 4);
  const base = now.getTime() - randInt(1, 6) * 24 * 3600_000;
  for (let t = 0; t < turns; t++) {
    const fromRecruit = t % 2 === 0;
    messages.push({
      recruit_id: r.id,
      sender_person_id: fromRecruit ? r.person_id : BUILDER_ID,
      body: fromRecruit ? pick(RECRUIT_LINES) : pick(BUILDER_LINES),
      is_ai: false,
      channel: "builder",
      created_at: new Date(base + t * 3600_000).toISOString(),
    });
  }
  // Half the threads end on the recruit's message => unread for the builder.
  if (threads % 2 === 0) {
    messages.push({
      recruit_id: r.id,
      sender_person_id: r.person_id,
      body: pick(RECRUIT_LINES),
      is_ai: false,
      channel: "builder",
      created_at: new Date(base + turns * 3600_000).toISOString(),
    });
  }
});
await insertAll("message", messages);
console.log(`Inbox: ${messages.length} messages across ${threads} threads; ${totalFlagged} recruits flagged.`);

// ===========================================================================
// 4) CLIENTS — a book of dummy clients for the builder.
// ===========================================================================
const clients = [];
for (let i = 0; i < 24; i++) {
  const carrier = pick(CARRIERS);
  const monthly = randInt(45, 110);
  const annual = monthly * 12;
  clients.push({
    person_id: BUILDER_ID,
    client_name: fullName(),
    state: pick(STATES),
    age: randInt(50, 80),
    phone: `555${randInt(1000000, 9999999)}`,
    email: uniqueEmail("client"),
    lead_vendor: "DEMO",
    policy_number: `POL${randInt(100000, 999999)}`,
    submit_date: historyTs().slice(0, 10),
    issue_date: historyTs().slice(0, 10),
    payor_name: fullName(),
    payment_method: Math.random() < 0.7 ? "bank_draft" : "credit_card",
    quotes: [
      {
        carrier,
        policy_type: pick(["Whole Life", "Term", "Final Expense", "IUL"]),
        coverage: `$${randInt(10, 25)}k`,
        premium: `$${monthly}/mo`,
      },
    ],
    chosen_quote_index: 0,
    annual_premium: annual,
    sale_status: "sale",
    created_at: historyTs(),
  });
}
await insertAll("clients", clients);
console.log(`Clients: ${clients.length} dummy clients added.`);

// ===========================================================================
// 5) ANALYTICS — the builder's own funnel.
//    All-time totals: ~1000 leads, ~20k dials, ~2.3k contacts, ~530 appts,
//    ~430 pres, ~110 sales, ~$110k AP. A slice of every metric lands in the
//    CURRENT month / week / today so the Today, WTD and MTD timeframes show
//    real data too (the MTD AP also feeds the ~$130k team total).
// ===========================================================================
const LEAD_COUNT = 1000;
const SALE_COUNT = 110;
const AP_TOTAL_CENTS = 110_000 * 100;
const MTD_SALE_COUNT = 8;
const MTD_AP_CENTS = 16_000 * 100;
const MTD_LEADS = 70;

// Weekdays this month up to today (today first); fall back to today if empty.
let monthWeekdays = weekdaysInRange(monthStart, now);
if (monthWeekdays.length === 0) monthWeekdays = [now.toISOString().slice(0, 10)];
const recentTs = () => tsOnDate(pick(monthWeekdays));

// 5a) Leads — first MTD_LEADS land in the current month, rest in history.
const myLeads = Array.from({ length: LEAD_COUNT }, (_, i) => ({
  person_id: BUILDER_ID,
  first_name: pick(FIRST),
  last_name: pick(LAST),
  email: uniqueEmail("lead"),
  phone: `555${randInt(1000000, 9999999)}`,
  state: pick(STATES),
  age: randInt(50, 80),
  received_at: i < MTD_LEADS ? recentTs() : historyTs(),
}));
const insertedMyLeads = await insertAll("sales_lead", myLeads, { select: "id" });

// 5b) Sales (110) — 8 this month ($16k AP), 102 in history ($94k), each tied to
//     a lead, AP summing to exactly $110k.
const mtdApPer = weightedDistribute(MTD_AP_CENTS, MTD_SALE_COUNT);
const histApPer = weightedDistribute(AP_TOTAL_CENTS - MTD_AP_CENTS, SALE_COUNT - MTD_SALE_COUNT);
const saleAps = [...mtdApPer, ...histApPer];
const mySales = saleAps.map((ap, i) => {
  const recent = i < MTD_SALE_COUNT;
  return {
    person_id: BUILDER_ID,
    lead_id: insertedMyLeads[i].id,
    carrier: pick(CARRIERS),
    face_amount_cents: randInt(10_000, 25_000) * 100,
    monthly_premium_cents: Math.round(ap / 12),
    annual_premium_cents: ap,
    beneficiary_name: fullName(),
    effective_date: (recent ? recentTs() : historyTs()).slice(0, 10),
    notes: "DEMO",
    created_at: recent ? recentTs() : historyTs(),
  };
});
const insertedMySales = await insertAll("sale", mySales, { select: "id, created_at" });

// 5c) Issued policies for ~75% of sales (gives analytics IP a value), dated
//     near their sale so recent ones stay in-period.
const myPolicies = insertedMySales
  .filter(() => Math.random() < 0.75)
  .map((s) => {
    const recent = new Date(s.created_at) >= monthStart;
    return {
      person_id: BUILDER_ID,
      sale_id: s.id,
      policy_number: `POL${randInt(100000, 999999)}`,
      status: "issued",
      issued_at: recent ? recentTs() : historyTs(),
    };
  });
const insertedMyPolicies = await insertAll("issued_policy", myPolicies, { select: "id, issued_at" });

// 5d) Deposits for ~70% of issued policies.
const myDeposits = insertedMyPolicies
  .filter(() => Math.random() < 0.7)
  .map((p) => {
    const recent = new Date(p.issued_at) >= monthStart;
    return {
      person_id: BUILDER_ID,
      policy_id: p.id,
      amount_cents: randInt(150, 600) * 100,
      status: "received",
      received_at: recent ? recentTs() : historyTs(),
    };
  });
await insertAll("deposit", myDeposits);

// 5e) Tracker entries — split the dials/contacts/appts/pres/sales funnel into a
//     current-month slice (so Today/WTD/MTD populate) and a historical slice,
//     each summing to its share so the all-time totals stay exact.
function trackerRows(dates, totals) {
  const cols = {};
  for (const k of Object.keys(totals)) cols[k] = weightedDistribute(totals[k], dates.length);
  return dates.map((date, i) => ({
    person_id: BUILDER_ID,
    entry_date: date,
    dials: cols.dials[i],
    contacts: cols.contacts[i],
    appointments: cols.appointments[i],
    presentations: cols.presentations[i],
    sales: cols.sales[i],
  }));
}
const HIST_DAYS = 86;
const histDates = weekdaysBefore(prevMonthEnd, HIST_DAYS);
const mtdTracker = trackerRows(monthWeekdays, {
  dials: 900,
  contacts: 110,
  appointments: 26,
  presentations: 22,
  sales: MTD_SALE_COUNT,
});
const histTracker = trackerRows(histDates, {
  dials: 20_000 - 900,
  contacts: 2_300 - 110,
  appointments: 530 - 26,
  presentations: 430 - 22,
  sales: SALE_COUNT - MTD_SALE_COUNT,
});
await insertAll("tracker_entry", [...mtdTracker, ...histTracker]);

// 5f) Connected contact attempts — populates the analytics heatmap; ~70 recent.
const attempts = Array.from({ length: 450 }, (_, i) => ({
  person_id: BUILDER_ID,
  lead_id: insertedMyLeads[rand(LEAD_COUNT)].id,
  outcome: "connected",
  duration_sec: randInt(30, 600),
  created_at: i < 70 ? recentTs() : historyBusinessTs(),
}));
await insertAll("contact_attempt", attempts);

console.log(
  `Analytics: ${LEAD_COUNT} leads, 20k dials, 2.3k contacts, 530 appts, 430 pres, ${SALE_COUNT} sales = $110k AP (all-time); ${MTD_SALE_COUNT} sales / $${MTD_AP_CENTS / 100} AP this month.`,
);

console.log("\n✅ Demo data loaded. Re-run any time — it wipes its own data first.");
console.log("   Cleanup only:  node --env-file=.env.local scripts/seed-demo.mjs --clean");
