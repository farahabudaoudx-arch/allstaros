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
const EXTENSION_PROTOCOLS =
  /^(chrome|moz|safari-web|safari|edge|brave|vivaldi|opera)-extension:\/?\/\//i;
const READ_ONLY_ARRAY_PUSH =
  /read only property ['"]push['"] of object '\[object Array\]'|read only property ['"]push['"] of object \[object Array\]/i;
const APP_FRAME =
  /_next\/static|webpack:|\/src\/|localhost|allstarlifegroup\.com/i;

/** Collect stack frame paths from a Sentry exception event. */
function stackFramePaths(event: ErrorEvent): string[] {
  const paths: string[] = [];
  for (const ex of event.exception?.values ?? []) {
    for (const frame of ex.stacktrace?.frames ?? []) {
      const path = frame.filename ?? frame.abs_path ?? "";
      if (path) paths.push(path);
    }
  }
  return paths;
}

function stackMatches(event: ErrorEvent, pattern: RegExp): boolean {
  return stackFramePaths(event).some((path) => pattern.test(path));
}

function exceptionEntries(event: ErrorEvent): Array<{ type?: string; value?: string }> {
  return event.exception?.values ?? [];
}

function hasExtensionFrame(event: ErrorEvent): boolean {
  return stackFramePaths(event).some((path) => EXTENSION_PROTOCOLS.test(path));
}

/**
 * Sentry JAVASCRIPT-NEXTJS-C: read-only array `.push` when a browser extension
 * frame is present (#008). First-party stacks on `/` still reach Sentry.
 */
export function isReadOnlyArrayPushExtensionNoise(event: ErrorEvent): boolean {
  const hasNoiseMessage = exceptionEntries(event).some((value) => {
    if (value.type && value.type !== "TypeError") return false;
    if (!value.value) return false;
    return READ_ONLY_ARRAY_PUSH.test(value.value);
  });
  if (!hasNoiseMessage) return false;
  return hasExtensionFrame(event);
}

/** Injected ad/malware script noise (Sentry F/J): M_ID + executors/200.js. */
function isMIdInjectedScriptNoise(event: ErrorEvent): boolean {
  const hasMessage = exceptionEntries(event).some(
    (ex) => ex.value != null && /M_ID/i.test(ex.value),
  );
  if (!hasMessage) return false;
  return stackMatches(event, /executors\/200\.js/i);
}

/** MetaMask extension injection when the app has no wallet flow (Sentry 6). */
function isMetaMaskInpageNoise(event: ErrorEvent): boolean {
  const hasMessage = exceptionEntries(event).some(
    (ex) => ex.value === "Failed to connect to MetaMask",
  );
  if (!hasMessage) return false;
  return stackMatches(event, /inpage\.js/i);
}

/** PostHog session recorder blocked on cross-origin iframe (Sentry G). */
function isPostHogCrossOriginRecorderNoise(event: ErrorEvent): boolean {
  return exceptionEntries(event).some((ex) => {
    if (ex.type !== "SecurityError" || !ex.value) return false;
    const crossOrigin =
      /blocked a frame|cross-origin|permission denied|failed to read a named property/i.test(ex.value);
    if (!crossOrigin) return false;
    return stackMatches(event, /posthog-recorder\.js/i);
  });
}

/** Obfuscated injected script on sign-in (Sentry B): _0x3c02 + non-app frame. */
function isObfuscatedInjectedScriptNoise(event: ErrorEvent): boolean {
  const hasIdentifier = exceptionEntries(event).some(
    (ex) => ex.value != null && /_0x3c02/i.test(ex.value),
  );
  if (!hasIdentifier) return false;

  const paths = stackFramePaths(event);
  if (paths.length === 0) return false;

  const hasExternal = paths.some(
    (path) =>
      EXTENSION_PROTOCOLS.test(path) ||
      /executors\/200\.js|inpage\.js|posthog-recorder\.js/i.test(path) ||
      (!/_next\/static|webpack:|\/src\//i.test(path) && /app:\/\/\//i.test(path)),
  );
  const allAppFrames = paths.every((path) => APP_FRAME.test(path));

  return hasExternal && !allAppFrames;
}

/** Known third-party / extension noise — narrow message + stack pairing (#010). */
export function isKnownThirdPartySentryNoise(event: ErrorEvent): boolean {
  return (
    isMIdInjectedScriptNoise(event) ||
    isMetaMaskInpageNoise(event) ||
    isPostHogCrossOriginRecorderNoise(event) ||
    isObfuscatedInjectedScriptNoise(event)
  );
}

/**
 * Strip cookies, tokens, and obvious PII before an event leaves the app.
 * Does not drop the event — remaining first-party bugs stay visible.
 */
export function sentryBeforeSend(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  if (isReadOnlyArrayPushExtensionNoise(event)) {
    return null;
  }

  if (isKnownThirdPartySentryNoise(event)) {
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
