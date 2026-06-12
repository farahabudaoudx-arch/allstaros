import { describe, it, expect, vi } from "vitest";

// estimateCostUsd is pure, but usage.ts imports the Supabase server client at the
// top. Mock it so the test doesn't drag in next/headers etc. — we're only
// exercising the cost math here.
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({}),
}));

import { estimateCostUsd } from "./usage";

describe("estimateCostUsd — keeps AI spend predictable (#8)", () => {
  it("prices Haiku input/output at the published rates ($1 in / $5 out per 1M)", () => {
    expect(
      estimateCostUsd("claude-haiku-4-5-20251001", { inputTokens: 1_000_000, outputTokens: 0 }),
    ).toBeCloseTo(1, 6);
    expect(
      estimateCostUsd("claude-haiku-4-5-20251001", { inputTokens: 0, outputTokens: 1_000_000 }),
    ).toBeCloseTo(5, 6);
  });

  it("prices Opus input/output at the published rates ($5 in / $25 out per 1M)", () => {
    expect(
      estimateCostUsd("claude-opus-4-7", { inputTokens: 1_000_000, outputTokens: 0 }),
    ).toBeCloseTo(5, 6);
    expect(
      estimateCostUsd("claude-opus-4-7", { inputTokens: 0, outputTokens: 1_000_000 }),
    ).toBeCloseTo(25, 6);
  });

  it("bills cached input reads at ~0.1x (the prompt-caching saving)", () => {
    expect(
      estimateCostUsd("claude-opus-4-7", {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 1_000_000,
      }),
    ).toBeCloseTo(0.5, 6); // 5 * 0.1
  });

  it("returns 0 for an unknown model rather than throwing", () => {
    expect(estimateCostUsd("some-future-model", { inputTokens: 1000, outputTokens: 1000 })).toBe(0);
  });
});
