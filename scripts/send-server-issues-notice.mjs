// Broadcast the server-issues notice to every active builder + producer.
// Dry-run by default (prints the recipient list + count, sends nothing).
// Pass --live to actually send.
//
//   node --experimental-strip-types --env-file=.env.local scripts/send-server-issues-notice.mjs
//   node --experimental-strip-types --env-file=.env.local scripts/send-server-issues-notice.mjs --live

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { serverIssuesNoticeEmail } from "../src/lib/emails/server-issues-notice.ts";

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

if (!live) {
  console.log("\nDry run — no email sent. Sample:");
  recipients.slice(0, 10).forEach((p) => console.log(`  ${p.full_name} <${p.email}>`));
  if (recipients.length > 10) console.log(`  ...and ${recipients.length - 10} more`);
  console.log("\nRe-run with --live to actually send.");
  process.exit(0);
}

const { subject, html, text } = serverIssuesNoticeEmail();
const resend = new Resend(apiKey);

let sent = 0;
let failed = 0;
for (const p of recipients) {
  const { error: sendError } = await resend.emails.send({
    from,
    to: p.email,
    subject,
    html,
    text,
  });
  if (sendError) {
    failed++;
    console.error(`❌ ${p.email}: ${sendError.message ?? sendError}`);
  } else {
    sent++;
  }
}

console.log(`\n✅ Sent: ${sent}   ❌ Failed: ${failed}   Total: ${recipients.length}`);
