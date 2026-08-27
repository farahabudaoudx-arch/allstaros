// Full-schema synthetic load for PREVIEW performance work.
//
// Tops every public app table ABOVE the known production row counts so staging
// is always heavier than live. Empty prod tables get a floor of 550. FKs are
// linked correctly. Does NOT touch production.
//
// Production baselines (Nick's live table sizes, Aug 2026):
//   person 856 · recruit 671 · clients 3866 · tracker 5238 · deposits 718
//   daily_projection 1388 · ai_usage 26802 · issued_premium 7979 · login 2225 …
//
// Usage:
//   node --env-file=.env.local scripts/seed-full-schema.mjs
//   node --env-file=.env.local scripts/seed-full-schema.mjs --report-only
//
// Not on preview yet (skipped): kb_documents, sms_consent, sms_webhook_event.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUILDER_EMAIL = process.env.SCALE_SEED_BUILDER_EMAIL ?? "builder@allstar.test";
const DEMO_DOMAIN = "scale.allstar.test";
const LEAD_VENDOR = "SCALE_SEED";
const NOTE = "SCALE_FULL";
const ALLOWED_REF = process.env.SCALE_SEED_PROJECT_REF ?? "oyuqwuvewyntnxfboutd";

/** Exceed production: ~30% headroom + pad, empty tables → 550 floor. */
function aboveProd(prod, floor = 550) {
  if (!prod || prod <= 0) return floor;
  return Math.max(floor, Math.ceil(prod * 1.3) + 50);
}

const TARGET = {
  person: aboveProd(856, 1100),
  recruit: aboveProd(671, 900),
  clients: aboveProd(3866, 5000),
  tracker_entry: aboveProd(5238, 7000),
  client_deposits: aboveProd(718, 1000),
  daily_projection: aboveProd(1388, 1800),
  ai_usage_log: aboveProd(26802, 32000),
  producer_issued_premium: aboveProd(7979, 10000),
  login_event: aboveProd(2225, 2900),
  ai_conversation_log: aboveProd(656, 900),
  gateway_issued_premium_import: aboveProd(299, 550),
  message: aboveProd(142, 550),
  message_read: aboveProd(279, 550),
  check_in: aboveProd(42, 550),
  lead_purchases: aboveProd(335, 550),
  admin_audit: aboveProd(135, 550),
  builder_referral: aboveProd(60, 550),
  training_schedule: aboveProd(72, 550),
  notification_destinations: aboveProd(19, 550),
  discord_leaderboard_messages: aboveProd(64, 550),
  producer_goal: aboveProd(79, 550),
  // Empty on prod — floor 550
  training_lesson: 550,
  training_content: 550,
  lesson_completion: 550,
  milestone: 550,
  policy_submission: 550,
  leaderboard_ap_baselines: 550,
};

const MIN_REPORT = 550;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!url.includes(ALLOWED_REF) && !process.argv.includes("--force-url")) {
  console.error(`Refusing: URL is not preview (${ALLOWED_REF}). Got ${url}`);
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const FIRST = ["James","Mary","Robert","Patricia","John","Jennifer","Michael","Linda","David","Elizabeth","William","Barbara","Richard","Susan","Joseph","Jessica","Thomas","Karen","Chris","Nancy","Daniel","Lisa","Matthew","Sandra","Anthony","Ashley","Mark","Kimberly","Steven","Carol","Paul","Michelle","Andrew","Amanda","Kevin","Deborah","Brian","Stephanie"];
const LAST = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin","Lee","Thompson","White","Harris","Clark","Lewis","Walker","Hall","Allen","Young","King"];
const STATES = ["AL","TX","FL","GA","NC","SC","TN","OH","MI","LA","MS","VA","CA","NY","IL","PA"];
const TOOLS = ["sidekick", "underwriting_analyze", "underwriting_chat"];
const MODELS = ["claude-haiku-4-5-20251001", "claude-opus-4-7"];
const PURPOSES = ["sale_submitted", "leaderboard_daily", "leaderboard_wtd", "leaderboard_mtd", "leaderboard_ytd"];
const MILESTONE_KINDS = ["first_dial", "first_presentation", "first_policy", "first_deposit"];

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const randInt = (min, max) => min + rand(max - min + 1);
const fullName = () => `${pick(FIRST)} ${pick(LAST)}`;

let seq = Date.now() % 1_000_000;
function uniqueEmail(prefix) {
  return `${prefix}-${seq++}@${DEMO_DOMAIN}`;
}

const now = new Date();
const isoDay = (d) => d.toISOString().slice(0, 10);
function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function randomDayBetween(start, end) {
  return new Date(start.getTime() + Math.random() * Math.max(1, end.getTime() - start.getTime()));
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
    let q = opts.upsert
      ? admin.from(table).upsert(chunk, { onConflict: opts.upsert, ignoreDuplicates: opts.ignoreDuplicates ?? false })
      : admin.from(table).insert(chunk);
    if (opts.select) q = q.select(opts.select);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (opts.select && data) out.push(...data);
    process.stdout.write(`  ${table}: ${Math.min(i + chunk.length, rows.length)}/${rows.length}\r`);
  }
  if (rows.length) process.stdout.write("\n");
  return out;
}

async function countExact(table, apply) {
  let q = admin.from(table).select("*", { count: "exact", head: true });
  if (apply) q = apply(q);
  const { count, error } = await q;
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

async function fetchAllIds(table, select, apply) {
  const page = 1000;
  const out = [];
  for (let from = 0; ; from += page) {
    let q = admin.from(table).select(select).range(from, from + page - 1);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(`fetch ${table}: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

function need(current, target) {
  return Math.max(0, target - current);
}

async function report() {
  const tables = [
    "person", "recruit", "check_in", "message", "milestone", "policy_submission",
    "training_lesson", "lesson_completion", "tracker_entry", "clients", "client_deposits",
    "daily_projection", "producer_goal", "builder_referral", "lead_purchases",
    "training_schedule", "training_content", "login_event", "admin_audit",
    "message_read", "ai_usage_log", "ai_conversation_log", "notification_destinations",
    "discord_leaderboard_messages", "leaderboard_ap_baselines",
    "gateway_issued_premium_import", "producer_issued_premium",
  ];
  console.log("\nRow counts:");
  for (const t of tables) {
    try {
      const n = await countExact(t);
      const mark = n >= (TARGET[t] ?? MIN_REPORT) ? "ok" : "LOW";
      const want = TARGET[t] ?? "?";
      console.log(`  ${mark.padEnd(3)} ${t.padEnd(32)} ${String(n).padStart(6)}  (target ${want})`);
    } catch (e) {
      console.log(`  ERR ${t.padEnd(32)} ${e.message}`);
    }
  }
}

async function main() {
  console.log(`Target DB: ${url}`);
  if (process.argv.includes("--report-only")) {
    await report();
    return;
  }

  const { data: builder, error: bErr } = await admin
    .from("person")
    .select("id, full_name")
    .ilike("email", BUILDER_EMAIL)
    .maybeSingle();
  if (bErr) throw bErr;
  if (!builder) {
    console.error(`Missing ${BUILDER_EMAIL}. Run seed-dev-users first.`);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // PERSON — ensure enough scale people under the builder
  // -------------------------------------------------------------------------
  let people = await fetchAllIds("person", "id, email, is_builder, is_producer, upline_id", (q) =>
    q.ilike("email", `%@${DEMO_DOMAIN}`),
  );
  console.log(`Scale people present: ${people.length}`);
  const personNeed = need(people.length, TARGET.person);
  if (personNeed > 0) {
    console.log(`Adding ${personNeed} people…`);
    // Attach under existing L1 builders when possible, else directly under builder.
    const managers = people.filter((p) => p.is_builder).slice(0, 20);
    const uplines = managers.length ? managers : [{ id: builder.id }];
    const rows = Array.from({ length: personNeed }, (_, i) => ({
      full_name: fullName(),
      email: uniqueEmail("full"),
      upline_id: uplines[i % uplines.length].id,
      is_builder: false,
      is_producer: true,
      status: "active",
    }));
    const inserted = await insertAll("person", rows, { select: "id, email, is_builder, is_producer, upline_id" });
    people = people.concat(inserted);
  }
  const personIds = people.map((p) => p.id);
  const pickPerson = () => personIds[rand(personIds.length)];

  // -------------------------------------------------------------------------
  // RECRUIT — one per person until target (unique person_id)
  // -------------------------------------------------------------------------
  let recruits = await fetchAllIds("recruit", "id, person_id, builder_id");
  const recruitedPerson = new Set(recruits.map((r) => r.person_id));
  const recruitNeed = need(recruits.length, TARGET.recruit);
  if (recruitNeed > 0) {
    const candidates = people.filter((p) => !recruitedPerson.has(p.id)).slice(0, recruitNeed);
    const rows = candidates.map((p) => ({
      person_id: p.id,
      builder_id: builder.id,
      phase: pick(["licensing", "onboarding", "bootcamp", "graduated"]),
    }));
    const inserted = await insertAll("recruit", rows, { select: "id, person_id, builder_id" });
    recruits = recruits.concat(inserted);
  }
  const recruitIds = recruits.map((r) => r.id);
  const pickRecruit = () => recruitIds[rand(recruitIds.length)];
  console.log(`Recruits: ${recruits.length}`);

  // -------------------------------------------------------------------------
  // TRAINING LESSON catalog
  // -------------------------------------------------------------------------
  let lessons = await fetchAllIds("training_lesson", "id, title", (q) =>
    q.ilike("title", "SCALE FULL%"),
  );
  const lessonNeed = need(await countExact("training_lesson"), TARGET.training_lesson);
  if (lessonNeed > 0) {
    const rows = Array.from({ length: lessonNeed }, (_, i) => ({
      title: `SCALE FULL Lesson ${Date.now()}-${i}`,
      phase: i % 2 === 0 ? "licensing" : "onboarding",
      sort_order: i,
      is_assignment: i % 7 === 0,
    }));
    const inserted = await insertAll("training_lesson", rows, { select: "id, title" });
    lessons = lessons.concat(inserted);
  }
  // Refresh full lesson id list for FKs
  lessons = await fetchAllIds("training_lesson", "id");
  const lessonIds = lessons.map((l) => l.id);
  const pickLesson = () => lessonIds[rand(lessonIds.length)];

  // -------------------------------------------------------------------------
  // TRAINING SCHEDULE / CONTENT catalogs
  // -------------------------------------------------------------------------
  {
    const n = need(await countExact("training_schedule"), TARGET.training_schedule);
    if (n > 0) {
      const rows = Array.from({ length: n }, (_, i) => ({
        slug: `scale-full-sched-${Date.now()}-${i}`,
        title: `SCALE FULL Training ${i}`,
        host: fullName(),
        initials: "SF",
        event_date: isoDay(addDays(now, i % 120)),
        start_time: "08:30",
        end_time: "09:30",
        timezone: "America/Chicago",
        zoom_url: "https://zoom.us/j/scale-full-seed",
        sort_order: i,
      }));
      await insertAll("training_schedule", rows);
    }
  }
  {
    const n = need(await countExact("training_content"), TARGET.training_content);
    if (n > 0) {
      const rows = Array.from({ length: n }, (_, i) => ({
        library: pick(["recruit", "live", "bootcamp", "accelerator", "uplevel"]),
        title: `SCALE FULL Content ${Date.now()}-${i}`,
        embed_url: `https://example.test/embed/scale-full-${i}`,
        sort_order: i,
      }));
      await insertAll("training_content", rows);
    }
  }

  // -------------------------------------------------------------------------
  // CHECK_IN
  // -------------------------------------------------------------------------
  {
    const n = need(await countExact("check_in"), TARGET.check_in);
    if (n > 0 && recruitIds.length) {
      const rows = [];
      const used = new Set();
      let guard = 0;
      while (rows.length < n && guard++ < n * 20) {
        const recruit_id = pickRecruit();
        const check_in_date = isoDay(addDays(now, -randInt(0, 400)));
        const key = `${recruit_id}:${check_in_date}`;
        if (used.has(key)) continue;
        used.add(key);
        rows.push({
          recruit_id,
          check_in_date,
          summary: `${NOTE} check-in ${rows.length}`,
          pacing: { target: randInt(5, 20) },
          actuals: { dials: randInt(0, 40) },
        });
      }
      await insertAll("check_in", rows);
    }
  }

  // -------------------------------------------------------------------------
  // MESSAGE
  // -------------------------------------------------------------------------
  {
    const n = need(await countExact("message"), TARGET.message);
    if (n > 0 && recruitIds.length) {
      const rows = Array.from({ length: n }, (_, i) => ({
        recruit_id: pickRecruit(),
        sender_person_id: Math.random() < 0.5 ? builder.id : pickPerson(),
        body: `${NOTE} message body #${i} — keep grinding.`,
        is_ai: Math.random() < 0.15,
      }));
      await insertAll("message", rows);
    }
  }

  // -------------------------------------------------------------------------
  // MILESTONE — unique (recruit_id, kind); fill across recruits
  // -------------------------------------------------------------------------
  {
    const n = need(await countExact("milestone"), TARGET.milestone);
    if (n > 0 && recruitIds.length) {
      const rows = [];
      for (const rid of recruitIds) {
        for (const kind of MILESTONE_KINDS) {
          if (rows.length >= n) break;
          rows.push({ recruit_id: rid, kind, reached_at: randomDayBetween(addDays(now, -200), now).toISOString() });
        }
        if (rows.length >= n) break;
      }
      await insertAll("milestone", rows, { upsert: "recruit_id,kind", ignoreDuplicates: true });
    }
  }

  // -------------------------------------------------------------------------
  // POLICY_SUBMISSION
  // -------------------------------------------------------------------------
  {
    const n = need(await countExact("policy_submission"), TARGET.policy_submission);
    if (n > 0 && recruitIds.length) {
      const rows = Array.from({ length: n }, (_, i) => ({
        recruit_id: pickRecruit(),
        submitted_at: isoDay(addDays(now, -randInt(0, 90))),
        note: `${NOTE} policy ${i}`,
      }));
      await insertAll("policy_submission", rows);
    }
  }

  // -------------------------------------------------------------------------
  // LESSON_COMPLETION — unique (recruit_id, lesson_id)
  // -------------------------------------------------------------------------
  {
    const n = need(await countExact("lesson_completion"), TARGET.lesson_completion);
    if (n > 0 && recruitIds.length && lessonIds.length) {
      const rows = [];
      const used = new Set();
      let guard = 0;
      while (rows.length < n && guard++ < n * 30) {
        const recruit_id = pickRecruit();
        const lesson_id = pickLesson();
        const key = `${recruit_id}:${lesson_id}`;
        if (used.has(key)) continue;
        used.add(key);
        rows.push({ recruit_id, lesson_id, completed_at: randomDayBetween(addDays(now, -180), now).toISOString() });
      }
      await insertAll("lesson_completion", rows, { upsert: "recruit_id,lesson_id", ignoreDuplicates: true });
    }
  }

  // -------------------------------------------------------------------------
  // CLIENTS + DEPOSITS
  // -------------------------------------------------------------------------
  {
    const n = need(await countExact("clients"), TARGET.clients);
    if (n > 0) {
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const ytdStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      const clientRows = Array.from({ length: n }, () => {
        const submit = randomDayBetween(ytdStart, now);
        const issued = Math.random() < 0.5;
        return {
          person_id: pickPerson(),
          client_name: fullName(),
          email: uniqueEmail("c"),
          state: pick(STATES),
          age: randInt(48, 80),
          lead_vendor: LEAD_VENDOR,
          sale_status: Math.random() < 0.1 ? "in_progress" : "sale",
          annual_premium: randInt(600, 5200),
          submit_date: isoDay(submit),
          date: isoDay(submit),
          issue_date: issued ? isoDay(addDays(submit, randInt(3, 30))) : null,
        };
      });
      const inserted = await insertAll("clients", clientRows, {
        select: "id, person_id, annual_premium, issue_date, sale_status",
      });
      const deposits = inserted
        .filter((c) => c.issue_date && c.sale_status === "sale" && Math.random() < 0.6)
        .map((c) => ({
          person_id: c.person_id,
          client_id: c.id,
          issue_date: c.issue_date,
          estimated_amount: Number(c.annual_premium) / 12,
          actual_amount: Number(c.annual_premium) / 12,
          status: "successful",
          notes: NOTE,
          updated_at: randomDayBetween(monthStart, now).toISOString(),
        }));
      await insertAll("client_deposits", deposits);
    }
    // Top up deposits if still low
    const depNeed = need(await countExact("client_deposits"), TARGET.client_deposits);
    if (depNeed > 0) {
      const clientPool = await fetchAllIds("clients", "id, person_id, annual_premium, issue_date", (q) =>
        q.eq("lead_vendor", LEAD_VENDOR).not("issue_date", "is", null),
      );
      const rows = [];
      for (let i = 0; i < depNeed && clientPool.length; i++) {
        const c = clientPool[i % clientPool.length];
        rows.push({
          person_id: c.person_id,
          client_id: c.id,
          issue_date: c.issue_date,
          estimated_amount: Number(c.annual_premium ?? 1000) / 12,
          actual_amount: Number(c.annual_premium ?? 1000) / 12,
          status: pick(["successful", "pending", "failed"]),
          notes: `${NOTE}-extra`,
        });
      }
      await insertAll("client_deposits", rows);
    }
  }

  // -------------------------------------------------------------------------
  // TRACKER_ENTRY (unique person_id, entry_date)
  // -------------------------------------------------------------------------
  {
    const n = need(await countExact("tracker_entry"), TARGET.tracker_entry);
    if (n > 0) {
      const days = weekdaysBack(now, 250);
      const rows = [];
      const used = new Set();
      let guard = 0;
      while (rows.length < n && guard++ < n * 30) {
        const person_id = pickPerson();
        const entry_date = pick(days);
        const key = `${person_id}:${entry_date}`;
        if (used.has(key)) continue;
        used.add(key);
        rows.push({
          person_id,
          entry_date,
          leads: randInt(0, 25),
          dials: randInt(10, 200),
          contacts: randInt(2, 40),
          appointments: randInt(0, 12),
          presentations: randInt(0, 10),
          sales: randInt(0, 4),
        });
      }
      await insertAll("tracker_entry", rows, { upsert: "person_id,entry_date" });
    }
  }

  // -------------------------------------------------------------------------
  // DAILY_PROJECTION
  // -------------------------------------------------------------------------
  {
    const n = need(await countExact("daily_projection"), TARGET.daily_projection);
    if (n > 0) {
      const days = weekdaysBack(now, 200);
      const rows = [];
      const used = new Set();
      let guard = 0;
      while (rows.length < n && guard++ < n * 30) {
        const person_id = pickPerson();
        const entry_date = pick(days);
        const key = `${person_id}:${entry_date}`;
        if (used.has(key)) continue;
        used.add(key);
        rows.push({
          person_id,
          entry_date,
          dials: randInt(20, 100),
          contacts: randInt(5, 30),
          appointments: randInt(1, 8),
          presentations: randInt(1, 6),
          sales: randInt(0, 3),
          ap_cents: randInt(50000, 500000),
          leads: randInt(5, 40),
        });
      }
      await insertAll("daily_projection", rows, { upsert: "person_id,entry_date" });
    }
  }

  // -------------------------------------------------------------------------
  // PRODUCER_GOAL — one per person
  // -------------------------------------------------------------------------
  {
    const n = need(await countExact("producer_goal"), Math.min(TARGET.producer_goal, personIds.length));
    if (n > 0) {
      const existing = new Set(
        (await fetchAllIds("producer_goal", "person_id")).map((r) => r.person_id),
      );
      const rows = personIds
        .filter((id) => !existing.has(id))
        .slice(0, n)
        .map((person_id) => ({
          person_id,
          ap_cents: randInt(100000, 2000000),
          ip_cents: randInt(50000, 1000000),
          sales: randInt(5, 40),
        }));
      await insertAll("producer_goal", rows, { upsert: "person_id" });
    }
  }

  // -------------------------------------------------------------------------
  // BUILDER_REFERRAL — unique builder_id; seed for every builder person
  // -------------------------------------------------------------------------
  {
    const builders = people.filter((p) => p.is_builder);
    // Also treat root builder
    const builderPool = [{ id: builder.id }, ...builders];
    const uniqueBuilders = [...new Map(builderPool.map((b) => [b.id, b])).values()];
    const existing = new Set(
      (await fetchAllIds("builder_referral", "builder_id")).map((r) => r.builder_id),
    );
    const rows = uniqueBuilders
      .filter((b) => !existing.has(b.id))
      .map((b, i) => ({
        builder_id: b.id,
        code: `SCALEFULL${b.id.replace(/-/g, "").slice(0, 10)}${i}`,
      }));
    if (rows.length) await insertAll("builder_referral", rows, { upsert: "builder_id", ignoreDuplicates: true });
    // Cannot hit 500 without 500 builders — create synthetic builders for referral codes only
    const refNeed = need(await countExact("builder_referral"), TARGET.builder_referral);
    if (refNeed > 0) {
      const newBuilders = await insertAll(
        "person",
        Array.from({ length: refNeed }, () => ({
          full_name: fullName(),
          email: uniqueEmail("refb"),
          upline_id: builder.id,
          is_builder: true,
          is_producer: true,
          status: "active",
        })),
        { select: "id" },
      );
      await insertAll(
        "builder_referral",
        newBuilders.map((b, i) => ({
          builder_id: b.id,
          code: `SCALEFULLX${b.id.replace(/-/g, "").slice(0, 12)}${i}`,
        })),
      );
      people.push(...newBuilders.map((b) => ({ ...b, is_builder: true, is_producer: true })));
      personIds.push(...newBuilders.map((b) => b.id));
    }
  }

  // -------------------------------------------------------------------------
  // LEAD_PURCHASES
  // -------------------------------------------------------------------------
  {
    const n = need(await countExact("lead_purchases"), TARGET.lead_purchases);
    if (n > 0) {
      const rows = Array.from({ length: n }, (_, i) => ({
        person_id: pickPerson(),
        vendor: pick(["EverQuote", "QuoteWizard", "Internal", "Facebook"]),
        amount: randInt(50, 800),
        lead_count: randInt(5, 80),
        lead_type: pick(["Final Expense", "Mortgage Protection", "IUL"]),
        purchase_date: isoDay(addDays(now, -randInt(0, 180))),
        notes: `${NOTE} purchase ${i}`,
      }));
      await insertAll("lead_purchases", rows);
    }
  }

  // -------------------------------------------------------------------------
  // LOGIN_EVENT / ADMIN_AUDIT / AI LOGS
  // -------------------------------------------------------------------------
  {
    const n = need(await countExact("login_event"), TARGET.login_event);
    if (n > 0) {
      const rows = Array.from({ length: n }, () => ({
        person_id: pickPerson(),
        ip: `10.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`,
        user_agent: "SCALE_FULL seeder",
        city: pick(["Austin", "Dallas", "Chicago", "Miami"]),
        region: pick(["TX", "IL", "FL"]),
        country: "US",
        flagged: Math.random() < 0.05,
        logged_in_at: randomDayBetween(addDays(now, -120), now).toISOString(),
      }));
      await insertAll("login_event", rows);
    }
  }
  {
    const n = need(await countExact("admin_audit"), TARGET.admin_audit);
    if (n > 0) {
      const rows = Array.from({ length: n }, (_, i) => ({
        actor_person_id: builder.id,
        target_person_id: pickPerson(),
        action: pick(["role_change", "status_change", "npn_verify", "impersonate"]),
        detail: { note: NOTE, i },
      }));
      await insertAll("admin_audit", rows);
    }
  }
  {
    const n = need(await countExact("ai_usage_log"), TARGET.ai_usage_log);
    if (n > 0) {
      const rows = Array.from({ length: n }, () => ({
        person_id: pickPerson(),
        tool: pick(TOOLS),
        model: pick(MODELS),
        input_tokens: randInt(100, 8000),
        output_tokens: randInt(50, 2000),
        cache_read_tokens: randInt(0, 5000),
        est_cost_usd: Number((Math.random() * 0.05).toFixed(6)),
        created_at: randomDayBetween(addDays(now, -60), now).toISOString(),
      }));
      await insertAll("ai_usage_log", rows);
    }
  }
  {
    const n = need(await countExact("ai_conversation_log"), TARGET.ai_conversation_log);
    if (n > 0) {
      const rows = Array.from({ length: n }, (_, i) => ({
        person_id: pickPerson(),
        tool: "sidekick",
        question: `${NOTE} question ${i}: how do I handle objections?`,
        answer: `${NOTE} answer ${i}: acknowledge, reframe, close.`,
        redirected: Math.random() < 0.1,
      }));
      await insertAll("ai_conversation_log", rows);
    }
  }

  // -------------------------------------------------------------------------
  // MESSAGE_READ — unique (person_id, recruit_id)
  // -------------------------------------------------------------------------
  {
    const n = need(await countExact("message_read"), TARGET.message_read);
    if (n > 0 && recruitIds.length) {
      const rows = [];
      const used = new Set();
      let guard = 0;
      while (rows.length < n && guard++ < n * 40) {
        const person_id = pickPerson();
        const recruit_id = pickRecruit();
        const key = `${person_id}:${recruit_id}`;
        if (used.has(key)) continue;
        used.add(key);
        rows.push({ person_id, recruit_id, last_read_at: randomDayBetween(addDays(now, -30), now).toISOString() });
      }
      await insertAll("message_read", rows, { upsert: "person_id,recruit_id", ignoreDuplicates: true });
    }
  }

  // -------------------------------------------------------------------------
  // NOTIFICATION DESTINATIONS + DISCORD MESSAGES
  // -------------------------------------------------------------------------
  let destinations = await fetchAllIds("notification_destinations", "id", (q) =>
    q.ilike("label", "SCALE FULL%"),
  );
  {
    const n = need(await countExact("notification_destinations"), TARGET.notification_destinations);
    if (n > 0) {
      const rows = Array.from({ length: n }, (_, i) => ({
        owner_person_id: builder.id,
        provider: "discord_webhook",
        purpose: PURPOSES[i % PURPOSES.length],
        label: `SCALE FULL dest ${Date.now()}-${i}`,
        url: `https://discord.com/api/webhooks/scale-full/${randomUUID()}`,
        enabled: true,
        created_by: builder.id,
      }));
      destinations = destinations.concat(
        await insertAll("notification_destinations", rows, { select: "id" }),
      );
    }
  }
  destinations = await fetchAllIds("notification_destinations", "id");
  {
    const n = need(await countExact("discord_leaderboard_messages"), TARGET.discord_leaderboard_messages);
    if (n > 0 && destinations.length) {
      const rows = [];
      const used = new Set();
      let guard = 0;
      while (rows.length < n && guard++ < n * 40) {
        const destination_id = destinations[rand(destinations.length)].id;
        const period_type = pick(["daily", "wtd", "mtd", "ytd"]);
        const period_start = isoDay(addDays(now, -randInt(0, 400)));
        const key = `${destination_id}:${period_type}:${period_start}`;
        if (used.has(key)) continue;
        used.add(key);
        rows.push({
          destination_id,
          period_type,
          period_start,
          period_end: isoDay(addDays(new Date(`${period_start}T00:00:00Z`), 7)),
          message_id: `scale-full-${randomUUID()}`,
        });
      }
      await insertAll("discord_leaderboard_messages", rows, {
        upsert: "destination_id,period_type,period_start",
        ignoreDuplicates: true,
      });
    }
  }

  // -------------------------------------------------------------------------
  // LEADERBOARD AP BASELINES — unique (person_id, year)
  // -------------------------------------------------------------------------
  {
    const year = now.getUTCFullYear();
    const n = need(await countExact("leaderboard_ap_baselines"), Math.min(TARGET.leaderboard_ap_baselines, personIds.length));
    if (n > 0) {
      const existing = new Set(
        (await fetchAllIds("leaderboard_ap_baselines", "person_id, year"))
          .filter((r) => r.year === year)
          .map((r) => r.person_id),
      );
      const rows = personIds
        .filter((id) => !existing.has(id))
        .slice(0, n)
        .map((person_id) => ({
          person_id,
          year,
          baseline_through_date: `${year}-01-01`,
          submitted_ap_cents: randInt(0, 500000),
          sales_count: randInt(0, 30),
          notes: NOTE,
          entered_by: builder.id,
        }));
      await insertAll("leaderboard_ap_baselines", rows, { upsert: "person_id,year", ignoreDuplicates: true });
    }
  }

  // -------------------------------------------------------------------------
  // GATEWAY IMPORT + PRODUCER_ISSUED_PREMIUM
  // -------------------------------------------------------------------------
  let imports = await fetchAllIds("gateway_issued_premium_import", "id");
  {
    const n = need(imports.length, TARGET.gateway_issued_premium_import);
    if (n > 0) {
      const rows = Array.from({ length: n }, (_, i) => ({
        period_type: pick(["wtd", "mtd", "ytd"]),
        status: pick(["imported", "skipped", "no_new_report"]),
        report_date: isoDay(addDays(now, -randInt(0, 200))),
        period_start: isoDay(addDays(now, -randInt(7, 220))),
        gateway_label: `${NOTE} import ${i}`,
        source_file_name: `scale-full-${i}.csv`,
        source_checksum: randomUUID().replace(/-/g, ""),
        rows_seen: randInt(10, 500),
        matched_count: randInt(5, 400),
        finished_at: now.toISOString(),
      }));
      imports = imports.concat(await insertAll("gateway_issued_premium_import", rows, { select: "id" }));
    }
  }
  {
    const n = need(await countExact("producer_issued_premium"), TARGET.producer_issued_premium);
    if (n > 0) {
      const rows = [];
      const used = new Set();
      let guard = 0;
      while (rows.length < n && guard++ < n * 40) {
        const person_id = pickPerson();
        const period_type = pick(["wtd", "mtd", "ytd"]);
        const report_date = isoDay(addDays(now, -randInt(0, 180)));
        const key = `${person_id}:${period_type}:${report_date}`;
        if (used.has(key)) continue;
        used.add(key);
        rows.push({
          person_id,
          import_id: imports.length ? imports[rand(imports.length)].id : null,
          period_type,
          report_date,
          period_start: isoDay(addDays(new Date(`${report_date}T00:00:00Z`), -7)),
          gateway_label: `${NOTE} snap`,
          gateway_producer: fullName(),
          gateway_npn: String(randInt(1000000, 9999999)),
          personal_ip_cents: randInt(0, 25000000),
          team_ip_cents: randInt(0, 80000000),
          first_leg_producer: fullName(),
          first_leg_percent: randInt(5, 60),
          outside_first_leg_cents: randInt(0, 5000000),
        });
      }
      await insertAll("producer_issued_premium", rows, {
        upsert: "person_id,period_type,report_date",
        ignoreDuplicates: true,
      });
    }
  }

  await report();
  console.log("\nDone. Sign in as builder@allstar.test and exercise heavy pages.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
