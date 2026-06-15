// "You're officially a producer" email. Sent to a recruit the moment their
// builder promotes them to producer (after they've submitted contracting). The
// celebratory "you made it" moment — points them straight at the producer
// dashboard that just unlocked for them.
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

export function promotedToProducerEmail(params: {
  firstName?: string; // the new producer's first name; optional
  dashboardUrl: string; // link to their new producer dashboard; primary CTA
}): { subject: string; html: string; text: string } {
  const { firstName, dashboardUrl } = params;
  const lead = firstName
    ? `Congratulations, ${escapeHtml(firstName)} — `
    : "Congratulations — ";
  const subject = "You're officially a producer";

  const html = shell({
    subject,
    preheader: "You've been promoted to producer.",
    rows: [
      headingRow("You're officially a producer."),
      paragraphRow(
        `${lead}you've been promoted to <strong style="color:#f5f5f5;">Producer</strong>. Your producer dashboard is live now — the daily tracker, leaderboard, client pipeline, and the underwriting wizard are all yours. Time to write business.`,
      ),
      buttonRow("Open your producer dashboard", dashboardUrl),
      footerRow(
        "Welcome to the team. Your upline is in your corner — reach out anytime.",
      ),
    ].join("\n"),
  });

  const text = [
    "You're officially a producer.",
    "",
    `${firstName ? `Congratulations, ${firstName} — ` : "Congratulations — "}you've been promoted to Producer. Your producer dashboard is live now: the daily tracker, leaderboard, client pipeline, and the underwriting wizard. Time to write business.`,
    "",
    `Open your producer dashboard: ${dashboardUrl}`,
    "",
    "Welcome to the team.",
    "© All Star Life Group",
  ].join("\n");

  return { subject, html, text };
}
