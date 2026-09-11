import { createServerClient } from "@supabase/ssr";
import { isAuthError, isAuthSessionMissingError, type User } from "@supabase/supabase-js";

function isUnrecoverableSessionError(error: unknown) {
  return isAuthSessionMissingError(error) || (isAuthError(error) && (
    error.code === "refresh_token_not_found" ||
    error.code === "refresh_token_already_used"
  ));
}
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const sessionCookie = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0]}-auth-token`;
  // Snapshot before the SDK mutates cookies on SIGNED_OUT.
  const sessionCookieNames = request.cookies.getAll().map(({ name }) => name)
    .filter((name) => name === sessionCookie || (
      name.startsWith(`${sessionCookie}.`) && /^\d+$/.test(name.slice(sessionCookie.length + 1))
    ));

  function rebuildResponse() {
    const previous = response;
    response = NextResponse.next({ request });
    previous.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = previous.headers.get(header);
      if (value) response.headers.set(header, value);
    }
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // getUser never completes a PKCE exchange. SDK SIGNED_OUT cleanup
          // must not erase a pending invite/OAuth callback's verifier.
          cookiesToSet = cookiesToSet.filter(({ name }) =>
            name !== `${sessionCookie}-code-verifier` &&
            !name.startsWith(`${sessionCookie}-code-verifier.`),
          );
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          rebuildResponse();
          Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  let user: User | null = null;
  try {
    const result = await supabase.auth.getUser();
    if (result.error) throw result.error;
    user = result.data.user;
  } catch (error) {
    if (!isUnrecoverableSessionError(error)) throw error;
    // Local cookie recovery only: do not retry rejected tokens or revoke other
    // sessions. Leave PKCE verifier and unrelated project cookies intact.
    sessionCookieNames.forEach((name) => request.cookies.delete(name));
    rebuildResponse();
    sessionCookieNames.forEach((name) => response.cookies.set(name, "", {
      path: "/", maxAge: 0, sameSite: "lax",
    }));
    response.headers.set("Cache-Control", "private, no-store");
  }

  const { pathname } = request.nextUrl;
  // Note: /join is intentionally NOT public. There is no unauthenticated
  // self-serve signup — accounts only come from a builder's email invite, which
  // lands the recruit on /welcome (auth-gated) after /auth/callback signs them
  // in. The demo replay at /join runs only for an already-signed-in seed user.
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/marketing-site") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/preview") ||
    pathname.startsWith("/live/leaderboard") ||
    pathname.startsWith("/api/live-leaderboard/") ||
    pathname.startsWith("/UIrevisionsdemo-wylie-nick") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/health") ||
    pathname === "/api/version" ||
    pathname.startsWith("/api/gateway/report-jobs/") ||
    pathname === "/api/gateway/connect/callback" ||
    pathname === "/api/gateway/connect/fail" ||
    pathname === "/api/gateway/issued-premium/upload";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/signin";
    url.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(header);
      if (value) redirect.headers.set(header, value);
    }
    return redirect;
  }

  return response;
}
