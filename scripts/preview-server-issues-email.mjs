// Render the server-issues notice email and send a live draft so you can see it
// in a real inbox before it goes out to the full agent base. Run against your env:
//
//   node --experimental-strip-types --env-file=.env.local \
//     scripts/preview-server-issues-email.mjs you@example.com

import { Resend } from "resend";
import { serverIssuesNoticeEmail } from "../src/lib/emails/server-issues-notice.ts";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM;
const to = process.argv[2] ?? process.env.TEST_EMAIL_TO;

if (!apiKey || !from || !to) {
  console.error(
    "Need RESEND_API_KEY, RESEND_FROM, and a recipient arg. Run:\n" +
      "  node --experimental-strip-types --env-file=.env.local scripts/preview-server-issues-email.mjs you@example.com",
  );
  process.exit(1);
}

const { subject, html, text } = serverIssuesNoticeEmail();

const resend = new Resend(apiKey);
const { data, error } = await resend.emails.send({
  from,
  to,
  subject: `[DRAFT] ${subject}`,
  html,
  text,
});

if (error) {
  console.error("❌ Send failed:", error.message ?? error);
  process.exit(1);
}
console.log(`✅ Draft sent. id: ${data?.id}`);
console.log(`   Check ${to}.`);
