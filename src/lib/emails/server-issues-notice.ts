// Broadcast notice email — sent to the whole agent base to acknowledge a known,
// outside-our-control server issue (intermittent SSL/connection errors on some
// networks) and reassure agents we're on it.
//
// Returns { subject, html, text } for the Resend sendEmail() helper.

import {
  shell,
  headingRow,
  paragraphRow,
  footerRow,
  escapeHtml,
} from "./_layout";

export type ServerIssuesNoticeParams = {
  /** Defaults to "All Star Agents" when omitted. */
  greetingName?: string;
};

export function serverIssuesNoticeEmail(
  params: ServerIssuesNoticeParams = {},
): { subject: string; html: string; text: string } {
  const name = params.greetingName ?? "All Star Agents";
  const subject = "Server Issues";

  const rows = [
    headingRow("Server Issues"),
    paragraphRow(
      `Good morning, ${escapeHtml(name)}.`,
    ),
    paragraphRow(
      "Not everyone has experienced this, however we have gotten a meaningful number of reports of an issue where the site fails to load with a secure connection error.",
    ),
    paragraphRow(
      "This is a known issue that is outside of our control, having to do with where we host our servers at. We are actively working on fixing it and appreciate your patience.",
      { tight: true },
    ),
    paragraphRow(
      "If you run into it, try switching networks, for example using your phone's hotspot, your cellular data, or a different Wi-Fi network. It's not something you're doing wrong, and it's not something you can fix on your end. It has to do with our server, and we're working hard to fix it for you.",
      { tight: true },
    ),
    paragraphRow("Thank you,<br/>All Star OS Team", { tight: true }),
    footerRow("You're receiving this because you have an All Star Life Group account."),
  ].join("\n");

  const html = shell({
    subject,
    preheader:
      "A known, outside-our-control issue is causing some agents to see a server connection error. We're on it.",
    rows,
  });

  const text = [
    `Good morning, ${name}.`,
    "",
    "Not everyone has experienced this, however we have gotten a meaningful number of reports of an issue where the site fails to load with a secure connection error.",
    "",
    "This is a known issue that is outside of our control, having to do with where we host our servers at. We are actively working on fixing it and appreciate your patience.",
    "",
    "If you run into it, try switching networks, for example using your phone's hotspot, your cellular data, or a different Wi-Fi network. It's not something you're doing wrong, and it's not something you can fix on your end. It has to do with our server, and we're working hard to fix it for you.",
    "",
    "Thank you,",
    "All Star OS Team",
  ].join("\n");

  return { subject, html, text };
}
