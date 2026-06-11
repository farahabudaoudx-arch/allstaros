// "Congrats — first steps done / onboarding begins" email. Sent to a recruit
// when their builder advances them out of licensing into onboarding. Warm,
// congratulatory — they cleared the hardest early hurdle.
//
// Returns { subject, html, text } for the Resend sendEmail() helper.

import {
  shell,
  headingRow,
  paragraphRow,
  buttonRow,
  footerRow,
  escapeHtml,
} from "./_layout";

export function onboardingStartedEmail(params: {
  firstName?: string; // recruit's first name; optional → generic greeting
  url: string; // link into the recruit's portal; primary CTA
}): { subject: string; html: string; text: string } {
  const { firstName, url } = params;

  const heading = firstName
    ? `The first steps are done, ${escapeHtml(firstName)}.`
    : "The first steps are done.";
  const subject = "Congrats — your onboarding begins";

  const html = shell({
    subject,
    preheader: "You've completed the first steps of your journey. Onboarding starts now.",
    rows: [
      headingRow(heading),
      paragraphRow(
        "You've cleared the hardest early hurdle — you're licensed. That's the part most people never finish. Real congratulations are in order.",
      ),
      paragraphRow(
        "Onboarding is next: carrier appointments, your tools, and your first presentations. One gated step at a time — just keep showing up.",
        { tight: true },
      ),
      buttonRow("Continue your journey", url),
      footerRow(
        "You're receiving this because you advanced to onboarding on the All Star pipeline.",
      ),
    ].join("\n"),
  });

  const text = [
    firstName ? `The first steps are done, ${firstName}.` : "The first steps are done.",
    "",
    "You've cleared the hardest early hurdle — you're licensed. That's the part most people never finish. Real congratulations are in order.",
    "",
    "Onboarding is next: carrier appointments, your tools, and your first presentations. One gated step at a time — just keep showing up.",
    "",
    "Continue your journey:",
    url,
    "",
    "You're receiving this because you advanced to onboarding on the All Star pipeline.",
    "© All Star Life Group",
  ].join("\n");

  return { subject, html, text };
}
