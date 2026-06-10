// Render every All Star email template and send a live sample of each, so you
// can review them in a real inbox. Uses fake names/links — design preview only.
//
//   node --experimental-strip-types --env-file=.env.local \
//     scripts/preview-all-emails.mjs you@example.com

import { Resend } from "resend";
import { welcomeEmail } from "../src/lib/emails/welcome.ts";
import { passwordResetEmail } from "../src/lib/emails/password-reset.ts";
import { onboardingStartedEmail } from "../src/lib/emails/onboarding-started.ts";
import { bootcampStartedEmail } from "../src/lib/emails/bootcamp-started.ts";
import { graduationEmail } from "../src/lib/emails/graduation.ts";
import { newRecruitEmail } from "../src/lib/emails/new-recruit.ts";
import { teamDigestEmail } from "../src/lib/emails/team-digest.ts";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM;
const to = process.argv[2] ?? process.env.TEST_EMAIL_TO;

if (!apiKey || !from || !to) {
  console.error(
    "Need RESEND_API_KEY, RESEND_FROM, and a recipient arg. Run:\n" +
      "  node --experimental-strip-types --env-file=.env.local scripts/preview-all-emails.mjs you@example.com",
  );
  process.exit(1);
}

const APP = "https://app.allstarlifegroup.com";

const samples = [
  ["1 · Invite / setup", welcomeEmail({ firstName: "Marcus", setupUrl: `${APP}/auth/setup?token=preview` })],
  ["2 · Password reset", passwordResetEmail({ firstName: "Marcus", resetUrl: `${APP}/auth/reset?token=preview` })],
  ["5 · Onboarding begins", onboardingStartedEmail({ firstName: "Marcus", url: `${APP}/portal` })],
  ["6 · Bootcamp", bootcampStartedEmail({ firstName: "Marcus", url: `${APP}/portal` })],
  ["7 · Graduation", graduationEmail({ firstName: "Marcus", url: `${APP}/portal` })],
  ["8 · New recruit (builder)", newRecruitEmail({ builderFirstName: "Dana", recruitName: "Marcus Webb", state: "TX", recruitUrl: `${APP}/producer/recruits/123` })],
  ["9 · Team digest (builder)", teamDigestEmail({
    builderFirstName: "Dana",
    periodLabel: "Today",
    production: { value: "$48,200 AP", caption: "14 policies submitted across your team", url: `${APP}/dashboard/team?view=production` },
    activity: { value: "126 dials · 18 presentations", caption: "Team activity logged today", url: `${APP}/dashboard/team?view=activity` },
    unreadMessages: { count: 3, url: `${APP}/producer/messages` },
    stalledRecruits: [
      { name: "Marcus Webb", detail: "exam not scheduled", phase: "licensing" },
      { name: "Tara Nguyen", detail: "check-ins lapsed 4 days", phase: "onboarding" },
      { name: "Cole Rivera", detail: "bootcamp gate missed", phase: "bootcamp" },
    ],
    flaggedBehavior: [
      { name: "Jordan Pike", note: "missed 3 scheduled sits this week" },
      { name: "Alexis Cho", note: "no dials logged in 5 days" },
    ],
    dashboardUrl: `${APP}/dashboard`,
  })],
];

const resend = new Resend(apiKey);

for (const [label, email] of samples) {
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: `[Preview] ${label} — ${email.subject}`,
    html: email.html,
    text: email.text,
  });
  if (error) {
    console.error(`❌ ${label}: ${error.message ?? error}`);
  } else {
    console.log(`✅ ${label} (id ${data?.id})`);
  }
  // Stay under Resend's 5-requests-per-second limit.
  await new Promise((r) => setTimeout(r, 300));
}

console.log(`\nDone. Check ${to}.`);
