// Product analytics (PRE_LAUNCH_ROADMAP §1 #2). Thin wrapper over PostHog so the
// rest of the app never imports posthog-js directly and event capture is a no-op
// when analytics isn't configured.
//
// Privacy posture (this is an insurance app): autocapture is OFF and Session
// Replay is fully PII-masked (see instrumentation-client.ts) — we record only the
// explicit funnel events below, never raw input or text content. Events are
// anonymous (a PostHog cookie distinct_id); we never attach names, emails, or
// medical data.

import posthog from "posthog-js";

const ENABLED = !!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

/** Capture a product event. No-op unless PostHog is configured + on the client. */
export function track(event: string, properties?: Record<string, unknown>): void {
  if (!ENABLED || typeof window === "undefined") return;
  try {
    posthog.capture(event, properties);
  } catch {
    // Analytics must never break a user flow.
  }
}

/** Capture a route-change pageview (App Router SPA navs don't fire on their own). */
export function capturePageview(path: string): void {
  if (!ENABLED || typeof window === "undefined") return;
  try {
    posthog.capture("$pageview", { $current_url: path });
  } catch {
    // ignore
  }
}
