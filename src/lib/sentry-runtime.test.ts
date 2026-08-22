import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/core";
import { sentryBeforeSend, sentryEnvironment } from "./sentry-runtime";

function event(partial: Partial<ErrorEvent>): ErrorEvent {
  return { timestamp: 0, ...partial } as ErrorEvent;
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
});
