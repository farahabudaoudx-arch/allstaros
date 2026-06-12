// Sentry — edge runtime init (middleware, edge route handlers). Loaded by
// instrumentation.ts's register() when NEXT_RUNTIME === "edge". Same PII-safe,
// error-only posture as the server config; dormant unless the DSN is set.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}
