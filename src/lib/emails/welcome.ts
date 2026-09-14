// "Invite / account setup" email — the ONLY email a new recruit receives.
//
// A team builder invites a recruit by email; this message is how they get in.
// It carries a one-time setup link (`setupUrl`) that lands them on a page to
// enter their name, phone, and state and set a password. There is no public
// sign-up, so the email is intentionally legitimate-feeling with one obvious CTA.
//
// welcomeEmail() returns { subject, html, text } ready to hand to the Resend
// sendEmail() helper — it does NOT send anything itself. The HTML is table-based
// with fully inline styles (no <style> blocks, no flexbox/grid) so it renders
// consistently across Gmail, Apple Mail, and Outlook.
//
// Brand palette is inlined below. Typeface is Helvetica throughout.

import { getEmailBrand } from "@/lib/installation/email-brand";

// ── Brand palette (dark theme) ────────────────────────────────────────────────
const BG = "#050505"; // page background
const CARD = "#0d0d0d"; // email card
const HAIRLINE = "#1f1f1f"; // dividers / card border
const INK = "#f5f5f5"; // primary text
const SUBTLE = "#9a9a9a"; // body text
const MUTE = "#6a6a6a"; // fine print

const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";

export function welcomeEmail(params: {
  firstName?: string; // recruit's first name; may be undefined → generic greeting
  setupUrl: string; // the one-time setup link; primary CTA button href
}): { subject: string; html: string; text: string } {
  const { firstName, setupUrl } = params;
  const brand = getEmailBrand();
  const GOLD = brand.accentColor;
  const GOLD_SOFT = brand.accentSoftColor;

  const greeting = firstName
    ? `Welcome to ${brand.shortName}, ${firstName}.`
    : `Welcome to ${brand.shortName}.`;
  const subject = `You're invited to ${brand.shortName} — set up your account`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${BG};">
    <!-- Preheader: shows in the inbox preview, hidden in the body. -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BG};font-size:1px;line-height:1px;">
      You've been invited to ${brand.shortName} — tap to set up your account.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:${CARD};border:1px solid ${HAIRLINE};border-radius:16px;overflow:hidden;">

            <!-- Gold top rule -->
            <tr><td style="height:3px;background-color:${GOLD};line-height:3px;font-size:3px;">&nbsp;</td></tr>

            <!-- Logo + eyebrow -->
            <tr>
              <td style="padding:36px 40px 0 40px;" align="left">
                <img src="${brand.logoUrl}" alt="${brand.organizationName}" height="34" style="height:34px;width:auto;display:block;border:0;outline:none;text-decoration:none;" />
                <div style="margin-top:18px;font-family:${FONT};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${GOLD_SOFT};">
                  ${brand.organizationName}
                </div>
              </td>
            </tr>

            <!-- Headline + body -->
            <tr>
              <td style="padding:14px 40px 0 40px;">
                <h1 style="margin:0;font-family:${FONT};font-size:30px;line-height:1.2;font-weight:600;letter-spacing:-0.02em;color:${INK};">
                  ${greeting}
                </h1>
                <p style="margin:18px 0 0 0;font-family:${FONT};font-size:16px;line-height:1.6;color:${SUBTLE};">
                  You've been invited to join the ${brand.shortName} team. This link sets up your account — enter a few details, choose a password, and you're in.
                </p>
                <p style="margin:14px 0 0 0;font-family:${FONT};font-size:16px;line-height:1.6;color:${SUBTLE};">
                  It takes about a minute. One tap to get started.
                </p>
              </td>
            </tr>

            <!-- CTA button (bulletproof) -->
            <tr>
              <td style="padding:30px 40px 0 40px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" bgcolor="${GOLD}" style="border-radius:10px;">
                      <a href="${setupUrl}" target="_blank"
                         style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#0b0b0b;text-decoration:none;border-radius:10px;">
                        Set up my account
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Fallback link -->
            <tr>
              <td style="padding:24px 40px 0 40px;">
                <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:${MUTE};">
                  Button not working? Paste this link into your browser:
                </p>
                <p style="margin:6px 0 0 0;font-family:${FONT};font-size:12px;line-height:1.5;word-break:break-all;">
                  <a href="${setupUrl}" target="_blank" style="color:${GOLD_SOFT};text-decoration:underline;">${setupUrl}</a>
                </p>
              </td>
            </tr>

            <!-- Divider -->
            <tr>
              <td style="padding:32px 40px 0 40px;">
                <div style="height:1px;background-color:${HAIRLINE};line-height:1px;font-size:1px;">&nbsp;</div>
              </td>
            </tr>

            <!-- Footer / fine print -->
            <tr>
              <td style="padding:24px 40px 36px 40px;">
                <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTE};">
                  For your security, this link can only be used once and expires after a while. If you weren't expecting this invitation, you can safely ignore this email.
                </p>
                <p style="margin:12px 0 0 0;font-family:${FONT};font-size:11px;letter-spacing:0.05em;color:${MUTE};">
                  © ${brand.organizationName}
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    greeting,
    "",
    `You've been invited to join the ${brand.shortName} team. This link sets up your account — enter a few details, choose a password, and you're in.`,
    "",
    "Set up my account:",
    setupUrl,
    "",
    "For your security, this link can only be used once and expires after a while. If you weren't expecting this invitation, you can safely ignore this email.",
    "",
    `© ${brand.organizationName}`,
  ].join("\n");

  return { subject, html, text };
}
