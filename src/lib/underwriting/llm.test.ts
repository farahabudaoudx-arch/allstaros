import { afterEach, beforeEach, expect, it, vi } from "vitest";


const input = {
  text: "synthetic test notes", toolkit: "FEX",
  canonicalConditions: [{ condition: "Diabetes", category: "Test" }],
};
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("uses the real SDK to abort a stalled transport without retrying", async () => {
  const fetch = vi.fn((_url, init: RequestInit) => new Promise<Response>((_, reject) => {
    init.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }));
  vi.stubGlobal("fetch", fetch);
  const { analyzeNotes } = await import("./llm");
  const { APIConnectionTimeoutError } = await import("@anthropic-ai/sdk");
  const assertion = expect(analyzeNotes(input)).rejects.toBeInstanceOf(APIConnectionTimeoutError);
  await vi.advanceTimersByTimeAsync(18_001);
  await assertion;
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true);
});

it("does not retry provider overload errors", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    type: "error", error: { type: "overloaded_error", message: "Overloaded" },
  }), { status: 529, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  const { analyzeNotes } = await import("./llm");
  await expect(analyzeNotes(input)).rejects.toMatchObject({ status: 529 });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("retains canonical filtering, the selected model, and token accounting", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    id: "msg_test", type: "message", role: "assistant", model: "claude-haiku-4-5-20251001",
    stop_reason: "tool_use", stop_sequence: null,
    content: [{ type: "tool_use", id: "tool_test", name: "underwriting_analysis", input: {
      conditions: ["Diabetes", "Invented"], summary: "Test summary", noConditionsMentioned: false,
    } }],
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50 },
  }), { headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  const { analyzeNotes } = await import("./llm");
  const result = await analyzeNotes(input);
  expect(result.conditions).toEqual(["Diabetes"]);
  expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 50 });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
    model: "claude-haiku-4-5-20251001", tool_choice: { type: "tool", name: "underwriting_analysis" },
  });
});
