"use server";

import { getCurrentPerson } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { bugReportEmail } from "@/lib/emails/bug-report";
import { installationSupportEmail } from "@/lib/installation/runtime";

export type ReportBugResult = { ok: true } | { ok: false; error: string };

// Who bug reports land with. Swappable without a code change: set BUG_REPORT_TO
// in the environment (Vercel / .env.local) to redirect the inbox. Falls back to
// Nicholas so it works out of the box.
function getBugInbox(): string {
  return installationSupportEmail();
}

const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

/**
 * Submit a bug report from the in-app "Report a bug" modal. Emails the report
 * (plus any screenshot, as an attachment) to the bug inbox, with reply-to set
 * to the reporter so the team can answer them directly.
 *
 * Best-effort and non-throwing: returns { ok: false, error } the modal can show
 * inline rather than crashing the page.
 */
export async function reportBug(formData: FormData): Promise<ReportBugResult> {
  const person = await getCurrentPerson();
  if (!person) return { ok: false, error: "You need to be signed in to report a bug." };

  const message = String(formData.get("message") ?? "").trim();
  if (!message) {
    return { ok: false, error: "Please describe what happened." };
  }
  if (message.length > 5000) {
    return { ok: false, error: "That's a bit long — please keep it under 5000 characters." };
  }

  const pageUrl = String(formData.get("pageUrl") ?? "").trim() || undefined;
  const userAgent = String(formData.get("userAgent") ?? "").trim() || undefined;

  // Optional screenshot.
  let attachment: { filename: string; content: Buffer; contentType?: string } | undefined;
  const file = formData.get("screenshot");
  if (file instanceof File && file.size > 0) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return { ok: false, error: "Screenshot must be a PNG, JPG, GIF, or WebP image." };
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      return { ok: false, error: "Screenshot is too large — please keep it under 10 MB." };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = file.name?.replace(/[^\w.\-]/g, "_") || "screenshot.png";
    attachment = { filename: safeName, content: buffer, contentType: file.type };
  }

  const mail = bugReportEmail({
    message,
    reporterName: person.full_name,
    reporterEmail: person.email,
    pageUrl,
    userAgent,
    hasScreenshot: Boolean(attachment),
  });

  const sent = await sendEmail({
    to: getBugInbox(),
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    replyTo: person.email || undefined,
    attachments: attachment ? [attachment] : undefined,
  });

  if (!sent.ok) {
    return { ok: false, error: `Couldn't send your report: ${sent.error}` };
  }
  return { ok: true };
}
