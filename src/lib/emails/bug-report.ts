// Bug-report email. Sent to the internal bug inbox when someone taps
// "Report a bug" in the sidebar and submits the form. Carries what they typed,
// who they are, and where in the app they hit the problem. Any screenshot they
// attach rides along as a real email attachment (added by the action, not here).
//
// Returns { subject, html, text } for the Resend sendEmail() helper.

import {
  shell,
  headingRow,
  paragraphRow,
  customRow,
  footerRow,
  escapeHtml,
  BRAND,
} from "./_layout";

export function bugReportEmail(params: {
  message: string; // what the reporter typed — required
  reporterName?: string; // signed-in person's name, if known
  reporterEmail?: string; // signed-in person's email, if known
  pageUrl?: string; // the page they were on when they reported
  userAgent?: string; // browser/OS string, for reproducing
  hasScreenshot?: boolean; // whether an image is attached to this email
}): { subject: string; html: string; text: string } {
  const {
    message,
    reporterName,
    reporterEmail,
    pageUrl,
    userAgent,
    hasScreenshot,
  } = params;

  const who = reporterName || reporterEmail || "Someone";
  const subject = `🐞 Bug report from ${who}`;

  // A small definition list of context rows (label / value), only including the
  // fields we actually have.
  const meta: Array<[string, string]> = [];
  if (reporterName) meta.push(["From", reporterName]);
  if (reporterEmail) meta.push(["Email", reporterEmail]);
  if (pageUrl) meta.push(["Page", pageUrl]);
  if (userAgent) meta.push(["Browser", userAgent]);
  meta.push(["Screenshot", hasScreenshot ? "Attached" : "None"]);

  const B = BRAND;

  const metaRowsHtml = meta
    .map(
      ([label, value]) => `<tr>
        <td style="padding:6px 0;font-family:${B.FONT};font-size:13px;color:${B.MUTE};white-space:nowrap;vertical-align:top;width:90px;">${escapeHtml(label)}</td>
        <td style="padding:6px 0 6px 14px;font-family:${B.FONT};font-size:13px;color:${B.SUBTLE};word-break:break-word;">${escapeHtml(value)}</td>
      </tr>`,
    )
    .join("");

  // The reporter's message in a quoted card, preserving their line breaks.
  const messageHtml = escapeHtml(message).replace(/\n/g, "<br />");
  const messageCard = `<div style="border:1px solid ${B.HAIRLINE};border-radius:12px;padding:18px 20px;background-color:#080808;">
      <div style="font-family:${B.FONT};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${B.GOLD_SOFT};margin-bottom:10px;">What happened</div>
      <div style="font-family:${B.FONT};font-size:15px;line-height:1.6;color:${B.INK};">${messageHtml}</div>
    </div>`;

  const metaTable = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:4px;">${metaRowsHtml}</table>`;

  const html = shell({
    subject,
    preheader: message.slice(0, 110),
    rows: [
      headingRow("New bug report"),
      paragraphRow(
        "Someone flagged a problem from inside All Star OS. The details are below — just reply to this email to reach them.",
      ),
      customRow(messageCard),
      customRow(metaTable),
      footerRow(
        "You're getting this because you're the bug-report recipient for All Star OS. Change the inbox by setting BUG_REPORT_TO in the environment.",
      ),
    ].join("\n"),
  });

  const text = [
    "New bug report",
    "",
    "What happened:",
    message,
    "",
    "— Details —",
    ...meta.map(([label, value]) => `${label}: ${value}`),
    "",
    "Reply to this email to reach the reporter.",
    "",
    "© All Star Life Group",
  ].join("\n");

  return { subject, html, text };
}
