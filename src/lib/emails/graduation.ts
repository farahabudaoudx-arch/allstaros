// "You graduated" email. Sent to a recruit when they complete the pipeline
// (phase = graduated). The celebration moment.
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

export function graduationEmail(params: {
  firstName?: string; // recruit's first name; optional → generic greeting
  url: string; // link into the app; primary CTA
}): { subject: string; html: string; text: string } {
  const { firstName, url } = params;

  const heading = firstName
    ? `You graduated, ${escapeHtml(firstName)}.`
    : "You graduated.";
  const subject = "🏆 You graduated";

  const html = shell({
    subject,
    preheader: "From a passed interview to a built book. You did it.",
    rows: [
      headingRow(heading),
      paragraphRow(
        "You carried it the whole way — from a passed interview through licensing, onboarding, and a 28-day bootcamp — to a producer who can write business. That's the goal, and you hit it.",
      ),
      paragraphRow(
        "This is the start, not the finish line. Keep building.",
        { tight: true },
      ),
      buttonRow("Open All Star", url),
      footerRow(
        "You're receiving this because you graduated the All Star pipeline. Congratulations from the whole team.",
      ),
    ].join("\n"),
  });

  const text = [
    firstName ? `You graduated, ${firstName}.` : "You graduated.",
    "",
    "You carried it the whole way — from a passed interview through licensing, onboarding, and a 28-day bootcamp — to a producer who can write business. That's the goal, and you hit it.",
    "",
    "This is the start, not the finish line. Keep building.",
    "",
    "Open All Star:",
    url,
    "",
    "You're receiving this because you graduated the All Star pipeline. Congratulations from the whole team.",
    "© All Star Life Group",
  ].join("\n");

  return { subject, html, text };
}
