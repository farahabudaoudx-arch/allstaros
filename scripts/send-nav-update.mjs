// Broadcast the navigation update announcement to every active builder + producer.
// Dry-run by default (prints the recipient list + count, sends nothing).
// Pass --live to actually send.
//
//   node --experimental-strip-types --import ./scripts/_ts-resolve.mjs --env-file=.env.local scripts/send-nav-update.mjs
//   node --experimental-strip-types --import ./scripts/_ts-resolve.mjs --env-file=.env.local scripts/send-nav-update.mjs --live
//
// --only=you@example.com sends the real thing to just that address, for a
// final look in a real inbox before the full broadcast.

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { navUpdateEmail } from "../src/lib/emails/nav-update.ts";

const live = process.argv.includes("--live");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice("--only=".length).trim() : null;

// --at=<ISO 8601> hands the send to Resend's scheduler instead of sending now,
// so the whole roster lands at one moment rather than trickling out over the
// minutes it takes to loop the list.
const atArg = process.argv.find((a) => a.startsWith("--at="));
const scheduledAt = atArg ? atArg.slice("--at=".length).trim() : null;
if (scheduledAt && Number.isNaN(Date.parse(scheduledAt))) {
  console.error(`--at is not a valid date: ${scheduledAt}`);
  process.exit(1);
}

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
// graduated the recruit pipeline (interview/licensing/onboarding/bootcamp), so
// filtering on person alone would also catch still-in-progress recruits. Pull
// every non-graduated recruit row and exclude those person_ids — a real
// builder/producer either has no recruit row at all, or one with
// phase='graduated'.
const { data: activeRecruits, error: recruitErr } = await admin
  .from("recruit")
  .select("person_id, phase")
  .neq("phase", "graduated");
if (recruitErr) throw recruitErr;

const stillRecruiting = new Set((activeRecruits ?? []).map((r) => r.person_id));

const allRecipients = (people ?? [])
  .map((p) => ({ ...p, email: (p.email ?? "").trim() }))
  .filter((p) => p.email.length > 0)
  .filter((p) => !stillRecruiting.has(p.id));

// --only overrides the whole audience with a single address, so a test send
// can't accidentally reach the roster.
// --exclude=a@x.com,b@y.com drops addresses that already have a copy queued.
const excludeArg = process.argv.find((a) => a.startsWith("--exclude="));
const excluded = new Set(
  (excludeArg ? excludeArg.slice("--exclude=".length) : "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

const recipients = only
  // --name=Nick sets the greeting on a test send, so the copy that lands in the
  // test inbox is byte-for-byte what a real agent would get.
  ? [
      {
        id: "only",
        full_name: (process.argv.find((a) => a.startsWith("--name=")) ?? "--name=").slice(
          "--name=".length,
        ),
        email: only,
        is_builder: false,
      },
    ]
  : allRecipients.filter((p) => !excluded.has(p.email.toLowerCase()));

if (excluded.size) console.log(`Excluded ${excluded.size} address(es) by --exclude.`);

if (only) console.log(`--only set: sending to ${only} and nobody else.`);

console.log(
  `Excluded ${stillRecruiting.size} people still in the recruit pipeline (not yet graduated).`,
);

console.log(`Found ${recipients.length} active builder/producer recipients.`);
console.log(
  `  (builders: ${recipients.filter((p) => p.is_builder).length}, producers-only: ${recipients.filter((p) => !p.is_builder).length})`,
);

if (scheduledAt) {
  const when = new Date(scheduledAt);
  console.log(
    `Scheduled for ${when.toLocaleString("en-US", { timeZone: "America/Chicago", timeZoneName: "short" })} (Chicago) / ${when.toISOString()}`,
  );
}

if (!live) {
  console.log("\nDry run — no email sent. Sample:");
  recipients.slice(0, 10).forEach((p) => console.log(`  ${p.full_name} <${p.email}>`));
  if (recipients.length > 10) console.log(`  ...and ${recipients.length - 10} more`);
  console.log("\nRe-run with --live to actually send.");
  process.exit(0);
}

const resend = new Resend(apiKey);

// Greeting people by name is the strongest lever against Gmail's Promotions
// tab, so the body is rendered per recipient rather than once for everyone.
// Anyone whose full_name is blank falls back to the generic greeting.
const firstNameOf = (fullName) => (fullName ?? "").trim().split(/\s+/)[0] || undefined;

let sent = 0;
let failed = 0;
// Resend's default rate limit is 2 requests/second, so pace the loop.
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const queued = [];
for (const p of recipients) {
  const { subject, html, text } = navUpdateEmail({ firstName: firstNameOf(p.full_name) });
  const { data, error: sendError } = await resend.emails.send({
    from,
    to: p.email,
    subject,
    html,
    text,
    ...(scheduledAt ? { scheduledAt } : {}),
  });
  await pause(600);
  if (sendError) {
    failed++;
    console.error(`❌ ${p.email}: ${sendError.message ?? sendError}`);
  } else {
    if (data?.id) queued.push({ id: data.id, email: p.email, name: p.full_name });
    sent++;
  }
}

// Scheduled sends can be cancelled or rescheduled by id, so keep the receipt.
if (scheduledAt && queued.length) {
  const { writeFileSync } = await import("node:fs");
  const path = `scripts/.nav-update-queued.json`;
  writeFileSync(path, JSON.stringify({ scheduledAt, queued }, null, 2));
  console.log(`\nWrote ${queued.length} scheduled ids to ${path} (needed to cancel).`);
}

console.log(
  `\n✅ ${scheduledAt ? "Scheduled" : "Sent"}: ${sent}   ❌ Failed: ${failed}   Total: ${recipients.length}`,
);
