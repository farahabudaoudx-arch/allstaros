// Demo roster for Scorecard generation walkthroughs.
//
//   node --env-file=.env.local scripts/seed-scorecard-demo.mjs
//
// Creates a small June 2026 team with Gateway IP, tracking, lead spend, photos,
// and logins so Manual generation AND "Start a completed-period run" produce
// real star ratings. Isolated from the Aug-created scale-test roster: those
// people were not in role at June 30, so a June run only sees this team.
//
// After seeding, in /admin/scorecards:
//   Period type  Monthly
//   Period start 2026-06-01
//   Period end   2026-06-30

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEV_LOGIN_PASSWORD ?? "allstar-dev-login";
const DEMO_DOMAIN = "scorecard-demo.allstar.test";
const HISTORY_FROM = "2026-01-15T12:00:00.000Z";
const NPN_VERIFIED_AT = "2026-06-12T15:00:00.000Z";
const JUNE_WTD = ["2026-06-06", "2026-06-16", "2026-06-19", "2026-06-22", "2026-06-30"];
const MAY_WTD = ["2026-05-09", "2026-05-16", "2026-05-18", "2026-05-24"];
const WINDOW_WTD = ["2026-05-24", ...JUNE_WTD];

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** @type {Array<{
 *  email: string;
 *  fullName: string;
 *  role: "builder" | "producer" | "recruit";
 *  gender: "men" | "women";
 *  portrait: number;
 *  ipCents: number;
 *  trackDays: number;
 *  spendDollars: number;
 *  login: boolean;
 * }>} */
const TEAM = [
  {
    email: `maya.chen@${DEMO_DOMAIN}`,
    fullName: "Maya Chen",
    role: "builder",
    gender: "women",
    portrait: 44,
    ipCents: 4_200_000,
    trackDays: 25,
    spendDollars: 10_800,
    login: true,
  },
  {
    email: `jordan.hale@${DEMO_DOMAIN}`,
    fullName: "Jordan Hale",
    role: "producer",
    gender: "men",
    portrait: 32,
    ipCents: 4_200_000,
    trackDays: 25,
    spendDollars: 10_500,
    login: true,
  },
  {
    email: `alex.rivera@${DEMO_DOMAIN}`,
    fullName: "Alex Rivera",
    role: "producer",
    gender: "women",
    portrait: 21,
    ipCents: 3_500_000,
    trackDays: 22,
    spendDollars: 8_500,
    login: true,
  },
  {
    email: `priya.shah@${DEMO_DOMAIN}`,
    fullName: "Priya Shah",
    role: "producer",
    gender: "women",
    portrait: 68,
    ipCents: 2_500_000,
    trackDays: 18,
    spendDollars: 5_000,
    login: true,
  },
  {
    email: `taylor.kim@${DEMO_DOMAIN}`,
    fullName: "Taylor Kim",
    role: "producer",
    gender: "men",
    portrait: 11,
    ipCents: 2_200_000,
    trackDays: 20,
    spendDollars: 7_000,
    login: true,
  },
  {
    email: `morgan.ellis@${DEMO_DOMAIN}`,
    fullName: "Morgan Ellis",
    role: "producer",
    gender: "women",
    portrait: 12,
    ipCents: 4_500_000,
    trackDays: 12,
    spendDollars: 3_000,
    login: true,
  },
  {
    email: `sam.ortiz@${DEMO_DOMAIN}`,
    fullName: "Sam Ortiz",
    role: "producer",
    gender: "men",
    portrait: 52,
    ipCents: 1_700_000,
    trackDays: 14,
    spendDollars: 4_500,
    login: true,
  },
  {
    email: `riley.brooks@${DEMO_DOMAIN}`,
    fullName: "Riley Brooks",
    role: "producer",
    gender: "women",
    portrait: 36,
    ipCents: 1_200_000,
    trackDays: 16,
    spendDollars: 6_500,
    login: true,
  },
  {
    email: `chris.nguyen@${DEMO_DOMAIN}`,
    fullName: "Chris Nguyen",
    role: "producer",
    gender: "men",
    portrait: 75,
    ipCents: 800_000,
    trackDays: 10,
    spendDollars: 2_500,
    login: true,
  },
];

const LICENSEES = [
  { email: `licensee.1@${DEMO_DOMAIN}`, fullName: "Avery Cole", gender: "women", portrait: 47 },
  { email: `licensee.2@${DEMO_DOMAIN}`, fullName: "Blake Dunn", gender: "men", portrait: 18 },
  { email: `licensee.3@${DEMO_DOMAIN}`, fullName: "Casey Frost", gender: "women", portrait: 9 },
  { email: `licensee.4@${DEMO_DOMAIN}`, fullName: "Drew Patel", gender: "men", portrait: 41 },
  { email: `licensee.5@${DEMO_DOMAIN}`, fullName: "Emery Walsh", gender: "women", portrait: 55 },
  { email: `licensee.6@${DEMO_DOMAIN}`, fullName: "Finley Grant", gender: "men", portrait: 28 },
];

const JUNE_MON_SAT = (() => {
  const out = [];
  for (let day = 1; day <= 30; day += 1) {
    const iso = `2026-06-${String(day).padStart(2, "0")}`;
    const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
    if (dow !== 0) out.push(iso);
  }
  return out;
})();

function splitCents(total, n) {
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

async function findAuthUserByEmail(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) return null;
  }
}

async function ensureAuthUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error && data.user) return data.user;
  const existing = await findAuthUserByEmail(email);
  if (!existing) throw error ?? new Error(`Could not create or find ${email}`);
  await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
  return existing;
}

async function insertAll(table, rows) {
  if (rows.length === 0) return;
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await admin.from(table).insert(rows.slice(i, i + chunkSize));
    if (error) throw new Error(`insert ${table}: ${error.message}`);
  }
}

async function importedWtd(dates) {
  const { data, error } = await admin
    .from("gateway_issued_premium_import")
    .select("id, report_date")
    .eq("period_type", "wtd")
    .eq("status", "imported")
    .in("report_date", dates);
  if (error) throw error;
  const byDate = new Map();
  for (const row of data ?? []) {
    if (!byDate.has(row.report_date)) byDate.set(row.report_date, row.id);
  }
  for (const date of dates) {
    if (!byDate.has(date)) throw new Error(`No imported WTD Gateway report on ${date}.`);
  }
  return byDate;
}

async function fetchPortrait(gender, portrait) {
  const urls = [
    `https://randomuser.me/api/portraits/${gender}/${portrait}.jpg`,
    `https://api.dicebear.com/9.x/lorelei/png?seed=${gender}${portrait}&size=256`,
  ];
  for (const href of urls) {
    try {
      const res = await fetch(href);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 400) return buf;
    } catch {
      // Try the next source.
    }
  }
  return null;
}

async function ensureHistoryCoversJune(personId, fields) {
  const { data: covering } = await admin
    .from("person_role_status_history")
    .select("id")
    .eq("person_id", personId)
    .lte("effective_from", "2026-06-30T23:59:59.000Z")
    .or("effective_to.is.null,effective_to.gt.2026-06-30T23:59:59.000Z")
    .limit(1)
    .maybeSingle();
  if (covering) return;

  const { data: current, error } = await admin
    .from("person_role_status_history")
    .select("effective_from")
    .eq("person_id", personId)
    .is("effective_to", null)
    .maybeSingle();
  if (error) throw error;
  if (!current) throw new Error(`No current role history for ${personId}`);

  const { error: insertError } = await admin.from("person_role_status_history").insert({
    person_id: personId,
    upline_id: fields.upline_id,
    status: "active",
    is_producer: fields.is_producer,
    is_builder: fields.is_builder,
    effective_from: HISTORY_FROM,
    effective_to: current.effective_from,
    confidence: "backfilled_current",
  });
  if (insertError) throw new Error(`history backfill: ${insertError.message}`);
}

async function upsertPerson(spec, { uplineId, isBuilder, isProducer, npn, login }) {
  let authUserId = null;
  if (login) {
    const user = await ensureAuthUser(spec.email);
    authUserId = user.id;
  }

  const payload = {
    full_name: spec.fullName,
    email: spec.email,
    upline_id: uplineId,
    is_builder: isBuilder,
    is_producer: isProducer,
    is_admin: false,
    is_super_admin: false,
    status: "active",
    npn,
    npn_status: "verified",
    npn_source: "admin_entered",
    npn_verified_at: NPN_VERIFIED_AT,
    photo_review_status: "pending",
  };
  if (authUserId) payload.auth_user_id = authUserId;

  const { data: existing } = await admin
    .from("person")
    .select("id")
    .ilike("email", spec.email)
    .maybeSingle();

  let person;
  if (existing) {
    const { data, error } = await admin
      .from("person")
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw new Error(`update person ${spec.email}: ${error.message}`);
    person = data;
  } else {
    const { data, error } = await admin.from("person").insert(payload).select("id").single();
    if (error) throw new Error(`insert person ${spec.email}: ${error.message}`);
    person = data;
  }

  await ensureHistoryCoversJune(person.id, {
    upline_id: uplineId,
    is_producer: isProducer,
    is_builder: isBuilder,
  });

  const bytes = await fetchPortrait(spec.gender, spec.portrait);
  if (bytes) {
    const { error: uploadError } = await admin.storage
      .from("headshots")
      .upload(`${person.id}.jpg`, bytes, { contentType: "image/jpeg", upsert: true });
    if (uploadError) {
      console.warn(`headshot upload ${spec.email}: ${uploadError.message}`);
    } else {
      const photoUrl = `${url.replace(/\/$/, "")}/storage/v1/object/public/headshots/${person.id}.jpg?v=${Date.now()}`;
      await admin
        .from("person")
        .update({
          photo_url: photoUrl,
          photo_review_status: "approved",
          photo_reviewed_at: new Date().toISOString(),
          photo_updated_at: new Date().toISOString(),
        })
        .eq("id", person.id);
    }
  }

  return person.id;
}

const juneImports = await importedWtd(JUNE_WTD);
const mayImports = await importedWtd(MAY_WTD);
const windowImports = await importedWtd(WINDOW_WTD);

const builderId = await upsertPerson(TEAM[0], {
  uplineId: null,
  isBuilder: true,
  isProducer: true,
  npn: "81000001",
  login: true,
});

const producerIds = [];
for (let i = 1; i < TEAM.length; i += 1) {
  producerIds.push(
    await upsertPerson(TEAM[i], {
      uplineId: builderId,
      isBuilder: false,
      isProducer: true,
      npn: String(81000001 + i),
      login: true,
    }),
  );
}

const licenseeIds = [];
for (let i = 0; i < LICENSEES.length; i += 1) {
  licenseeIds.push(
    await upsertPerson(LICENSEES[i], {
      uplineId: builderId,
      isBuilder: false,
      isProducer: false,
      npn: String(82000001 + i),
      login: false,
    }),
  );
}

const allPeople = [builderId, ...producerIds, ...licenseeIds];

const { data: existingRecruits } = await admin
  .from("recruit")
  .select("id, person_id")
  .in("person_id", allPeople);
const haveRecruit = new Set((existingRecruits ?? []).map((row) => row.person_id));
const recruitRows = [...producerIds, ...licenseeIds]
  .filter((id) => !haveRecruit.has(id))
  .map((personId) => ({
    person_id: personId,
    builder_id: builderId,
    phase: "graduated",
    phase_step: "active",
  }));
await insertAll("recruit", recruitRows);

await admin.from("producer_issued_premium").delete().in("person_id", [builderId, ...producerIds]);
await admin.from("tracker_entry").delete().in("person_id", [builderId, ...producerIds]);
await admin.from("lead_purchases").delete().in("person_id", [builderId, ...producerIds]);
await admin.from("clients").delete().in("person_id", [builderId, ...producerIds]).eq("lead_vendor", "SCORECARD_DEMO");

const JUNE_TEAM_IP = 40_000_000;
const MAY_TEAM_IP = 30_000_000;
const juneTeamParts = splitCents(JUNE_TEAM_IP, JUNE_WTD.length);
const mayTeamParts = splitCents(MAY_TEAM_IP, MAY_WTD.length);

const premiumRows = [];
const trackerRows = [];
const leadRows = [];
const clientRows = [];

function addProducerSources(personId, spec, npn) {
  const juneParts = splitCents(spec.ipCents, JUNE_WTD.length);
  for (let i = 0; i < JUNE_WTD.length; i += 1) {
    const date = JUNE_WTD[i];
    premiumRows.push({
      person_id: personId,
      import_id: juneImports.get(date),
      period_type: "wtd",
      report_date: date,
      gateway_label: `Week ${i + 1}`,
      gateway_npn: npn,
      gateway_email: spec.email,
      personal_ip_cents: juneParts[i],
      team_ip_cents: personId === builderId ? juneTeamParts[i] : 0,
      first_leg_percent: personId === builderId ? 8 : null,
    });
  }
  premiumRows.push({
    person_id: personId,
    import_id: windowImports.get("2026-05-24"),
    period_type: "wtd",
    report_date: "2026-05-24",
    gateway_label: "Week 4",
    gateway_npn: npn,
    gateway_email: spec.email,
    personal_ip_cents: 25_000,
    team_ip_cents: personId === builderId ? mayTeamParts[MAY_WTD.indexOf("2026-05-24")] : 0,
    first_leg_percent: personId === builderId ? 12 : null,
  });
  if (personId === builderId) {
    for (let i = 0; i < MAY_WTD.length; i += 1) {
      const date = MAY_WTD[i];
      if (date === "2026-05-24") continue;
      premiumRows.push({
        person_id: personId,
        import_id: mayImports.get(date),
        period_type: "wtd",
        report_date: date,
        gateway_label: `May week ${i + 1}`,
        gateway_npn: npn,
        gateway_email: spec.email,
        personal_ip_cents: 0,
        team_ip_cents: mayTeamParts[i],
        first_leg_percent: 12,
      });
    }
  }

  const days = JUNE_MON_SAT.slice(0, spec.trackDays);
  for (const date of days) {
    trackerRows.push({
      person_id: personId,
      entry_date: date,
      leads: 4,
      dials: 40,
      contacts: 12,
      appointments: 3,
      presentations: 2,
      sales: 1,
    });
  }
  leadRows.push({
    person_id: personId,
    vendor: "SCORECARD_DEMO",
    amount: spec.spendDollars,
    lead_count: Math.max(10, Math.round(spec.spendDollars / 25)),
    lead_type: "Final Expense",
    purchase_date: "2026-06-10",
    notes: "SCORECARD_DEMO",
  });
  clientRows.push({
    person_id: personId,
    client_name: `${spec.fullName.split(" ")[0]} Demo Client`,
    submit_date: "2026-06-18",
    issue_date: "2026-06-22",
    annual_premium: Math.round(spec.ipCents / 100 / 12),
    sale_status: "sale",
    lead_vendor: "SCORECARD_DEMO",
    state: "TX",
  });
}

addProducerSources(builderId, TEAM[0], "81000001");
producerIds.forEach((id, i) => addProducerSources(id, TEAM[i + 1], String(81000002 + i)));

await insertAll("producer_issued_premium", premiumRows);
await insertAll("tracker_entry", trackerRows);
await insertAll("lead_purchases", leadRows);
await insertAll("clients", clientRows);

console.log(`
Scorecard demo seed is ready.

Generate cards at /admin/scorecards:
  Period type   Monthly
  Period start  2026-06-01
  Period end    2026-06-30

  • Manual: pick any name below, Producer (Maya also has Builder).
  • Completed-period run: same dates — publishes the whole demo team.

Shared password for every login:
  ${password}

Logins (open /producer/scorecards after you generate):
`);
for (const member of TEAM) {
  const stars =
    member.role === "builder"
      ? "Builder + 5★ Producer (IP $42k / 25 days / $10.8k spend)"
      : `Producer  · IP $${(member.ipCents / 100).toLocaleString("en-US")} · ${member.trackDays} logged days · $${member.spendDollars.toLocaleString("en-US")} spend`;
  console.log(`  ${member.fullName.padEnd(14)}  ${member.email.padEnd(42)}  ${stars}`);
}
console.log(`
Maya Chen's Builder card uses the 8 directs as active writers plus 6 June licensees
for recruiting stars. Photos are approved placeholder headshots.
`);
