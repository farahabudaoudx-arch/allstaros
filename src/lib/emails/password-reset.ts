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
  BRAND,
} from "./_layout";

export function passwordResetEmail(params: {
  firstName?: string; // recipient's first name; optional → generic greeting
  resetUrl: string; // the one-time reset link; primary CTA button href
}): { subject: string; html: string; text: string } {
  const { firstName, resetUrl } = params;

  const heading = firstName
    ? `Reset your password, ${escapeHtml(firstName)}.`
    : "Reset your password.";
  const subject = `Reset your ${BRAND.SHORT_NAME} password`;

  const html = shell({
    subject,
    preheader: "Tap to choose a new password.",
    rows: [
      headingRow(heading),
      paragraphRow(
        `We got a request to reset the password on your ${escapeHtml(BRAND.SHORT_NAME)} account. Tap below to choose a new one.`,
      ),
      buttonRow("Reset my password", resetUrl),
      fallbackRow(resetUrl),
      footerRow(
        "For your security, this link can only be used once and expires after a while. If you didn't request a password reset, you can safely ignore this email — your password won't change.",
      ),
    ].join("\n"),
  });

  const text = [
    firstName ? `Reset your password, ${firstName}.` : "Reset your password.",
    "",
    `We got a request to reset the password on your ${BRAND.SHORT_NAME} account. Use the link below to choose a new one.`,
    "",
    "Reset my password:",
    resetUrl,
    "",
    "For your security, this link can only be used once and expires after a while. If you didn't request a password reset, you can safely ignore this email — your password won't change.",
    "",
    `© ${BRAND.ORGANIZATION_NAME}`,
  ].join("\n");

  return { subject, html, text };
}
