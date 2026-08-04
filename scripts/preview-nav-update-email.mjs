// Render the navigation update email and send a live draft so you can see it in
// a real inbox before it goes out to the full agent base. Run against your env:
//
//   node --experimental-strip-types --import ./scripts/_ts-resolve.mjs --env-file=.env.local \
//     scripts/preview-nav-update-email.mjs you@example.com
//
// Pass --html to write the rendered file to scripts/.nav-update-preview.html
// and skip the send, for a quick look in a browser.

import { Resend } from "resend";
import { navUpdateEmail } from "../src/lib/emails/nav-update.ts";

// --name=Nick previews the personalized greeting the real broadcast sends.
const nameArg = process.argv.find((a) => a.startsWith("--name="));
const { subject, html, text } = navUpdateEmail({
  firstName: nameArg ? nameArg.slice("--name=".length).trim() : undefined,
});

if (process.argv.includes("--html")) {
  const { writeFileSync } = await import("node:fs");
  const path = "scripts/.nav-update-preview.html";
  writeFileSync(path, html);
  console.log(`✅ Wrote ${path} — open it in a browser.`);
  process.exit(0);
}

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM;
const to = process.argv[2] ?? process.env.TEST_EMAIL_TO;

if (!apiKey || !from || !to) {
  console.error(
    "Need RESEND_API_KEY, RESEND_FROM, and a recipient arg. Run:\n" +
      "  node --experimental-strip-types --import ./scripts/_ts-resolve.mjs --env-file=.env.local scripts/preview-nav-update-email.mjs you@example.com",
  );
  process.exit(1);
}

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
