// Sentry — server (Node.js runtime) init. Loaded once by instrumentation.ts's
// register() on server boot. Dormant unless NEXT_PUBLIC_SENTRY_DSN is set, so
// local dev and any unconfigured env stay completely silent.
import * as Sentry from "@sentry/nextjs";
import { sentryBeforeSend, sentryEnvironment, sentryRelease } from "@/lib/sentry-runtime";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: sentryEnvironment(),
    release: sentryRelease(),
    // Error tracking only — no performance traces. Keeps the free-tier quota
    // focused on the "smoke alarm". Raise this to sample transactions later.
    tracesSampleRate: 0,
    // Insurance app: never let Sentry attach IPs, cookies, or user identifiers.
    // PII must not leave the app through the error pipeline.
    sendDefaultPii: false,
    beforeSend: sentryBeforeSend,
  });
}
