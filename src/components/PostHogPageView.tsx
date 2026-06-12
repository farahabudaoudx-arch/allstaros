"use client";

// Captures a PostHog $pageview on every App Router navigation. Next.js client
// navigations don't trigger a full page load, so PostHog's built-in pageview is
// disabled (instrumentation-client.ts) and we fire one here on pathname change.
// Pathname only — no query string — to avoid ever logging an id/token in a URL.

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { capturePageview } from "@/lib/analytics";

export function PostHogPageView() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) capturePageview(pathname);
  }, [pathname]);
  return null;
}
