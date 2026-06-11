// Password reset email. Sent when someone requests a new password for their
// All Star account. Carries a one-time reset link (`resetUrl`).
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

export function passwordResetEmail(params: {
  firstName?: string; // recipient's first name; optional → generic greeting
  resetUrl: string; // the one-time reset link; primary CTA button href
  expiryHours?: number; // how long the link is valid (default 24)
}): { subject: string; html: string; text: string } {
  const { firstName, resetUrl, expiryHours = 24 } = params;

  const heading = firstName
    ? `Reset your password, ${escapeHtml(firstName)}.`
    : "Reset your password.";
  const subject = "Reset your All Star password";

  const html = shell({
    subject,
    preheader: "Tap to choose a new password.",
    rows: [
      headingRow(heading),
      paragraphRow(
        "We got a request to reset the password on your All Star account. Tap below to choose a new one.",
      ),
      buttonRow("Reset my password", resetUrl),
      fallbackRow(resetUrl),
      footerRow(
        `This link expires in ${expiryHours} hours. If you didn't request a password reset, you can safely ignore this email — your password won't change.`,
      ),
    ].join("\n"),
  });

  const text = [
    firstName ? `Reset your password, ${firstName}.` : "Reset your password.",
    "",
    "We got a request to reset the password on your All Star account. Use the link below to choose a new one.",
    "",
    "Reset my password:",
    resetUrl,
    "",
    `This link expires in ${expiryHours} hours. If you didn't request a password reset, you can safely ignore this email — your password won't change.`,
    "",
    "© All Star Life Group",
  ].join("\n");

  return { subject, html, text };
}
