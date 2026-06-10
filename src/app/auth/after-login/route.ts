import { NextResponse, type NextRequest } from "next/server";
import { getCurrentPerson } from "@/lib/auth";
import { recordLoginEvent } from "@/lib/auth/login-event";

// Both the email+password flow (signin-button) and the OAuth callback funnel
// through here so every successful login is recorded once, with request headers.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const nextRaw = searchParams.get("next") ?? "/";
  // Only allow same-site absolute paths — never an open redirect.
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";

  const person = await getCurrentPerson();
  if (person) {
    // On Vercel the client IP is the first entry in x-forwarded-for.
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = request.headers.get("user-agent");
    await recordLoginEvent({ personId: person.id, ip, userAgent });
  }

  return NextResponse.redirect(`${origin}${next}`);
}
