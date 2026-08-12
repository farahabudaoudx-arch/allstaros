import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // Note: /join is intentionally NOT public. There is no unauthenticated
  // self-serve signup — accounts only come from a builder's email invite, which
  // lands the recruit on /welcome (auth-gated) after /auth/callback signs them
  // in. The demo replay at /join runs only for an already-signed-in seed user.
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/test-project") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/preview") ||
    pathname.startsWith("/UIrevisionsdemo-wylie-nick") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/health") ||
    pathname === "/api/version" ||
    pathname === "/api/gateway/issued-premium/upload";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/signin";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
