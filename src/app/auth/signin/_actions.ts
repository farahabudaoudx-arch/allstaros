"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPerson, resolveLandingPath } from "@/lib/auth";
import { recordLoginEvent } from "@/lib/auth/login-event";

export type SignInState = { ok: true } | { ok: false; error: string };

/**
 * Password sign-in, run entirely on our server. The browser only talks to the
 * app origin; the Supabase call happens here with the SSR client, which
 * persists the session cookies (same pattern as /auth/dev/as). This is the fix
 * for filtered networks (VPN, corporate WiFi) that block the Supabase host and
 * made the old browser-direct signInWithPassword die with "Failed to fetch".
 *
 * We deliberately redirect DIRECTLY to the destination page rather than
 * bouncing through the /auth/after-login route handler. A Server Action
 * redirect that lands on a GET route handler (which then re-redirects) leaves
 * the browser's URL pinned to that handler while it soft-renders the
 * destination, so the very next Server Action POST is sent to
 * /auth/after-login, which only implements GET and answers 405. Recording the
 * login inline keeps the monitoring parity that the after-login hop gave us,
 * without the stale-URL trap.
 */
export async function signInAction(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const nextRaw = String(formData.get("next") ?? "");
  // Same-site absolute paths only, never an open redirect. Backslashes are
  // rejected too: browsers normalize "\" to "/", so "/\evil.com" would
  // otherwise become a protocol-relative redirect.
  const safeNext =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") && !nextRaw.includes("\\")
      ? nextRaw
      : null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { ok: false, error: "That email and password don’t match. Try again." };
  }

  // Record the login (best-effort, recordLoginEvent swallows its own errors)
  // with the request headers, the same way /auth/after-login did.
  const person = await getCurrentPerson();
  if (person) {
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    await recordLoginEvent({
      personId: person.id,
      ip,
      userAgent: hdrs.get("user-agent"),
    });
  }

  const destination =
    safeNext ?? (await resolveLandingPath(supabase, data.user.id));

  // redirect() throws a control-flow exception, so it stays outside any
  // try/catch and only ever targets a real page.
  redirect(destination);
}
