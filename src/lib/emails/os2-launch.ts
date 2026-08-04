// Broadcast announcement email — the All Star OS 2.0 launch, sent to the whole
// agent base with a button to the Loom walkthrough. There used to be a matching
// in-app popup carrying the same video; it was removed once the redesign had
// landed, so this email is the only place that walkthrough is linked now.
//
// Returns { subject, html, text } for the Resend sendEmail() helper.

import {
  shell,
  headingRow,
  paragraphRow,
  buttonRow,
  fallbackRow,
  footerRow,
} from "./_layout";

export const OS2_WALKTHROUGH_URL =
  "https://www.loom.com/share/c7957397602b4b23b4df47ca88b22c6d";

export function os2LaunchEmail(): { subject: string; html: string; text: string } {
  const subject = "All Star OS 2.0 is live";

  const rows = [
    headingRow("All Star OS 2.0"),
    paragraphRow("Happy Friday, All Star."),
    paragraphRow(
      "We just shipped a huge update for you. Say hello to All Star OS 2.0.",
      { tight: true },
    ),
    paragraphRow(
      "We simplified the navigation and cleaned up the look of the whole platform. Everything you use every day is easier to find and faster to get to. Same OS you know, a lot less in your way.",
      { tight: true },
    ),
    paragraphRow(
      "We recorded a short video breaking down what changed. We highly recommend watching it before you log in today.",
      { tight: true },
    ),
    buttonRow("Watch the walkthrough", OS2_WALKTHROUGH_URL),
    fallbackRow(OS2_WALKTHROUGH_URL),
    paragraphRow("See you inside,<br/>The All Star OS Team", { tight: true }),
    footerRow("You're receiving this because you have an All Star Life Group account."),
  ].join("\n");

  const html = shell({
    subject,
    preheader: "A brand new look, and a short walkthrough before you log in.",
    rows,
  });

  const text = [
    "Happy Friday, All Star.",
    "",
    "We just shipped a huge update for you. Say hello to All Star OS 2.0.",
    "",
    "We simplified the navigation and cleaned up the look of the whole platform. Everything you use every day is easier to find and faster to get to. Same OS you know, a lot less in your way.",
    "",
    "We recorded a short video breaking down what changed. We highly recommend watching it before you log in today.",
    "",
    `Watch the walkthrough: ${OS2_WALKTHROUGH_URL}`,
    "",
    "See you inside,",
    "The All Star OS Team",
  ].join("\n");

  return { subject, html, text };
}
