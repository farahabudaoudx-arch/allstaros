// "Welcome — set up your account" email. Sent to a newly registered recruit so
// they can create their password and sign in for the first time (the flow we're
// moving to as we retire magic-link-only auth).
//
// Returns { subject, html, text } ready to hand to sendEmail(). The HTML is
// table-based with fully inline styles so it renders consistently across email
// clients (Gmail, Apple Mail, Outlook). Brand palette matches the app:
//   background #050505 · gold #f6c945 · card #0d0d0d · hairline #1e1e1e

const BG = "#050505";
const CARD = "#0d0d0d";
const HAIRLINE = "#1f1f1f";
const GOLD = "#f6c945";
const GOLD_SOFT = "#c9a235";
const INK = "#f5f5f5";
const SUBTLE = "#9a9a9a";
const MUTE = "#6a6a6a";

// Absolute URL — email clients can't resolve relative paths.
const LOGO_URL = "https://app.allstarlifegroup.com/logo.png";

export type WelcomeEmailParams = {
  /** Recruit's first name for the greeting. Falls back to a generic line. */
  firstName?: string;
  /** The one-click link to the account-setup (create password) page. */
  setupUrl: string;
  /** How long the setup link stays valid, for the fine print. */
  expiryHours?: number;
};

export function welcomeEmail({
  firstName,
  setupUrl,
  expiryHours = 48,
}: WelcomeEmailParams): { subject: string; html: string; text: string } {
  const greeting = firstName ? `Welcome, ${firstName}.` : "Welcome to All Star.";
  const subject = "Welcome to All Star — set up your account";

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
      Your account is ready — create your password to sign in.
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
                <img src="${LOGO_URL}" alt="All Star Life Group" height="34" style="height:34px;width:auto;display:block;border:0;outline:none;text-decoration:none;" />
                <div style="margin-top:18px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${GOLD_SOFT};">
                  All Star Life Group
                </div>
              </td>
            </tr>

            <!-- Headline + body -->
            <tr>
              <td style="padding:14px 40px 0 40px;">
                <h1 style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:30px;line-height:1.2;font-weight:600;letter-spacing:-0.02em;color:${INK};">
                  ${greeting}
                </h1>
                <p style="margin:18px 0 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:${SUBTLE};">
                  Your spot in the All Star pipeline is ready. Set up your account to sign in, track your licensing and onboarding, and start your 28-day bootcamp.
                </p>
                <p style="margin:14px 0 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:${SUBTLE};">
                  It takes about a minute — just create your password.
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
                         style="display:inline-block;padding:15px 30px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1;color:#0b0b0b;text-decoration:none;border-radius:10px;">
                        Set up your account
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Fallback link + expiry -->
            <tr>
              <td style="padding:24px 40px 0 40px;">
                <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${MUTE};">
                  Button not working? Paste this link into your browser:
                </p>
                <p style="margin:6px 0 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;word-break:break-all;">
                  <a href="${setupUrl}" target="_blank" style="color:${GOLD_SOFT};text-decoration:underline;">${setupUrl}</a>
                </p>
                <p style="margin:18px 0 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${MUTE};">
                  This link expires in ${expiryHours} hours. If it lapses, your upline can resend it.
                </p>
              </td>
            </tr>

            <!-- Divider -->
            <tr>
              <td style="padding:32px 40px 0 40px;">
                <div style="height:1px;background-color:${HAIRLINE};line-height:1px;font-size:1px;">&nbsp;</div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:24px 40px 36px 40px;">
                <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.05em;line-height:1.6;color:${MUTE};">
                  You received this because your upline registered you with All Star Life Group. If this wasn't expected, you can ignore this email.
                </p>
                <p style="margin:12px 0 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.05em;color:${MUTE};">
                  © All Star Life Group
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
    "Your spot in the All Star pipeline is ready. Set up your account to sign in, track your licensing and onboarding, and start your 28-day bootcamp.",
    "",
    "Set up your account:",
    setupUrl,
    "",
    `This link expires in ${expiryHours} hours. If it lapses, your upline can resend it.`,
    "",
    "You received this because your upline registered you with All Star Life Group.",
    "© All Star Life Group",
  ].join("\n");

  return { subject, html, text };
}
