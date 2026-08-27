// Sentry — edge runtime init (middleware, edge route handlers). Loaded by
// instrumentation.ts's register() when NEXT_RUNTIME === "edge". Same PII-safe,
// error-only posture as the server config; dormant unless the DSN is set.
import * as Sentry from "@sentry/nextjs";
import { sentryBeforeSend, sentryEnvironment, sentryRelease } from "@/lib/sentry-runtime";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: sentryEnvironment(),
    release: sentryRelease(),
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: sentryBeforeSend,
  });
}
