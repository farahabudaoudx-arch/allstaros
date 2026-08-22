import type { ErrorEvent, EventHint } from "@sentry/core";

/** Preview vs production labels. Client and server must use the same value. */
export function sentryEnvironment(): string {
  return (
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development"
  );
}

/** Git SHA / Sentry release, injected at build when available. */
export function sentryRelease(): string | undefined {
  const value =
    process.env.SENTRY_RELEASE ||
    process.env.NEXT_PUBLIC_SENTRY_RELEASE ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    "";
  return value.length > 0 ? value : undefined;
}

const SENSITIVE_HEADER = /^(cookie|set-cookie|authorization|x-supabase|x-auth|x-api-key)/i;
const SENSITIVE_KEY = /email|full_name|first_name|last_name|phone|ssn|token|cookie|password|authorization|auth_user/i;
const EXTENSION_PROTOCOLS = /^(chrome|moz|safari|edge|brave|vivaldi|opera)-extension:\/?\/\//i;
const READ_ONLY_ARRAY_PUSH = /read only property ['"]push['"] of object '\[object Array\]'|read only property ['"]push['"] of object \[object Array\]/i;

function hasExtensionFrame(event: ErrorEvent): boolean {
  const stacks = [
    event.exception?.values,
    event.exception?.values?.flatMap((value) => value.stacktrace?.frames ?? []),
  ].flat();

  for (const entry of stacks) {
    if (!entry) continue;
    const filename =
      typeof entry === "string"
        ? entry
        : "filename" in entry && typeof entry.filename === "string"
          ? entry.filename
          : "";
    if (filename && EXTENSION_PROTOCOLS.test(filename)) return true;
  }

  return false;
}

function isBrowserExtensionReadOnlyArrayNoise(event: ErrorEvent): boolean {
  if (!event.exception?.values?.length) return false;

  const hasNoiseMessage = event.exception.values.some((value) => {
    if (value.type && value.type !== "TypeError") return false;
    if (!value.value) return false;
    return READ_ONLY_ARRAY_PUSH.test(value.value);
  });

  if (!hasNoiseMessage) return false;
  return hasExtensionFrame(event);
}

/**
 * Strip cookies, tokens, and obvious PII before an event leaves the app.
 * Does not drop the event — remaining first-party bugs stay visible.
 */
export function sentryBeforeSend(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  if (isBrowserExtensionReadOnlyArrayNoise(event)) {
    return null;
  }

  if (event.user) {
    delete event.user;
  }

  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.headers) {
      for (const key of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADER.test(key)) delete event.request.headers[key];
      }
    }
    if (event.request.url) {
      try {
        const u = new URL(event.request.url, "http://localhost");
        event.request.url = u.pathname;
      } catch {
        event.request.url = undefined;
      }
    }
    event.request.query_string = undefined;
  }

  if (event.extra) {
    for (const key of Object.keys(event.extra)) {
      if (SENSITIVE_KEY.test(key)) delete event.extra[key];
    }
  }

  if (event.contexts) {
    for (const key of Object.keys(event.contexts)) {
      if (SENSITIVE_KEY.test(key)) delete event.contexts[key];
    }
  }

  return event;
}
