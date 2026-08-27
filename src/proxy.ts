import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isMarketingHostname, requestHostname } from "@/lib/marketing/hosts";

const FLAGGED_APP_HOST = "app.allstarlifegroup.com";
const BACKUP_APP_ORIGIN = "https://all-star-agency.vercel.app";
const MARKETING_ROUTE_PREFIX = "/marketing-site";

export async function proxy(request: NextRequest) {
  // Visual-acceptance routes are intentionally public and development-only.
  // Let them render in a fresh checkout without requiring production secrets;
  // every other route keeps the normal session refresh and auth enforcement.
  if (
    process.env.NODE_ENV === "development" &&
    (request.nextUrl.pathname === "/preview/scorecards" ||
      request.nextUrl.pathname === "/api/version") &&
    (!process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  ) {
    return NextResponse.next();
  }
  const requestHost = requestHostname(
    request.headers.get("host"),
    request.nextUrl.hostname,
  );

  if (isMarketingHostname(requestHost)) {
    // The contact endpoint is shared by the marketing pages but lives outside
    // the internal route prefix so it can remain a conventional Route Handler.
    if (request.nextUrl.pathname === "/api/contact") {
      return NextResponse.next();
    }

    const destination = request.nextUrl.clone();
    destination.pathname = `${MARKETING_ROUTE_PREFIX}${
      request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname
    }`;

    return NextResponse.rewrite(destination);
  }

  // Keep the custom domain out of the request path while reputation vendors
  // review its classification. Preserve the requested route and query so an
  // existing /producer or deep link continues to work on the Vercel domain.
  if (requestHost === FLAGGED_APP_HOST) {
    const destination = new URL(request.nextUrl.pathname, BACKUP_APP_ORIGIN);
    destination.search = request.nextUrl.search;

    // This is deliberately temporary: browsers should not cache the fallback
    // after the custom domain is restored.
    return NextResponse.redirect(destination, 307);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)",
  ],
};
