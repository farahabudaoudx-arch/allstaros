// "A new producer on your team" email. Sent to a builder when one of their
// downline is promoted from recruit to producer — a heads-up so they can welcome
// them, get them their first leads, and help them write on day one.
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

export function newProducerEmail(params: {
  builderFirstName?: string; // the builder's first name; optional
  producerName: string; // the newly-promoted producer's display name
  producerUrl: string; // link to the producer in the builder's team view; CTA
}): { subject: string; html: string; text: string } {
  const { builderFirstName, producerName, producerUrl } = params;
  const safe = escapeHtml(producerName);
  const lead = builderFirstName
    ? `Heads up, ${escapeHtml(builderFirstName)} — `
    : "";
  const subject = `New producer on your team: ${producerName}`;

  const html = shell({
    subject,
    preheader: `${producerName} just became a producer.`,
    rows: [
      headingRow("A new producer on your team."),
      paragraphRow(
        `${lead}<strong style="color:#f5f5f5;">${safe}</strong> just got promoted from recruit to <strong style="color:#f5f5f5;">Producer</strong>. They're on the producer dashboard now — reach out, get them their first leads, and help them write day one.`,
      ),
      buttonRow(`View ${safe}`, producerUrl),
      footerRow(
        "You're receiving this because you're their builder on the All Star team.",
      ),
    ].join("\n"),
  });

  const text = [
    "A new producer on your team.",
    "",
    `${builderFirstName ? `Heads up, ${builderFirstName} — ` : ""}${producerName} just got promoted from recruit to Producer. They're on the producer dashboard now — reach out, get them their first leads, and help them write day one.`,
    "",
    `View ${producerName}: ${producerUrl}`,
    "",
    "You're receiving this because you're their builder on the All Star team.",
    "© All Star Life Group",
  ].join("\n");

  return { subject, html, text };
}
