import { afterEach, describe, expect, it, vi } from "vitest";

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
});
