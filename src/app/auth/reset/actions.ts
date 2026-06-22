"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/site-url";
import { passwordResetEmail } from "@/lib/emails/password-reset";

/**
 * Public "Forgot password" request. Mirrors the admin-initiated reset
 * (lib/actions/admin/auth-ops.ts): mint a one-time recovery token with the
 * service role and email a CLEAN link on our own domain that routes through the
 * /auth/confirm interstitial — NOT Supabase's /auth/v1/verify action link.
 *
 * Why: the old client-side resetPasswordForEmail() emailed Supabase's verify
 * link and relied on a browser-stored PKCE verifier. Email link-scanners (Gmail,
 * corporate filters) pre-fetch the link and burn the one-time token, and opening
 * it on a different device than it was requested from breaks the PKCE exchange —
 * both surfaced to users as "the reset link didn't work". The interstitial +
 * token_hash (verifyOtp) path has neither problem: scanners can't trigger it (it
 * only verifies on a POSTed button press) and it carries no device-bound
 * verifier.
 *
 * Always resolves ok — we never reveal whether an account exists for the email
 * (no account enumeration), and a transient send failure is swallowed for the
 * same reason.
 */
export async function requestPasswordReset(
  emailRaw: string,
): Promise<{ ok: true }> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) return { ok: true };

  try {
    const admin = createServiceRoleClient();
    const { data: link } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${getAppUrl()}/auth/callback?next=/auth/reset/confirm`,
      },
    });

    const hash = link?.properties?.hashed_token;
    if (hash) {
      const resetUrl = `${getAppUrl()}/auth/confirm?token_hash=${encodeURIComponent(
        hash,
      )}&type=recovery&next=${encodeURIComponent("/auth/reset/confirm")}`;

      const { data: person } = await admin
        .from("person")
        .select("full_name")
        .ilike("email", email)
        .maybeSingle();
      const firstName =
        ((person as { full_name?: string } | null)?.full_name ?? "")
          .trim()
          .split(/\s+/)[0] || undefined;

      const mail = passwordResetEmail({ firstName, resetUrl });
      await sendEmail({
        to: email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
    }
  } catch {
    // Swallow: an unknown email (generateLink errors) or a transient send
    // failure must never leak account existence to an unauthenticated caller.
  }

  return { ok: true };
}
