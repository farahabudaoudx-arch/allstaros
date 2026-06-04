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
// 1) TEAM — 15 producers under the builder, ~$130k AP this month.
// ===========================================================================
const TEAM_AP_TOTAL_CENTS = 130_000 * 100;
const memberAp = distribute(TEAM_AP_TOTAL_CENTS, 15);

const memberPeople = await insertAll(
  "person",
  memberAp.map(() => ({
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
const teamSales = [];
const teamTracker = [];
memberPeople.forEach((m, i) => {
  const apTarget = memberAp[i];
  const saleCount = Math.max(3, Math.round(apTarget / 100_000)); // ~$1k AP/sale
  const apPerSale = distribute(apTarget, saleCount);
  // one lead per sale
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
      _memberIdx: i,
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
  teamLeads.map(({ _memberIdx, _ap, ...row }) => row),
  { select: "id, person_id" },
);
// Map inserted leads back to their member + AP (order is preserved per chunk,
// but be safe: pair by index since we inserted in the same order).
insertedTeamLeads.forEach((lead, idx) => {
  const src = teamLeads[idx];
  const monthly = Math.round(src._ap / 12);
  teamSales.push({
    person_id: lead.person_id,
    lead_id: lead.id,
    carrier: pick(CARRIERS),
    face_amount_cents: randInt(10_000, 25_000) * 100,
    monthly_premium_cents: monthly,
    annual_premium_cents: src._ap,
    beneficiary_name: fullName(),
    effective_date: thisMonthTs().slice(0, 10),
    notes: "DEMO",
    created_at: thisMonthTs(),
  });
});
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
console.log(`Team: 15 producers, ${insertedTeamSales.length} sales = $130k AP (MTD).`);

// ===========================================================================
// 2) RECRUITING — one recruit parked at every funnel stage.
// ===========================================================================
const RECRUIT_SPECS = [
  { stage: "Signed Up", phase: "licensing", phase_step: null },
  { stage: "Signed Up", phase: "interview", phase_step: null },
  { stage: "Watched 1st Video", phase: "licensing", phase_step: null, guide_read_at: historyTs() },
  { stage: "Scheduled Exam", phase: "licensing", phase_step: "exam_scheduled", guide_read_at: historyTs(), exam_date: now.toISOString().slice(0, 10) },
  { stage: "Studying", phase: "licensing", phase_step: "studying", guide_read_at: historyTs() },
  { stage: "Failed Exam", phase: "licensing", phase_step: "studying", guide_read_at: historyTs(), exam_failures: 1, flagged: true, flag_reason: "Failed first exam attempt" },
  { stage: "Passed Exam", phase: "licensing", phase_step: "exam_passed", guide_read_at: historyTs() },
  { stage: "License Pending", phase: "licensing", phase_step: "exam_passed", guide_read_at: historyTs(), licensing_submitted_at: historyTs() },
  { stage: "License Approved", phase: "onboarding", phase_step: "training" },
  { stage: "Contracting", phase: "onboarding", phase_step: "contracting" },
  { stage: "In Bootcamp", phase: "bootcamp", phase_step: "active", bootcamp_started_at: now.toISOString().slice(0, 10) },
  { stage: "In Bootcamp", phase: "bootcamp", phase_step: "active", bootcamp_started_at: now.toISOString().slice(0, 10) },
  { stage: "Failed Bootcamp", phase: "bootcamp", phase_step: "active", bootcamp_started_at: historyTs().slice(0, 10), flagged: true, flag_reason: "Behind 8-in-28 pace" },
  { stage: "Passed Bootcamp", phase: "graduated", phase_step: null },
];

const recruitPeople = await insertAll(
  "person",
  RECRUIT_SPECS.map(() => ({
    full_name: fullName(),
    email: uniqueEmail("recruit"),
    upline_id: BUILDER_ID,
    is_builder: false,
    is_producer: false,
    status: "active",
  })),
  { select: "id, full_name" },
);

const recruitRows = RECRUIT_SPECS.map((spec, i) => ({
  person_id: recruitPeople[i].id,
  builder_id: BUILDER_ID,
  phase: spec.phase,
  phase_step: spec.phase_step,
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
console.log(`Recruiting: ${insertedRecruits.length} recruits across every funnel stage.`);

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
insertedRecruits.forEach((r, i) => {
  // give ~9 of the recruits a conversation
  if (i % 14 >= 9) return;
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
  if (i % 2 === 0) {
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
const flaggedCount = RECRUIT_SPECS.filter((s) => s.flagged).length;
console.log(`Inbox: ${messages.length} messages seeded; ${flaggedCount} recruits flagged.`);

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
// 5) ANALYTICS — the builder's own all-time funnel.
//    ~1000 leads, ~20k dials, ~2.3k contacts, ~530 appts, ~430 pres,
//    ~110 sales, ~$110k AP.  All dated BEFORE this month so team MTD stays clean.
// ===========================================================================
const LEAD_COUNT = 1000;
const SALE_COUNT = 110;
const AP_TOTAL_CENTS = 110_000 * 100;

// 5a) Leads
const myLeads = Array.from({ length: LEAD_COUNT }, () => ({
  person_id: BUILDER_ID,
  first_name: pick(FIRST),
  last_name: pick(LAST),
  email: uniqueEmail("lead"),
  phone: `555${randInt(1000000, 9999999)}`,
  state: pick(STATES),
  age: randInt(50, 80),
  received_at: historyTs(),
}));
const insertedMyLeads = await insertAll("sales_lead", myLeads, { select: "id" });

// 5b) Sales (110), each tied to a lead, AP summing to exactly $110k.
const apPerSale = weightedDistribute(AP_TOTAL_CENTS, SALE_COUNT);
const mySales = apPerSale.map((ap, i) => ({
  person_id: BUILDER_ID,
  lead_id: insertedMyLeads[i].id,
  carrier: pick(CARRIERS),
  face_amount_cents: randInt(10_000, 25_000) * 100,
  monthly_premium_cents: Math.round(ap / 12),
  annual_premium_cents: ap,
  beneficiary_name: fullName(),
  effective_date: historyTs().slice(0, 10),
  notes: "DEMO",
  created_at: historyTs(),
}));
const insertedMySales = await insertAll("sale", mySales, { select: "id" });

// 5c) Issued policies for ~80 of them (gives the analytics IP a value).
const myPolicies = insertedMySales
  .filter(() => Math.random() < 0.75)
  .map((s) => ({
    person_id: BUILDER_ID,
    sale_id: s.id,
    policy_number: `POL${randInt(100000, 999999)}`,
    status: "issued",
    issued_at: historyTs(),
  }));
const insertedMyPolicies = await insertAll("issued_policy", myPolicies, { select: "id" });

// 5d) Deposits for ~70% of issued policies.
const myDeposits = insertedMyPolicies
  .filter(() => Math.random() < 0.7)
  .map((p) => ({
    person_id: BUILDER_ID,
    policy_id: p.id,
    amount_cents: randInt(150, 600) * 100,
    status: "received",
    received_at: historyTs(),
  }));
await insertAll("deposit", myDeposits);

// 5e) Tracker entries — the dials/contacts/appointments/presentations/sales
//     funnel, spread across 90 historical weekdays, summing to the targets.
const DAYS = 90;
const trackerDates = weekdaysBefore(prevMonthEnd, DAYS);
const dialsBy = weightedDistribute(20_000, DAYS);
const contactsBy = weightedDistribute(2_300, DAYS);
const apptsBy = weightedDistribute(530, DAYS);
const presBy = weightedDistribute(430, DAYS);
const salesBy = distribute(SALE_COUNT, DAYS);
const myTracker = trackerDates.map((date, i) => ({
  person_id: BUILDER_ID,
  entry_date: date,
  dials: dialsBy[i],
  contacts: contactsBy[i],
  appointments: apptsBy[i],
  presentations: presBy[i],
  sales: salesBy[i],
}));
await insertAll("tracker_entry", myTracker);

// 5f) Connected contact attempts — populates the analytics heatmap.
const attempts = Array.from({ length: 450 }, () => ({
  person_id: BUILDER_ID,
  lead_id: insertedMyLeads[rand(LEAD_COUNT)].id,
  outcome: "connected",
  duration_sec: randInt(30, 600),
  created_at: historyBusinessTs(),
}));
await insertAll("contact_attempt", attempts);

console.log(
  `Analytics: ${LEAD_COUNT} leads, 20k dials, 2.3k contacts, 530 appts, 430 pres, ${SALE_COUNT} sales = $110k AP (all-time).`,
);

console.log("\n✅ Demo data loaded. Re-run any time — it wipes its own data first.");
console.log("   Cleanup only:  node --env-file=.env.local scripts/seed-demo.mjs --clean");
