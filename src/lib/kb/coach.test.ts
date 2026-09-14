import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInstallationConfig: vi.fn(),
  generate: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/installation/config", () => ({
  getInstallationConfig: mocks.getInstallationConfig,
}));
vi.mock("@/lib/services/ai/generation", () => ({
  DEFAULT_STANDARD_COACH_MODEL: "claude-test",
  generateStandardCoachResponse: mocks.generate,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import { askCoach } from "./coach";

describe("standard/custom coach boundaries", () => {
  const originalCoachMode = process.env.INSTALLATION_COACH_MODE;
  const originalOpenAi = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.INSTALLATION_COACH_MODE;
    delete process.env.OPENAI_API_KEY;
    mocks.getInstallationConfig.mockResolvedValue({ shortName: "Acme" });
    mocks.generate.mockResolvedValue({
      ok: true,
      text: "Standard response",
      model: "claude-test",
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0 },
    });
  });

  afterEach(() => {
    if (originalCoachMode === undefined) delete process.env.INSTALLATION_COACH_MODE;
    else process.env.INSTALLATION_COACH_MODE = originalCoachMode;
    if (originalOpenAi === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAi;
  });

  it("uses a branded standard profile without pretending customer uploads are training data", async () => {
    const result = await askCoach({ question: "How should I handle a price objection?", history: [] });
    expect(result).toMatchObject({ ok: true, answer: "Standard response", sources: [], model: "claude-test" });
    const call = mocks.generate.mock.calls[0]?.[0] as { system: string };
    expect(call.system).toContain("Acme Sidekick");
    expect(call.system).toMatch(/STANDARD coach profile/i);
    expect(call.system).toMatch(/not trained on this customer's uploaded training library/i);
    expect(call.system).not.toContain("CONTEXT:\n");
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("does not silently downgrade custom AI to general knowledge when retrieval is missing", async () => {
    process.env.INSTALLATION_COACH_MODE = "custom";
    delete process.env.OPENAI_API_KEY;
    const result = await askCoach({ question: "What does our agency say here?", history: [] });
    expect(result).toEqual({
      ok: false,
      error: "Custom AI retrieval is not configured for this installation.",
    });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
