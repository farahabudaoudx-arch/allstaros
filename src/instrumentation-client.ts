// Next.js client instrumentation (native file convention — runs after the HTML
// loads, before React hydration). Initializes Sentry + PostHog for the browser
// and wires router-navigation breadcrumbs. Each is dormant unless its key is set.
import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Error tracking only — see server config for the rationale.
    tracesSampleRate: 0,
    // Insurance app: no Session Replay. It would record the screen, which can
    // show client SSN / banking / card data. Deliberately omitted.
    sendDefaultPii: false,
    // Drop benign browser/network noise — none of it is actionable on our end.
    // These fire from aborted requests (a page navigating away while a fetch is
    // still in flight — e.g. the post-signup redirect on /welcome surfaces as
    // "Load failed" in WebKit), flaky connections, ad blockers, and adware/
    // security extensions that intercept traffic (e.g. "safebrowse.io"). They
    // reflect the visitor's device/network, not a bug in our code.
    ignoreErrors: [
      "Load failed", // WebKit/Safari: fetch aborted or failed
      "Failed to fetch", // Chromium: same
      "NetworkError when attempting to fetch resource", // Firefox: same
      "AbortError",
    ],
  });
}

// PostHog product analytics (PRE_LAUNCH_ROADMAP §1 #2). Privacy-conscious config
// for an insurance app: NO autocapture (we capture only explicit funnel events),
// anonymous-only profiles. Dormant unless NEXT_PUBLIC_POSTHOG_KEY is set.
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    autocapture: false,
    capture_pageview: false, // captured manually per route — see PostHogPageView
    capture_pageleave: true,
    person_profiles: "identified_only",
    // Session Replay is ON, but fully PII-masked: this app still shows client
    // names, addresses, and medical notes. Recordings mask ALL text and inputs,
    // so you see how users move through the UI (clicks, nav, layout) but never
    // the actual content. Loosen maskTextSelector later to unmask non-PII screens.
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
    },
  });
}

// Adds navigation breadcrumbs so a client error report shows the route path the
// user took to get there. No-op until Sentry.init has run.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
