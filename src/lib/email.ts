// Email sending — server-only. Production sends transactional email through
// Resend. Local disposable-customer validation can explicitly opt into Mailpit
// so invites/resets are captured on-device instead of leaving the machine.
//
// Configured with two env vars (see .env.example):
//   RESEND_API_KEY — secret API key from the Resend dashboard (API Keys page)
//   RESEND_FROM    — the verified "from" address, e.g.
//                    "All Star <notifications@allstarlifegroup.com>". The domain
//                    must be authenticated in Resend (DKIM/SPF DNS records) or
//                    sends will be rejected.
//
// The API key is a secret and lives only in the environment; it is never sent
// to the browser.
//
// NOTE: Supabase auth emails (the magic-link sign-in) are sent separately by
// Supabase, not through this helper. To route those through Resend too, set
// Resend as the custom SMTP provider in Supabase → Authentication → SMTP.

import { Resend } from "resend";
import { installationReplyToEmail } from "@/lib/installation/runtime";

let client: Resend | null = null;

type MailpitAddress = {
  Email: string;
  Name?: string;
};

function parseAddress(value: string): MailpitAddress {
  const trimmed = value.trim();
  const named = trimmed.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  if (named) {
    return {
      Email: named[2].trim(),
      ...(named[1].trim() ? { Name: named[1].trim().replace(/^"|"$/g, "") } : {}),
    };
  }
  return { Email: trimmed };
}

function getMailpitUrl(): string {
  const raw = process.env.MAILPIT_URL?.trim();
  if (!raw) {
    throw new Error(
      "MAILPIT_URL is not set — local Mailpit email transport cannot send.",
    );
  }
  const url = new URL(raw);
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (!loopbackHosts.has(url.hostname)) {
    throw new Error("MAILPIT_URL must point to a loopback-only local Mailpit instance.");
  }
  return url.toString().replace(/\/$/, "");
}

function getMailpitFrom(): MailpitAddress {
  const from =
    process.env.MAILPIT_FROM?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    "Local Customer OS <no-reply@local.test>";
  return parseAddress(from);
}

/** Lazily construct the Resend client so a missing key only errors when we
 * actually try to send — not at import time (which would break builds/tests
 * that never send mail). */
function getClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not set — cannot send email. Add it in .env.local and Vercel.",
    );
  }
  if (!client) client = new Resend(key);
  return client;
}

function getFrom(): string {
  const from = process.env.RESEND_FROM;
  if (!from) {
    throw new Error(
      "RESEND_FROM is not set — cannot send email. Set it to a verified address, " +
        'e.g. "All Star <notifications@allstarlifegroup.com>".',
    );
  }
  return from;
}

// Default reply-to for every email. The `from` address (notifications@…) is a
// send-only identity, so without this, replies would bounce. Route them to a
// real, monitored inbox instead. Override per-send with `replyTo`, or globally
// via the RESEND_REPLY_TO env var.
function getReplyTo(): string {
  return installationReplyToEmail();
}

export type EmailAttachment = {
  /** Filename shown to the recipient, e.g. "screenshot.png". */
  filename: string;
  /** Raw bytes of the file. */
  content: Buffer;
  /** MIME type, e.g. "image/png". Optional — Resend infers from the name. */
  contentType?: string;
};

export type SendEmailParams = {
  /** Recipient address, or several. */
  to: string | string[];
  subject: string;
  /** HTML body. Provide this and/or `text`; at least one is required. */
  html?: string;
  /** Plain-text body (good for deliverability and text-only clients). */
  text?: string;
  /** Where replies should go. Defaults to the monitored reply-to inbox (see
   * getReplyTo) when omitted — NOT the send-only `from` address. */
  replyTo?: string;
  /** Files to attach (e.g. a bug-report screenshot). */
  attachments?: EmailAttachment[];
  /** Stable provider idempotency key for retry-safe transactional sends. */
  idempotencyKey?: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

async function sendWithMailpit(
  params: SendEmailParams,
): Promise<SendEmailResult> {
  const { to, subject, html, text, replyTo, attachments, idempotencyKey } = params;
  const recipients = (Array.isArray(to) ? to : [to]).map(parseAddress);
  const effectiveReplyTo = replyTo ?? getReplyTo();

  const response = await fetch(`${getMailpitUrl()}/api/v1/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      From: getMailpitFrom(),
      To: recipients,
      ReplyTo: effectiveReplyTo ? [parseAddress(effectiveReplyTo)] : undefined,
      Subject: subject,
      HTML: html,
      Text: text,
      Headers: idempotencyKey
        ? { "X-Idempotency-Key": idempotencyKey }
        : undefined,
      Attachments: attachments?.length
        ? attachments.map((attachment) => ({
            Filename: attachment.filename,
            Content: attachment.content.toString("base64"),
            ContentType: attachment.contentType,
          }))
        : undefined,
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).trim();
    return {
      ok: false,
      error: `Mailpit send failed (${response.status})${detail ? `: ${detail}` : ""}`,
    };
  }

  const payload = (await response.json()) as { ID?: string };
  return { ok: true, id: payload.ID ?? "mailpit" };
}

/**
 * Send a transactional email. Production always uses Resend. A non-production
 * runtime may explicitly select Mailpit with EMAIL_TRANSPORT=mailpit.
 *
 * Non-throwing: returns `{ ok: false, error }` on failure so callers can treat
 * email as best-effort (the same way the recruit-invite flows do) rather than
 * crashing a request when mail delivery hiccups.
 */
export async function sendEmail(
  params: SendEmailParams,
): Promise<SendEmailResult> {
  const { to, subject, html, text, replyTo, attachments, idempotencyKey } = params;

  if (!html && !text) {
    return { ok: false, error: "Email must include an html or text body." };
  }

  // The SDK's send() is a discriminated union over html / text / react /
  // template, so the body field has to be a concrete string for it to pick the
  // content variant. We've already guaranteed at least one of html/text exists.
  const body = html !== undefined ? { html, text } : { text: text as string };

  try {
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.EMAIL_TRANSPORT?.trim().toLowerCase() === "mailpit"
    ) {
      return await sendWithMailpit(params);
    }

    const { data, error } = await getClient().emails.send({
      from: getFrom(),
      to,
      subject,
      replyTo: replyTo ?? getReplyTo(),
      attachments: attachments?.length
        ? attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
          }))
        : undefined,
      ...body,
    }, idempotencyKey ? { idempotencyKey } : undefined);

    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id ?? "" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown email error.",
    };
  }
}
