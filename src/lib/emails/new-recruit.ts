// "New recruit added" email. Sent to a builder when a new recruit enters their
// pipeline (created directly or via a join code). Prompts them to confirm the
// interview and get the recruit moving.
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

export function newRecruitEmail(params: {
  builderFirstName?: string; // the builder's first name; optional
  recruitName: string; // the new recruit's display name
  state?: string; // recruit's state code, if known (shown in parens)
  recruitUrl: string; // link to the recruit's detail page; primary CTA
}): { subject: string; html: string; text: string } {
  const { builderFirstName, recruitName, state, recruitUrl } = params;

  const safeName = escapeHtml(recruitName);
  const where = state ? ` (${escapeHtml(state)})` : "";
  const lead = builderFirstName
    ? `Heads up, ${escapeHtml(builderFirstName)} — `
    : "";
  const subject = `New recruit: ${recruitName}`;

  const html = shell({
    subject,
    preheader: `${recruitName} just entered your pipeline.`,
    rows: [
      headingRow("New recruit in your pipeline."),
      paragraphRow(
        `${lead}<strong style="color:#f5f5f5;">${safeName}</strong>${where} just entered your pipeline at licensing. Confirm their interview and get them moving on day one.`,
      ),
      buttonRow(`View ${safeName}`, recruitUrl),
      footerRow(
        "You're receiving this because you're their builder on the All Star pipeline.",
      ),
    ].join("\n"),
  });

  const text = [
    "New recruit in your pipeline.",
    "",
    `${builderFirstName ? `Heads up, ${builderFirstName} — ` : ""}${recruitName}${state ? ` (${state})` : ""} just entered your pipeline at licensing. Confirm their interview and get them moving on day one.`,
    "",
    `View ${recruitName}:`,
    recruitUrl,
    "",
    "You're receiving this because you're their builder on the All Star pipeline.",
    "© All Star Life Group",
  ].join("\n");

  return { subject, html, text };
}
