// Synthetic scale seeder for performance work on the PREVIEW database only.
//
// Mimics production-shaped load (large builder downline + fat client book)
// without touching production or copying real client PII.
//
// Prerequisites:
//   1. Preview DB migrations applied
//   2. Dev users seeded:  node --env-file=.env.local scripts/seed-dev-users.mjs
//
// Usage:
//   node --env-file=.env.local scripts/seed-perf-load.mjs
//   node --env-file=.env.local scripts/seed-perf-load.mjs --profile=medium
//   node --env-file=.env.local scripts/seed-perf-load.mjs --profile=heavy
//   node --env-file=.env.local scripts/seed-perf-load.mjs --clean
//
// Sign in as builder@allstar.test afterward and hit /producer + /producer/team.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUILDER_EMAIL = process.env.SCALE_SEED_BUILDER_EMAIL ?? "builder@allstar.test";
const DEMO_DOMAIN = "scale.allstar.test";
const LEAD_VENDOR = "SCALE_SEED";

// Hard gate: refuse anything that is not the known preview project unless
// SCALE_SEED_PROJECT_REF / --force-url is set. Never point this at production.
const ALLOWED_REF =
  process.env.SCALE_SEED_PROJECT_REF ?? "oyuqwuvewyntnxfboutd";
const forceUrl = process.argv.includes("--force-url");

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with: node --env-file=.env.local scripts/seed-perf-load.mjs",
  );
  process.exit(1);
}

if (!url.includes(ALLOWED_REF) && !forceUrl) {
  console.error(
    [
      "Refusing to seed: Supabase URL is not the allowed preview project.",
      `  url: ${url}`,
      `  expected ref substring: ${ALLOWED_REF}`,
      "Set SCALE_SEED_PROJECT_REF or pass --force-url only if you are sure this is staging.",
    ].join("\n"),
  );
  process.exit(1);
}

const PROFILES = {
  // Enough to feel RLS cost without a long seed.
  light: { l1: 4, perL1: 8, perL2: 3, clientsPerPerson: 3, trackerDays: 8, activeTeam: 20 },
  // Noticeable slowdown on old RLS for most machines.
  medium: { l1: 8, perL1: 10, perL2: 4, clientsPerPerson: 5, trackerDays: 15, activeTeam: 35 },
  // Roughly submission-shaped (~700 people, ~3k+ clients).
  heavy: { l1: 10, perL1: 10, perL2: 6, clientsPerPerson: 5, trackerDays: 20, activeTeam: 45 },
};

const profileArg = (process.argv.find((a) => a.startsWith("--profile=")) ?? "").split("=")[1];
const profileName = profileArg && PROFILES[profileArg] ? profileArg : "heavy";
const profile = PROFILES[profileName];

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const FIRST = [
  "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda",
  "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
  "Thomas", "Karen", "Chris", "Nancy", "Daniel", "Lisa", "Matthew", "Sandra",
  "Anthony", "Ashley", "Mark", "Kimberly", "Steven", "Carol", "Paul", "Michelle",
];
const LAST = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Wilson", "Anderson", "Thomas",
  "Taylor", "Moore", "Jackson", "Martin", "Lee", "Thompson", "White", "Harris",
  "Clark", "Lewis", "Walker", "Hall", "Allen", "Young", "King", "Wright", "Scott",
];
const STATES = ["AL", "TX", "FL", "GA", "NC", "SC", "TN", "OH", "MI", "LA", "MS", "VA", "CA", "NY"];

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const randInt = (min, max) => min + rand(max - min + 1);

let seq = 0;
function uniqueEmail(prefix) {
  return `${prefix}-${seq++}@${DEMO_DOMAIN}`;
}
function fullName() {
  return `${pick(FIRST)} ${pick(LAST)}`;
}

const now = new Date();
const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const ytdStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}
function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function randomDayBetween(start, end) {
  const t = start.getTime() + Math.random() * Math.max(1, end.getTime() - start.getTime());
  return new Date(t);
}
function weekdaysBack(from, count) {
  const out = [];
  const d = new Date(from.getTime());
  while (out.length < count) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(isoDay(d));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

async function insertAll(table, rows, opts = {}) {
  if (!rows.length) return [];
  const chunkSize = opts.chunkSize ?? 200;
  const out = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    let q;
    if (opts.upsert) {
      q = admin.from(table).upsert(chunk, { onConflict: opts.upsert });
    } else {
      q = admin.from(table).insert(chunk);
    }
    if (opts.select) q = q.select(opts.select);
    const { data, error } = await q;
    if (error) throw new Error(`${opts.upsert ? "upsert" : "insert"} ${table} @${i}: ${error.message}`);
    if (opts.select && data) out.push(...data);
    if ((i / chunkSize) % 10 === 0) {
      process.stdout.write(`  ${table}: ${Math.min(i + chunk.length, rows.length)}/${rows.length}\r`);
    }
  }
  if (rows.length > chunkSize) process.stdout.write("\n");
  return out;
}

async function deleteInChunks(table, column, ids) {
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { error } = await admin.from(table).delete().in(column, chunk);
    if (error) throw new Error(`delete ${table}: ${error.message}`);
  }
}

async function cleanup() {
  console.log("Cleaning prior SCALE_SEED rows…");
  const { data: demoPeople, error } = await admin
    .from("person")
    .select("id, upline_id, email")
    .ilike("email", `%@${DEMO_DOMAIN}`);
  if (error) throw error;
  const demoIds = (demoPeople ?? []).map((p) => p.id);
  if (!demoIds.length) {
    console.log("  nothing to clean.");
    return;
  }

  // Builder-owned SCALE clients (builder email is real, not @scale).
  const { data: builder } = await admin
    .from("person")
    .select("id")
    .ilike("email", BUILDER_EMAIL)
    .maybeSingle();
  if (builder?.id) {
    const { data: builderClients } = await admin
      .from("clients")
      .select("id")
      .eq("person_id", builder.id)
      .eq("lead_vendor", LEAD_VENDOR);
    const cids = (builderClients ?? []).map((c) => c.id);
    if (cids.length) {
      await deleteInChunks("client_deposits", "client_id", cids);
      await deleteInChunks("clients", "id", cids);
    }
  }

  await deleteInChunks("client_deposits", "person_id", demoIds);
  await deleteInChunks("clients", "person_id", demoIds);
  await deleteInChunks("tracker_entry", "person_id", demoIds);
  await deleteInChunks("recruit", "person_id", demoIds);

  // upline_id RESTRICT — delete deepest leaves first (people with no children
  // among the scale set), repeat until empty.
  let remaining = new Set(demoIds);
  const uplineOf = new Map((demoPeople ?? []).map((p) => [p.id, p.upline_id]));
  let guard = 0;
  while (remaining.size && guard++ < 50) {
    const children = new Set();
    for (const id of remaining) {
      const up = uplineOf.get(id);
      if (up && remaining.has(up)) children.add(up);
    }
    const leaves = [...remaining].filter((id) => !children.has(id));
    if (!leaves.length) {
      // Cycle or self-ref — force delete remaining.
      await deleteInChunks("person", "id", [...remaining]);
      break;
    }
    await deleteInChunks("person", "id", leaves);
    for (const id of leaves) remaining.delete(id);
  }
  console.log(`  removed ${demoIds.length} scale people.`);
}

async function seedBuilderBook(builderId) {
  // Wipe prior SCALE clients + their deposits for the builder only.
  const { data: old } = await admin
    .from("clients")
    .select("id")
    .eq("person_id", builderId)
    .eq("lead_vendor", LEAD_VENDOR);
  const oldIds = (old ?? []).map((c) => c.id);
  if (oldIds.length) {
    await deleteInChunks("client_deposits", "client_id", oldIds);
    await deleteInChunks("clients", "id", oldIds);
  }

  const builderClients = 80;
  const clientRows = [];
  for (let i = 0; i < builderClients; i++) {
    const submit = randomDayBetween(monthStart, now);
    const issued = Math.random() < 0.55;
    const premium = randInt(800, 4500);
    clientRows.push({
      person_id: builderId,
      client_name: fullName(),
      email: uniqueEmail("bclient"),
      state: pick(STATES),
      age: randInt(50, 78),
      lead_vendor: LEAD_VENDOR,
      sale_status: "sale",
      annual_premium: premium,
      submit_date: isoDay(submit),
      date: isoDay(submit),
      issue_date: issued ? isoDay(addDays(submit, randInt(5, 25))) : null,
    });
  }
  const inserted = await insertAll("clients", clientRows, { select: "id, person_id, annual_premium, issue_date" });
  const deposits = inserted
    .filter((c) => c.issue_date && Math.random() < 0.7)
    .map((c) => ({
      person_id: builderId,
      client_id: c.id,
      issue_date: c.issue_date,
      estimated_amount: Number(c.annual_premium) / 12,
      actual_amount: Number(c.annual_premium) / 12,
      status: "successful",
      notes: LEAD_VENDOR,
      updated_at: randomDayBetween(monthStart, now).toISOString(),
    }));
  await insertAll("client_deposits", deposits);

  const days = weekdaysBack(now, profile.trackerDays);
  const tracker = days.map((entry_date) => ({
    person_id: builderId,
    entry_date,
    leads: randInt(5, 25),
    dials: randInt(40, 180),
    contacts: randInt(8, 40),
    appointments: randInt(1, 10),
    presentations: randInt(1, 8),
    sales: randInt(0, 3),
  }));
  // Upsert-friendly: delete overlapping dates then insert.
  await admin.from("tracker_entry").delete().eq("person_id", builderId).in("entry_date", days);
  await insertAll("tracker_entry", tracker, { upsert: "person_id,entry_date" });
  console.log(`  builder book: ${inserted.length} clients, ${deposits.length} deposits, ${tracker.length} tracker days`);
}

async function main() {
  console.log(`Target: ${url}`);
  console.log(`Profile: ${profileName}`, profile);
  console.log(`Builder: ${BUILDER_EMAIL}`);

  const { data: builder, error: builderErr } = await admin
    .from("person")
    .select("id, full_name, email, is_builder")
    .ilike("email", BUILDER_EMAIL)
    .maybeSingle();
  if (builderErr) throw builderErr;
  if (!builder) {
    console.error(
      `No person for ${BUILDER_EMAIL}. Run: node --env-file=.env.local scripts/seed-dev-users.mjs`,
    );
    process.exit(1);
  }
  if (!builder.is_builder) {
    console.error(`${BUILDER_EMAIL} is not flagged is_builder.`);
    process.exit(1);
  }

  await cleanup();
  if (process.argv.includes("--clean")) {
    console.log("Done (--clean only).");
    return;
  }

  console.log("Seeding downline tree…");
  // L1 managers under builder
  const l1 = await insertAll(
    "person",
    Array.from({ length: profile.l1 }, () => ({
      full_name: fullName(),
      email: uniqueEmail("l1"),
      upline_id: builder.id,
      is_builder: true,
      is_producer: true,
      status: "active",
    })),
    { select: "id" },
  );

  // L2 under each L1
  const l2Specs = [];
  for (const mgr of l1) {
    for (let i = 0; i < profile.perL1; i++) {
      l2Specs.push({
        full_name: fullName(),
        email: uniqueEmail("l2"),
        upline_id: mgr.id,
        is_builder: false,
        is_producer: true,
        status: "active",
      });
    }
  }
  const l2 = await insertAll("person", l2Specs, { select: "id" });

  // L3 under each L2
  const l3Specs = [];
  for (const mid of l2) {
    for (let i = 0; i < profile.perL2; i++) {
      l3Specs.push({
        full_name: fullName(),
        email: uniqueEmail("l3"),
        upline_id: mid.id,
        is_builder: false,
        is_producer: true,
        status: "active",
      });
    }
  }
  const l3 = await insertAll("person", l3Specs, { select: "id" });

  const team = [...l1, ...l2, ...l3];
  console.log(`  people: ${team.length} (L1=${l1.length} L2=${l2.length} L3=${l3.length})`);

  // Recruit rows for a subset so recruiting surfaces aren't empty.
  const recruitRows = team.slice(0, Math.min(40, team.length)).map((p, i) => ({
    person_id: p.id,
    builder_id: builder.id,
    phase: i % 5 === 0 ? "graduated" : "bootcamp",
  }));
  await insertAll("recruit", recruitRows);

  console.log("Seeding clients + tracker (this takes a few minutes on heavy)…");
  const activeIds = new Set(team.slice(0, profile.activeTeam).map((p) => p.id));

  const clientRows = [];
  const trackerRows = [];
  for (const p of team) {
    const isActive = activeIds.has(p.id);
    const nClients = isActive
      ? profile.clientsPerPerson + randInt(2, 8)
      : Math.max(1, Math.floor(profile.clientsPerPerson * 0.6));
    for (let c = 0; c < nClients; c++) {
      const inMtd = isActive && Math.random() < 0.45;
      const submit = inMtd
        ? randomDayBetween(monthStart, now)
        : randomDayBetween(ytdStart, monthStart);
      const issued = Math.random() < 0.5;
      const premium = randInt(600, 5200);
      clientRows.push({
        person_id: p.id,
        client_name: fullName(),
        email: uniqueEmail("client"),
        state: pick(STATES),
        age: randInt(48, 80),
        lead_vendor: LEAD_VENDOR,
        sale_status: Math.random() < 0.08 ? "in_progress" : "sale",
        annual_premium: premium,
        submit_date: isoDay(submit),
        date: isoDay(submit),
        issue_date: issued ? isoDay(addDays(submit, randInt(3, 30))) : null,
      });
    }

    const days = weekdaysBack(now, isActive ? profile.trackerDays : Math.max(3, Math.floor(profile.trackerDays / 3)));
    for (const entry_date of days) {
      trackerRows.push({
        person_id: p.id,
        entry_date,
        leads: randInt(0, 20),
        dials: randInt(10, 200),
        contacts: randInt(2, 40),
        appointments: randInt(0, 12),
        presentations: randInt(0, 10),
        sales: randInt(0, 4),
      });
    }
  }

  const insertedClients = await insertAll("clients", clientRows, {
    select: "id, person_id, annual_premium, issue_date, sale_status",
  });

  const deposits = insertedClients
    .filter((c) => c.issue_date && c.sale_status === "sale" && Math.random() < 0.55)
    .map((c) => ({
      person_id: c.person_id,
      client_id: c.id,
      issue_date: c.issue_date,
      estimated_amount: Number(c.annual_premium) / 12,
      actual_amount: Number(c.annual_premium) / 12,
      status: "successful",
      notes: LEAD_VENDOR,
      updated_at: randomDayBetween(monthStart, now).toISOString(),
    }));
  await insertAll("client_deposits", deposits);
  await insertAll("tracker_entry", trackerRows, { upsert: "person_id,entry_date" });

  await seedBuilderBook(builder.id);

  // Summary counts visible to the service role (full DB).
  const countExact = async (table, filter) => {
    let q = admin.from(table).select("*", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  };

  const peopleScale = await countExact("person", (q) => q.ilike("email", `%@${DEMO_DOMAIN}`));
  const clientsScale = await countExact("clients", (q) => q.eq("lead_vendor", LEAD_VENDOR));
  const trackerScale = await countExact("tracker_entry");
  const depositsScale = await countExact("client_deposits", (q) => q.eq("notes", LEAD_VENDOR));

  console.log("\nSeed complete (synthetic only — not production data).");
  console.log(`  scale people:     ${peopleScale}`);
  console.log(`  SCALE_SEED clients: ${clientsScale}`);
  console.log(`  tracker rows (all): ${trackerScale}`);
  console.log(`  SCALE deposits:   ${depositsScale}`);
  console.log("\nNext: sign in as builder@allstar.test, open /producer and /producer/team.");
  console.log("Expect slowdowns / timeouts BEFORE the performance migrations.");
  console.log("Wipe later with: node --env-file=.env.local scripts/seed-perf-load.mjs --clean");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
