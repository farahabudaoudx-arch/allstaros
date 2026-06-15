"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { linkPersonByEmail } from "@/lib/auth";

// The OTP types Supabase can hand us through an emailed link.
const VALID_TYPES = new Set<EmailOtpType>([
  "invite",
  "recovery",
  "magiclink",
  "email",
  "signup",
  "email_change",
]);

/**
 * Verify an emailed one-time token — but ONLY on an explicit human button press,
 * never on page load. Email clients, corporate mail filters, and browser
 * safe-browsing scanners pre-fetch links with a background GET; if verification
 * happened on load, that GET would burn the single-use token and the real person
 * would arrive to a dead link (the "works on mobile, not desktop" bug). Because
 * this only runs from a POSTed <form>, scanners (which don't submit forms) leave
 * the token intact until the user actually clicks Continue.
 *
 * verifyOtp establishes the session server-side (sets auth cookies via the SSR
 * client), then we hand off to the login recorder and on to `next`.
 */
export async function confirmOtp(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "") as EmailOtpType;
  const nextRaw = String(formData.get("next") ?? "/");
  // Same-site paths only — never an open redirect.
  const next =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";

  let ok = false;
  if (tokenHash && VALID_TYPES.has(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) {
        await linkPersonByEmail(user.id, user.email);
      }
      ok = true;
    }
  }

  // redirect() throws — keep it outside the try path above.
  redirect(
    ok
      ? `/auth/after-login?next=${encodeURIComponent(next)}`
      : "/auth/signin?error=invite",
  );
}
