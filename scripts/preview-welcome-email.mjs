// Render the welcome email template and send a live sample so you can see it in
// a real inbox. Run against your env:
//
//   node --experimental-strip-types --env-file=.env.local \
//     scripts/preview-welcome-email.mjs you@example.com
//
// Uses a fake setup link — this is a design preview, not a real account invite.

import { Resend } from "resend";
import { welcomeEmail } from "../src/lib/emails/welcome.ts";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM;
const to = process.argv[2] ?? process.env.TEST_EMAIL_TO;

if (!apiKey || !from || !to) {
  console.error(
    "Need RESEND_API_KEY, RESEND_FROM, and a recipient arg. Run:\n" +
      "  node --experimental-strip-types --env-file=.env.local scripts/preview-welcome-email.mjs you@example.com",
  );
  process.exit(1);
}

const { subject, html, text } = welcomeEmail({
  firstName: "Marcus",
  setupUrl: "https://app.allstarlifegroup.com/auth/setup?token=preview-sample-token",
  expiryHours: 48,
});

const resend = new Resend(apiKey);
const { data, error } = await resend.emails.send({ from, to, subject, html, text });

if (error) {
  console.error("❌ Send failed:", error.message ?? error);
  process.exit(1);
}
console.log(`✅ Welcome-email preview sent. id: ${data?.id}`);
console.log(`   Check ${to}.`);
