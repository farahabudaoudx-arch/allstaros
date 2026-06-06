// Smoke-test the Resend email pipeline end-to-end. Verifies the API key works
// and the from-domain is authenticated. Run against your env:
//
//   node --env-file=.env.local scripts/send-test-email.mjs you@example.com
//
// If the address argument is omitted it falls back to TEST_EMAIL_TO from env.

import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM;
const to = process.argv[2] ?? process.env.TEST_EMAIL_TO;

if (!apiKey || !from) {
  console.error(
    "Missing RESEND_API_KEY or RESEND_FROM. Run with: node --env-file=.env.local scripts/send-test-email.mjs you@example.com",
  );
  process.exit(1);
}
if (!to) {
  console.error(
    "No recipient. Pass one as an argument: scripts/send-test-email.mjs you@example.com",
  );
  process.exit(1);
}

const resend = new Resend(apiKey);

const { data, error } = await resend.emails.send({
  from,
  to,
  subject: "All Star OS — Resend test ✅",
  html: "<p>If you're reading this, Resend is wired up and your domain is authenticated. 🎉</p>",
  text: "If you're reading this, Resend is wired up and your domain is authenticated.",
});

if (error) {
  console.error("❌ Send failed:", error.message ?? error);
  process.exit(1);
}

console.log(`✅ Sent. Message id: ${data?.id}`);
console.log(`   Check the inbox at ${to} (and the spam folder, just in case).`);
