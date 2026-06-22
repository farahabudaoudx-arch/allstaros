"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPerson, linkPersonByEmail } from "@/lib/auth";
import { recordLoginEvent } from "@/lib/auth/login-event";

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
 * client), then we record the login and redirect straight to `next`.
 *
 * We deliberately redirect DIRECTLY to the destination page rather than bouncing
 * through the /auth/after-login route handler. A Server Action redirect that
 * lands on a GET route handler (which then re-redirects) leaves the browser's
 * URL pinned to that handler while it soft-renders the destination — so the very
 * next Server Action POST (the /welcome setup form) is sent to /auth/after-login,
 * which only implements GET and answers 405. That 405 surfaced to users as a
 * fake "network error" that a refresh "fixed" (a full reload resolves the URL to
 * /welcome). Recording the login inline keeps the monitoring parity that the
 * after-login hop gave us, without the stale-URL trap.
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
        // Record the login here (best-effort) with the request headers, the
        // same way /auth/after-login does for the password flow.
        const person = await getCurrentPerson();
        if (person) {
          const hdrs = await headers();
          const ip =
            hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
          await recordLoginEvent({
            personId: person.id,
            ip,
            userAgent: hdrs.get("user-agent"),
          });
        }
      }
      ok = true;
    }
  }

  // redirect() throws — keep it outside the try path above.
  redirect(ok ? next : "/auth/signin?error=invite");
}
