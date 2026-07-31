// Broadcast the server-issues UPDATE (root cause + backup link) to every active
// builder + producer, handed to Resend with a scheduled delivery time.
//
// Resend holds the message and delivers it at SCHEDULE_AT, so nothing needs to
// be running on this machine when it goes out. That's deliberate: a local cron
// would run unattended and can't be relied on for production sends.
//
// Dry-run by default (prints the recipient list + count, sends nothing).
// Pass --live to actually queue them.
//
//   node --experimental-strip-types --env-file=.env.local scripts/send-server-issues-update.mjs
//   node --experimental-strip-types --env-file=.env.local scripts/send-server-issues-update.mjs --live

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { serverIssuesUpdateEmail } from "../src/lib/emails/server-issues-update.ts";

// 7:30 AM Central (CDT, UTC-5) on 2026-07-30.
const SCHEDULE_AT = "2026-07-30T12:30:00Z";
const SCHEDULE_LABEL = "Thu Jul 30 2026, 7:30 AM Central (CDT)";

const live = process.argv.includes("--live");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM;

if (!url || !serviceKey || !apiKey || !from) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY / RESEND_FROM.",
  );
  process.exit(1);
}

if (new Date(SCHEDULE_AT).getTime() <= Date.now()) {
  console.error(
    `SCHEDULE_AT (${SCHEDULE_AT}) is in the past. Update it before sending.`,
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: people, error } = await admin
  .from("person")
  .select("id, full_name, email, is_builder, is_producer, status")
  .eq("is_producer", true) // builders also carry is_producer=true, so this covers both
  .neq("status", "removed")
  .not("email", "is", null);

if (error) throw error;

// is_producer is set on the person row at INVITE time, before they've actually
// graduated the recruit pipeline, so filtering on person alone would also catch
// still-in-progress recruits. Exclude anyone with a non-graduated recruit row.
const { data: activeRecruits, error: recruitErr } = await admin
  .from("recruit")
  .select("person_id, phase")
  .neq("phase", "graduated");
if (recruitErr) throw recruitErr;

const stillRecruiting = new Set((activeRecruits ?? []).map((r) => r.person_id));

const recipients = (people ?? [])
  .map((p) => ({ ...p, email: (p.email ?? "").trim() }))
  .filter((p) => p.email.length > 0)
  .filter((p) => !stillRecruiting.has(p.id));

console.log(
  `Excluded ${stillRecruiting.size} people still in the recruit pipeline (not yet graduated).`,
);
console.log(`Found ${recipients.length} active builder/producer recipients.`);
console.log(
  `  (builders: ${recipients.filter((p) => p.is_builder).length}, producers-only: ${recipients.filter((p) => !p.is_builder).length})`,
);
console.log(`Scheduled delivery: ${SCHEDULE_LABEL}  [${SCHEDULE_AT}]`);

if (!live) {
  console.log("\nDry run — nothing queued. Sample:");
  recipients.slice(0, 10).forEach((p) => console.log(`  ${p.full_name} <${p.email}>`));
  if (recipients.length > 10) console.log(`  ...and ${recipients.length - 10} more`);
  console.log("\nRe-run with --live to queue the scheduled send.");
  process.exit(0);
}

const { subject, html, text } = serverIssuesUpdateEmail();
const resend = new Resend(apiKey);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let queued = 0;
let failed = 0;
const failures = [];

for (const p of recipients) {
  // One retry on failure — a transient hiccup shouldn't silently drop an agent.
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { error: sendError } = await resend.emails.send({
      from,
      to: p.email,
      subject,
      html,
      text,
      scheduledAt: SCHEDULE_AT,
    });
    if (!sendError) {
      lastErr = null;
      break;
    }
    lastErr = sendError;
    if (attempt === 1) await sleep(1500);
  }

  if (lastErr) {
    failed++;
    failures.push(`${p.email}: ${lastErr.message ?? lastErr}`);
    console.error(`❌ ${p.email}: ${lastErr.message ?? lastErr}`);
  } else {
    queued++;
  }

  await sleep(550); // stay comfortably under Resend's rate limit
}

console.log(
  `\n✅ Queued: ${queued}   ❌ Failed: ${failed}   Total: ${recipients.length}`,
);
console.log(`   Delivery: ${SCHEDULE_LABEL}`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  ${f}`));
}
