// "Your headshot needs another look" email — sent to a builder/producer when an
// admin rejects their uploaded photo. It carries the admin's own message (what
// to fix) and a single CTA that drops them on the Settings → Profile Photo
// section to upload a new one, which puts them straight back in the review queue.
//
// headshotRejectedEmail() returns { subject, html, text } ready for the Resend
// sendEmail() helper — it does not send anything itself. Table-based HTML with
// inline styles so it renders across Gmail, Apple Mail, and Outlook.

// ── Brand palette (dark theme) ────────────────────────────────────────────────
const BG = "#050505";
const CARD = "#0d0d0d";
const HAIRLINE = "#1f1f1f";
const GOLD = "#f6c945";
const GOLD_SOFT = "#c9a235";
const INK = "#f5f5f5";
const SUBTLE = "#9a9a9a";
const MUTE = "#6a6a6a";

const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const LOGO_URL = "https://app.allstarlifegroup.com/logo.png";

/** Escape the admin's free-text message so it can't break the HTML, then keep
 * their line breaks. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function headshotRejectedEmail(params: {
  firstName?: string;
  /** The admin's message: what the person needs to do differently. */
  message: string;
  /** Where to send them to upload a new photo (Settings → Profile Photo). */
  settingsUrl: string;
}): { subject: string; html: string; text: string } {
  const { firstName, message, settingsUrl } = params;

  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const subject = "Your All Star headshot needs another look";
  const messageHtml = escapeHtml(message).replace(/\n/g, "<br />");

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
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BG};font-size:1px;line-height:1px;">
      A quick change is needed on your headshot — here's what to do.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:${CARD};border:1px solid ${HAIRLINE};border-radius:16px;overflow:hidden;">

            <tr><td style="height:3px;background-color:${GOLD};line-height:3px;font-size:3px;">&nbsp;</td></tr>

            <tr>
              <td style="padding:36px 40px 0 40px;" align="left">
                <img src="${LOGO_URL}" alt="All Star Life Group" height="34" style="height:34px;width:auto;display:block;border:0;outline:none;text-decoration:none;" />
                <div style="margin-top:18px;font-family:${FONT};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${GOLD_SOFT};">
                  Headshot review
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:14px 40px 0 40px;">
                <h1 style="margin:0;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:600;letter-spacing:-0.02em;color:${INK};">
                  ${greeting}
                </h1>
                <p style="margin:16px 0 0 0;font-family:${FONT};font-size:16px;line-height:1.6;color:${SUBTLE};">
                  Thanks for uploading your headshot. It isn't approved yet — here's a note from the team on what to change:
                </p>
              </td>
            </tr>

            <!-- The admin's message -->
            <tr>
              <td style="padding:18px 40px 0 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${HAIRLINE};border-radius:12px;">
                  <tr>
                    <td style="padding:18px 20px;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK};">
                      ${messageHtml}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 40px 0 40px;">
                <p style="margin:0;font-family:${FONT};font-size:16px;line-height:1.6;color:${SUBTLE};">
                  Upload a new photo below and it goes right back to us for review.
                </p>
              </td>
            </tr>

            <!-- CTA -->
            <tr>
              <td style="padding:26px 40px 0 40px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" bgcolor="${GOLD}" style="border-radius:10px;">
                      <a href="${settingsUrl}" target="_blank"
                         style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#0b0b0b;text-decoration:none;border-radius:10px;">
                        Update my photo
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 40px 0 40px;">
                <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:${MUTE};">
                  Button not working? Paste this link into your browser:
                </p>
                <p style="margin:6px 0 0 0;font-family:${FONT};font-size:12px;line-height:1.5;word-break:break-all;">
                  <a href="${settingsUrl}" target="_blank" style="color:${GOLD_SOFT};text-decoration:underline;">${settingsUrl}</a>
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:32px 40px 0 40px;">
                <div style="height:1px;background-color:${HAIRLINE};line-height:1px;font-size:1px;">&nbsp;</div>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 40px 36px 40px;">
                <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTE};">
                  Questions? Just reply to this email and it reaches a real person.
                </p>
                <p style="margin:12px 0 0 0;font-family:${FONT};font-size:11px;letter-spacing:0.05em;color:${MUTE};">
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
    "Thanks for uploading your headshot. It isn't approved yet — here's a note from the team on what to change:",
    "",
    message,
    "",
    "Upload a new photo and it goes right back to us for review:",
    settingsUrl,
    "",
    "Questions? Just reply to this email and it reaches a real person.",
    "",
    "© All Star Life Group",
  ].join("\n");

  return { subject, html, text };
}
