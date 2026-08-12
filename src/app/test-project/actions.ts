"use server";

import { sendEmail } from "@/lib/email";

export type CandidateSubmission = {
  fullName: string;
  email: string;
  githubUsername: string;
  upworkProfile: string;
};

export type CandidateSubmissionResult =
  | { ok: true }
  | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GITHUB_USERNAME = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

function clean(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function notificationInbox(): string {
  return process.env.TEST_PROJECT_NOTIFICATION_TO?.trim() || "nicholasverge@gmail.com";
}

export async function submitCandidateDetails(
  input: CandidateSubmission,
): Promise<CandidateSubmissionResult> {
  const candidate = {
    fullName: clean(input.fullName, 120),
    email: clean(input.email, 254).toLowerCase(),
    githubUsername: clean(input.githubUsername.replace(/^@/, ""), 39),
    upworkProfile: clean(input.upworkProfile, 500),
  };

  if (candidate.fullName.length < 2) return { ok: false, error: "Enter your full legal name." };
  if (!EMAIL.test(candidate.email)) return { ok: false, error: "Enter a valid email address." };
  if (!GITHUB_USERNAME.test(candidate.githubUsername)) return { ok: false, error: "Enter a valid GitHub username." };

  let upworkUrl: URL;
  try {
    upworkUrl = new URL(candidate.upworkProfile);
  } catch {
    return { ok: false, error: "Enter a valid Upwork profile URL." };
  }
  const isUpwork =
    upworkUrl.hostname === "upwork.com" ||
    upworkUrl.hostname.endsWith(".upwork.com");
  if (upworkUrl.protocol !== "https:" || !isUpwork) {
    return { ok: false, error: "Enter a valid upwork.com profile URL." };
  }

  const safe = {
    fullName: escapeHtml(candidate.fullName),
    email: escapeHtml(candidate.email),
    githubUsername: escapeHtml(candidate.githubUsername),
    upworkProfile: escapeHtml(upworkUrl.toString()),
  };

  const [internal, confirmation] = await Promise.all([
    sendEmail({
      to: notificationInbox(),
      replyTo: candidate.email,
      subject: `Trial project started — ${candidate.fullName}`,
      text: [
        `${candidate.fullName} started the Full Stack Dev Trial Project.`,
        "",
        `Email: ${candidate.email}`,
        `GitHub: @${candidate.githubUsername}`,
        `Upwork: ${upworkUrl.toString()}`,
      ].join("\n"),
      html: `<h1>New trial-project candidate</h1><p><strong>${safe.fullName}</strong> completed the first step of the Full Stack Dev Trial Project.</p><table><tr><td><strong>Email</strong></td><td><a href="mailto:${safe.email}">${safe.email}</a></td></tr><tr><td><strong>GitHub</strong></td><td>@${safe.githubUsername}</td></tr><tr><td><strong>Upwork</strong></td><td><a href="${safe.upworkProfile}">${safe.upworkProfile}</a></td></tr></table>`,
    }),
    sendEmail({
      to: candidate.email,
      subject: "Your Full Stack Dev Trial Project",
      text: `Hi ${candidate.fullName},\n\nWe received your information for the Full Stack Dev Trial Project. Your next step is to return to the portal and review and sign the NDA.\n\nPayment will be handled through Upwork. Reply to this email if you need help.`,
      html: `<p>Hi ${safe.fullName},</p><p>We received your information for the <strong>Full Stack Dev Trial Project</strong>.</p><p>Your next step is to return to the portal and review and sign the NDA.</p><p>Payment will be handled through Upwork. Reply to this email if you need help.</p>`,
    }),
  ]);

  if (!internal.ok || !confirmation.ok) {
    console.error("Trial-project email failed", {
      internal: internal.ok ? undefined : internal.error,
      confirmation: confirmation.ok ? undefined : confirmation.error,
    });
    return { ok: false, error: "We couldn’t send the confirmation emails. Please try again." };
  }

  return { ok: true };
}
