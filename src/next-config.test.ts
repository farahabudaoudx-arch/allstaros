import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  withSentryConfig: (config: unknown) => config,
}));

describe("next.config deployment skew guard", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("sets a stable deployment id to protect against stale server actions", async () => {
    process.env.NEXT_DEPLOYMENT_ID = "preview-build-123";

    const configModule = await import("../next.config");
    const config = configModule.default as { deploymentId?: string };

    expect(config.deploymentId).toBe("preview-build-123");
  });

  it("falls back to VERCEL_GIT_COMMIT_SHA when NEXT_DEPLOYMENT_ID is unset", async () => {
    delete process.env.NEXT_DEPLOYMENT_ID;
    process.env.VERCEL_GIT_COMMIT_SHA = "abc123deploy";

    const configModule = await import("../next.config");
    const config = configModule.default as { deploymentId?: string };

    expect(config.deploymentId).toBe("abc123deploy");
  });
});
