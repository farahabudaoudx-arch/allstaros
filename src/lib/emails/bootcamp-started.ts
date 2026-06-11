// "Welcome to your 28-day bootcamp" email. Sent to a recruit when their builder
// advances them into bootcamp. Sets the tone for the structured first month.
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

export function bootcampStartedEmail(params: {
  firstName?: string; // recruit's first name; optional → generic greeting
  url: string; // link into the recruit's portal; primary CTA
}): { subject: string; html: string; text: string } {
  const { firstName, url } = params;

  const heading = firstName
    ? `Welcome to your bootcamp, ${escapeHtml(firstName)}.`
    : "Welcome to your 28-day bootcamp.";
  const subject = "Welcome to your 28-day bootcamp";

  const html = shell({
    subject,
    preheader: "28 days to turn your license into a business.",
    rows: [
      headingRow(heading),
      paragraphRow(
        "This is where a license becomes a business. The next 28 days follow a clear structure — the why, the financial inventory, the ring of objections, the application close — built to put real production on the board.",
      ),
      paragraphRow(
        "Show up daily, hit your check-ins, and submit your policies. Your builder is watching and ready to help.",
        { tight: true },
      ),
      buttonRow("Start day one", url),
      footerRow(
        "You're receiving this because you advanced to bootcamp on the All Star pipeline.",
      ),
    ].join("\n"),
  });

  const text = [
    firstName ? `Welcome to your bootcamp, ${firstName}.` : "Welcome to your 28-day bootcamp.",
    "",
    "This is where a license becomes a business. The next 28 days follow a clear structure — the why, the financial inventory, the ring of objections, the application close — built to put real production on the board.",
    "",
    "Show up daily, hit your check-ins, and submit your policies. Your builder is watching and ready to help.",
    "",
    "Start day one:",
    url,
    "",
    "You're receiving this because you advanced to bootcamp on the All Star pipeline.",
    "© All Star Life Group",
  ].join("\n");

  return { subject, html, text };
}
