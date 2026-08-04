// Broadcast email — the follow-up to the All Star OS 2.0 launch, after agents
// told us they wanted the sidebar menu back. Announces the hybrid navigation
// (new button interface + a side menu you can hide) to the whole agent base.
//
// The first draft of this landed in Gmail's Promotions tab, which no other
// email of ours had done. The suspects were a large image, an ad-shaped subject
// line, a crowd greeting instead of a name, and an image hosted off a different
// domain than the sender. Naming the recipient and shrinking the image were
// enough to win Primary back on their own, so the subject line went back to the
// one we wanted. Keep the greeting and the image size as they are.
//
// Returns { subject, html, text } for the Resend sendEmail() helper.

import {
  escapeHtml,
  shell,
  headingRow,
  paragraphRow,
  buttonRow,
  fallbackRow,
  customRow,
  footerRow,
} from "./_layout";

// The demo of the new navigation. Same video the in-app popup plays, so anyone
// who logs in before reading their email sees the identical walkthrough.
export const NAV_UPDATE_DEMO_URL =
  "https://www.loom.com/share/8e571c5da8e04dc7a50af97c9da5d0d2";

// Gmail and Outlook will not render a data URI, so the meme has to be a real
// hosted file.
//
// It is served from the public `homepage` bucket so the email does not depend
// on an app deploy, with the host read from env so it follows the Supabase
// custom-domain move. Once /public/emails/nav-feedback-meme.jpg is actually
// deployed, switch this to https://app.allstarlifegroup.com/emails/nav-feedback-meme.jpg
// so the image domain matches the sending domain — a mismatch there is one of
// the signals that reads as marketing.
export const NAV_UPDATE_MEME_URL = `${
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://atgqjhfbhaptpendzddl.supabase.co"
}/storage/v1/object/public/homepage/email/nav-feedback-meme.jpg`;

/** The Steve Harvey meme. Deliberately small: the more image area relative to
 * text, the more the whole message reads as promotional. */
function memeRow(): string {
  return customRow(
    `<img src="${NAV_UPDATE_MEME_URL}" alt="Shipping a new update vs. getting feedback on the new update" width="280" style="width:100%;max-width:280px;height:auto;display:block;margin:0 auto;border:0;border-radius:10px;outline:none;text-decoration:none;" />`,
    26,
  );
}

export function navUpdateEmail(
  params: {
    firstName?: string; // recipient's first name; optional → generic greeting
  } = {},
): { subject: string; html: string; text: string } {
  const { firstName } = params;
  const subject = "You Asked, We Listened";

  const greeting = firstName ? `Good afternoon, ${escapeHtml(firstName)}.` : "Good afternoon.";
  const greetingText = firstName ? `Good afternoon, ${firstName}.` : "Good afternoon.";

  const rows = [
    headingRow("You Asked, We Listened"),
    paragraphRow(greeting),
    paragraphRow(
      "Last week we shipped some very large changes to All Star OS, and a lot of you wrote in to tell us you preferred the old navigation with the sidebar menu. Long story short, plenty of you did not like the update.",
      { tight: true },
    ),
    memeRow(),
    paragraphRow(
      "It is never fun to get bad feedback on something you put a lot of time into. But it does not really matter what we think. It matters what the people using this operating system every single day think. Period.",
    ),
    paragraphRow(
      "So we went back and met you halfway. You now get both. The new button interface is still there, and the side menu is back next to it. You can also hide the side menu whenever you want if you like the cleaner look.",
      { tight: true },
    ),
    paragraphRow(
      "We think this is a much better solution, and we hope it fixes the problem some of you were having with the interface.",
      { tight: true },
    ),
    paragraphRow(
      "This is live in your portal right now. Watch the quick demo below, or just log in and watch it there.",
      { tight: true },
    ),
    buttonRow("Watch the demo", NAV_UPDATE_DEMO_URL),
    fallbackRow(NAV_UPDATE_DEMO_URL),
    paragraphRow("Keep the feedback coming,<br/>The All Star OS Team", { tight: true }),
    footerRow("You're receiving this because you have an All Star Life Group account."),
  ].join("\n");

  const html = shell({
    subject,
    preheader: "You told us you wanted it back, so we put it back.",
    rows,
  });

  const text = [
    greetingText,
    "",
    "Last week we shipped some very large changes to All Star OS, and a lot of you wrote in to tell us you preferred the old navigation with the sidebar menu. Long story short, plenty of you did not like the update.",
    "",
    "It is never fun to get bad feedback on something you put a lot of time into. But it does not really matter what we think. It matters what the people using this operating system every single day think. Period.",
    "",
    "So we went back and met you halfway. You now get both. The new button interface is still there, and the side menu is back next to it. You can also hide the side menu whenever you want if you like the cleaner look.",
    "",
    "We think this is a much better solution, and we hope it fixes the problem some of you were having with the interface.",
    "",
    "This is live in your portal right now. Watch the quick demo below, or just log in and watch it there.",
    "",
    `Watch the demo: ${NAV_UPDATE_DEMO_URL}`,
    "",
    "Keep the feedback coming,",
    "The All Star OS Team",
  ].join("\n");

  return { subject, html, text };
}
