// Shared brand shell + row helpers for All Star transactional emails.
//
// Every email is table-based with fully inline styles (no <style> blocks, no
// flexbox/grid) so it renders consistently across Gmail, Apple Mail, and
// Outlook. Each email composes a set of "rows" (each a <tr> string) and hands
// them to shell(), which wraps them in the branded card (gold top rule, logo,
// eyebrow) and the dark page background.
//
// Typeface is Helvetica throughout; palette matches the app.

// ── Brand palette (dark theme) ────────────────────────────────────────────────
export const BRAND = {
  BG: "#050505",
  CARD: "#0d0d0d",
  HAIRLINE: "#1f1f1f",
  GOLD: "#f6c945",
  GOLD_SOFT: "#c9a235",
  INK: "#f5f5f5",
  SUBTLE: "#9a9a9a",
  MUTE: "#6a6a6a",
  FONT: "'Helvetica Neue',Helvetica,Arial,sans-serif",
  LOGO_URL: "https://app.allstarlifegroup.com/logo.png",
} as const;

const B = BRAND;

/** Escape HTML-special chars in any value that gets interpolated into markup
 * (names, reasons, etc.) so user-supplied text can't break the layout. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The big H1 headline. First row of content. */
export function headingRow(text: string): string {
  return `<tr>
    <td style="padding:14px 40px 0 40px;">
      <h1 style="margin:0;font-family:${B.FONT};font-size:30px;line-height:1.2;font-weight:600;letter-spacing:-0.02em;color:${B.INK};">${text}</h1>
    </td>
  </tr>`;
}

/** A body paragraph. Pass { tight: true } to sit it close under the previous
 * paragraph rather than as a fresh block. */
export function paragraphRow(text: string, opts: { tight?: boolean } = {}): string {
  const top = opts.tight ? 12 : 18;
  return `<tr>
    <td style="padding:${top}px 40px 0 40px;">
      <p style="margin:0;font-family:${B.FONT};font-size:16px;line-height:1.6;color:${B.SUBTLE};">${text}</p>
    </td>
  </tr>`;
}

/** The single primary CTA — a bulletproof gold button. */
export function buttonRow(label: string, href: string): string {
  return `<tr>
    <td style="padding:30px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" bgcolor="${B.GOLD}" style="border-radius:10px;">
            <a href="${href}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${B.FONT};font-size:15px;font-weight:600;line-height:1;color:#0b0b0b;text-decoration:none;border-radius:10px;">${label}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/** Raw-URL fallback for clients that strip buttons. */
export function fallbackRow(url: string): string {
  return `<tr>
    <td style="padding:24px 40px 0 40px;">
      <p style="margin:0;font-family:${B.FONT};font-size:13px;line-height:1.6;color:${B.MUTE};">Button not working? Paste this link into your browser:</p>
      <p style="margin:6px 0 0 0;font-family:${B.FONT};font-size:12px;line-height:1.5;word-break:break-all;">
        <a href="${url}" target="_blank" style="color:${B.GOLD_SOFT};text-decoration:underline;">${url}</a>
      </p>
    </td>
  </tr>`;
}

/** A custom content row — pass any inner HTML; gets the standard side padding. */
export function customRow(innerHtml: string, topPad = 22): string {
  return `<tr><td style="padding:${topPad}px 40px 0 40px;">${innerHtml}</td></tr>`;
}

/** Divider + fine print + copyright. Should be the LAST row in every email. */
export function footerRow(footnote: string): string {
  return `<tr>
    <td style="padding:32px 40px 0 40px;">
      <div style="height:1px;background-color:${B.HAIRLINE};line-height:1px;font-size:1px;">&nbsp;</div>
    </td>
  </tr>
  <tr>
    <td style="padding:24px 40px 36px 40px;">
      <p style="margin:0;font-family:${B.FONT};font-size:12px;line-height:1.6;color:${B.MUTE};">${footnote}</p>
      <p style="margin:12px 0 0 0;font-family:${B.FONT};font-size:11px;letter-spacing:0.05em;color:${B.MUTE};">© All Star Life Group</p>
    </td>
  </tr>`;
}

/** Wrap composed rows in the branded card + dark page background. */
export function shell({
  subject,
  preheader,
  rows,
}: {
  subject: string;
  preheader: string;
  rows: string;
}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${B.BG};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${B.BG};font-size:1px;line-height:1px;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${B.BG};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:${B.CARD};border:1px solid ${B.HAIRLINE};border-radius:16px;overflow:hidden;">
            <tr><td style="height:3px;background-color:${B.GOLD};line-height:3px;font-size:3px;">&nbsp;</td></tr>
            <tr>
              <td style="padding:36px 40px 0 40px;" align="left">
                <img src="${B.LOGO_URL}" alt="All Star Life Group" height="34" style="height:34px;width:auto;display:block;border:0;outline:none;text-decoration:none;" />
                <div style="margin-top:18px;font-family:${B.FONT};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${B.GOLD_SOFT};">All Star Life Group</div>
              </td>
            </tr>
            ${rows}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
