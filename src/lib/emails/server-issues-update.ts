// Follow-up broadcast to the agent base: we found the root cause of the loading
// failures (security vendors wrongly categorizing the domain, which makes some
// ISPs/routers block it), disputes are filed, and here's a backup URL to use in
// the meantime.
//
// Returns { subject, html, text } for the Resend sendEmail() helper.

import {
  shell,
  headingRow,
  paragraphRow,
  buttonRow,
  fallbackRow,
  footerRow,
  escapeHtml,
} from "./_layout";

const BACKUP_URL = "https://all-star-agency.vercel.app";

export type ServerIssuesUpdateParams = {
  /** Defaults to "All Star Agents" when omitted. */
  greetingName?: string;
};

export function serverIssuesUpdateEmail(
  params: ServerIssuesUpdateParams = {},
): { subject: string; html: string; text: string } {
  const name = params.greetingName ?? "All Star Agents";
  const subject = "Server Issues: We Found the Cause";

  const rows = [
    headingRow("We found the cause"),
    paragraphRow(`Good morning, ${escapeHtml(name)}.`),
    paragraphRow(
      "We have an update on the loading issues some of you have been running into.",
    ),
    paragraphRow(
      "After digging in, we found the root cause, and the good news is that it is not a problem with the platform itself. A handful of internet security services have incorrectly categorized our app as spam. That bad label is what causes some internet providers, home routers, and networks to block the site from loading for certain people.",
      { tight: true },
    ),
    paragraphRow(
      "We have disputes filed with each of those services to get the label corrected. Their reviews take a few days.",
      { tight: true },
    ),
    paragraphRow(
      "In the meantime, if you have any trouble loading the app at all, use this link instead and you should get right in:",
    ),
    buttonRow("Open the backup link", BACKUP_URL),
    fallbackRow(BACKUP_URL),
    paragraphRow(
      "Thank you for your patience while we work through this. These issues are never the easiest to track down, but rest assured we are on it.",
    ),
    paragraphRow("Thank you,<br/>All Star OS Team", { tight: true }),
    footerRow(
      "You're receiving this because you have an All Star Life Group account.",
    ),
  ].join("\n");

  const html = shell({
    subject,
    preheader:
      "The loading issue is a bad spam label from outside security services. Disputes are filed. Use the backup link in the meantime.",
    rows,
  });

  const text = [
    `Good morning, ${name}.`,
    "",
    "We have an update on the loading issues some of you have been running into.",
    "",
    "After digging in, we found the root cause, and the good news is that it is not a problem with the platform itself. A handful of internet security services have incorrectly categorized our app as spam. That bad label is what causes some internet providers, home routers, and networks to block the site from loading for certain people.",
    "",
    "We have disputes filed with each of those services to get the label corrected. Their reviews take a few days.",
    "",
    "In the meantime, if you have any trouble loading the app at all, use this link instead and you should get right in:",
    "",
    BACKUP_URL,
    "",
    "Thank you for your patience while we work through this. These issues are never the easiest to track down, but rest assured we are on it.",
    "",
    "Thank you,",
    "All Star OS Team",
  ].join("\n");

  return { subject, html, text };
}
