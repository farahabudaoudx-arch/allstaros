// Next.js server instrumentation hook (native file convention — picked up
// automatically, no withSentryConfig build plugin needed). register() runs once
// per server instance; onRequestError forwards server-side errors to Sentry.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown in Server Components, Route Handlers, and Server
// Actions. No-op until Sentry.init has run (i.e. until the DSN is set).
export const onRequestError = Sentry.captureRequestError;
