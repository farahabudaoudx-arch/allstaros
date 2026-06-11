import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { linkPersonByEmail } from "@/lib/auth";

/**
 * Verifies an emailed one-time token (invite / magic link / recovery) on our own
 * domain, so recruits get a clean branded link instead of Supabase's long
 * /auth/v1/verify action_link. verifyOtp establishes the session server-side
 * (sets the auth cookies via the SSR client), then we hand off to the login
 * recorder and on to `next` — e.g. /welcome for an invited recruit.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) {
        await linkPersonByEmail(user.id, user.email);
      }
      return NextResponse.redirect(
        `${origin}/auth/after-login?next=${encodeURIComponent(next)}`,
      );
    }
  }

  return NextResponse.redirect(`${origin}/auth/signin?error=invite`);
}
