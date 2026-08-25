import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/core";
import { isKnownThirdPartySentryNoise, sentryBeforeSend, sentryEnvironment } from "./sentry-runtime";

function event(partial: Partial<ErrorEvent>): ErrorEvent {
  return { timestamp: 0, ...partial } as ErrorEvent;
}

function ex(
  type: string,
  value: string,
  frames: string[],
): ErrorEvent["exception"] {
  return {
    values: [
      {
        type,
        value,
        stacktrace: {
          frames: frames.map((filename) => ({ filename })),
        },
      },
    ],
  };
}

describe("sentryEnvironment", () => {
  it("prefers the public build-time environment name", () => {
    const prev = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT;
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT = "preview";
    expect(sentryEnvironment()).toBe("preview");
    if (prev === undefined) delete process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT;
    else process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT = prev;
  });
});

describe("sentryBeforeSend", () => {
  it("strips cookies, auth headers, query strings, and user/PII extras", () => {
    const cleaned = sentryBeforeSend(
      event({
        user: { id: "auth-user-uuid", email: "ada@example.com" },
        request: {
          url: "https://app.example/producer?token=secret",
          cookies: { sb: "session" },
          headers: {
            cookie: "sb=session",
            authorization: "Bearer abc",
            "content-type": "application/json",
          },
          data: { full_name: "Ada Lovelace" },
          query_string: "token=secret",
        },
        extra: {
          full_name: "Ada Lovelace",
          route: "/api/producer/dashboard/metrics",
        },
      }),
    );

    expect(cleaned?.user).toBeUndefined();
    expect(cleaned?.request?.cookies).toBeUndefined();
    expect(cleaned?.request?.data).toBeUndefined();
    expect(cleaned?.request?.query_string).toBeUndefined();
    expect(cleaned?.request?.url).toBe("/producer");
    expect(cleaned?.request?.headers?.cookie).toBeUndefined();
    expect(cleaned?.request?.headers?.authorization).toBeUndefined();
    expect(cleaned?.request?.headers?.["content-type"]).toBe("application/json");
    expect(cleaned?.extra?.full_name).toBeUndefined();
    expect(cleaned?.extra?.route).toBe("/api/producer/dashboard/metrics");
    expect(JSON.stringify(cleaned)).not.toMatch(/ada@example|Ada Lovelace|Bearer abc|sb=session/i);
  });

  it("drops the read-only array push noise only when the stack traces to a browser extension", () => {
    const extensionNoise = sentryBeforeSend(
      event({
        exception: {
          values: [
            {
              type: "TypeError",
              value: "Cannot assign to read only property 'push' of object '[object Array]'",
              stacktrace: {
                frames: [
                  { filename: "chrome-extension://abc/content.js" },
                  { filename: "https://app.example/_next/static/chunks/app/page.js" },
                ],
              },
            },
          ],
        },
      }),
    );

    expect(extensionNoise).toBeNull();

    const appError = sentryBeforeSend(
      event({
        exception: {
          values: [
            {
              type: "TypeError",
              value: "Cannot assign to read only property 'push' of object '[object Array]'",
              stacktrace: {
                frames: [
                  { filename: "https://app.example/_next/static/chunks/app/producer/page.js" },
                ],
              },
            },
          ],
        },
      }),
    );

    expect(appError).not.toBeNull();
  });

  describe("third-party noise filters (#010)", () => {
    it("drops M_ID noise when executors/200.js is in the stack", () => {
      const payload = event({
        exception: ex(
          "TypeError",
          "Cannot read properties of undefined (reading 'M_ID')",
          ["app:///executors/200.js", "https://app.example/_next/static/chunks/app/page.js"],
        ),
      });
      expect(isKnownThirdPartySentryNoise(payload)).toBe(true);
      expect(sentryBeforeSend(payload)).toBeNull();
    });

    it("keeps M_ID-shaped errors when the stack is first-party only", () => {
      const payload = event({
        exception: ex("TypeError", "Cannot read properties of undefined (reading 'M_ID')", [
          "https://app.example/_next/static/chunks/app/producer/page.js",
        ]),
      });
      expect(isKnownThirdPartySentryNoise(payload)).toBe(false);
      expect(sentryBeforeSend(payload)).not.toBeNull();
    });

    it("drops MetaMask inpage.js injection noise", () => {
      const payload = event({
        exception: ex("Error", "Failed to connect to MetaMask", [
          "app:///scripts/inpage.js",
          "https://app.example/_next/static/chunks/app/page.js",
        ]),
      });
      expect(sentryBeforeSend(payload)).toBeNull();
    });

    it("keeps MetaMask message when the stack is application-only", () => {
      const payload = event({
        exception: ex("Error", "Failed to connect to MetaMask", [
          "https://app.example/_next/static/chunks/app/page.js",
        ]),
      });
      expect(sentryBeforeSend(payload)).not.toBeNull();
    });

    it("drops PostHog recorder cross-origin SecurityError", () => {
      const payload = event({
        exception: ex(
          "SecurityError",
          "Blocked a frame with origin \"https://app.allstarlifegroup.com\" from accessing a cross-origin frame.",
          ["app:///static/posthog-recorder.js"],
        ),
      });
      expect(sentryBeforeSend(payload)).toBeNull();
    });

    it("keeps first-party SecurityError without posthog-recorder.js", () => {
      const payload = event({
        exception: ex(
          "SecurityError",
          "Blocked a frame with origin \"https://app.example\" from accessing a cross-origin frame.",
          ["https://app.example/_next/static/chunks/app/producer/page.js"],
        ),
      });
      expect(sentryBeforeSend(payload)).not.toBeNull();
    });

    it("drops obfuscated _0x3c02 noise with an external frame", () => {
      const payload = event({
        exception: ex(
          "ReferenceError",
          "_0x3c02 is not defined",
          ["app:///injected/obfuscated.js", "https://app.example/_next/static/chunks/app/page.js"],
        ),
      });
      expect(sentryBeforeSend(payload)).toBeNull();
    });

    it("keeps first-party TypeError with an application frame", () => {
      const payload = event({
        exception: ex("TypeError", "Cannot read properties of null (reading 'foo')", [
          "https://app.example/_next/static/chunks/app/producer/page.js",
        ]),
      });
      expect(sentryBeforeSend(payload)).not.toBeNull();
    });

    it("does not drop read-only push via the third-party filter (handled separately by #008 path)", () => {
      const payload = event({
        exception: ex(
          "TypeError",
          "Cannot assign to read only property 'push' of object '[object Array]'",
          ["https://app.example/_next/static/chunks/app/page.js"],
        ),
      });
      expect(isKnownThirdPartySentryNoise(payload)).toBe(false);
      expect(sentryBeforeSend(payload)).not.toBeNull();
    });
  });
});
