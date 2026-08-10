import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

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
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)",
  ],
};
