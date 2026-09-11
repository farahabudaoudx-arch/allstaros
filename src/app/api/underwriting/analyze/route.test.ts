import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { getCurrentPerson } from "@/lib/auth";
import { checkAiRateLimit, recordAiUsage } from "@/lib/ai/usage";
import { analyzeNotes } from "@/lib/underwriting/llm";
import { APIConnectionTimeoutError } from "@anthropic-ai/sdk";

vi.mock("@/lib/auth", () => ({ getCurrentPerson: vi.fn() }));
vi.mock("@/lib/ai/usage", () => ({ checkAiRateLimit: vi.fn(), recordAiUsage: vi.fn() }));
vi.mock("@/lib/underwriting/llm", () => ({
  analyzeNotes: vi.fn(), UNDERWRITING_MODEL: "claude-haiku-4-5-20251001",
}));

const pending = () => new Promise<never>(() => {});
const request = (signal?: AbortSignal, text = "has diabetes") => new Request("http://localhost/api/underwriting/analyze", {
  method: "POST", body: JSON.stringify({ text, toolkit: "FEX" }), signal,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(getCurrentPerson).mockResolvedValue({ id: "test-person" } as never);
  vi.mocked(checkAiRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(recordAiUsage).mockResolvedValue();
  vi.mocked(analyzeNotes).mockResolvedValue({
    conditions: ["Diabetes (No Complications)"], summary: "Matched diabetes",
    noConditionsMentioned: false, usage: { inputTokens: 100, outputTokens: 20 },
  });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.resetAllMocks(); });

describe("analyze route resilience", () => {
  it("returns carrier outcomes and records exactly one successful call", async () => {
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.conditions).toEqual(["Diabetes (No Complications)"]);
    expect(body.results.length).toBeGreaterThan(0);
    expect(recordAiUsage).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a stalled model at 18 seconds without manufacturing an approval", async () => {
    vi.mocked(analyzeNotes).mockImplementation(pending);
    const result = POST(request());
    await vi.advanceTimersByTimeAsync(18_000);
    const response = await result;
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ ok: false, stage: "llm" });
    expect(vi.mocked(analyzeNotes).mock.calls[0][0].signal?.aborted).toBe(true);
    expect(recordAiUsage).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns a completed analysis even if accounting never settles", async () => {
    vi.mocked(recordAiUsage).mockImplementation(pending);
    const result = POST(request());
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await result).status).toBe(200);
    expect(vi.mocked(recordAiUsage).mock.calls[0][0].signal?.aborted).toBe(true);
  });

  it("preserves fail-open rate limiting when the database stalls", async () => {
    vi.mocked(checkAiRateLimit).mockImplementation(pending);
    const result = POST(request());
    await vi.advanceTimersByTimeAsync(2_000);
    expect((await result).status).toBe(200);
    expect(vi.mocked(checkAiRateLimit).mock.calls[0][2]?.aborted).toBe(true);
  });

  it("fails closed on stalled auth and never starts paid work", async () => {
    vi.mocked(getCurrentPerson).mockImplementation(pending);
    const result = POST(request());
    await vi.advanceTimersByTimeAsync(5_000);
    const response = await result;
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ stage: "auth", ok: false });
    expect(analyzeNotes).not.toHaveBeenCalled();
  });

  it("shares a 25-second budget across sequential dependencies", async () => {
    vi.mocked(getCurrentPerson).mockImplementation(() => new Promise(resolve =>
      setTimeout(() => resolve({ id: "test-person" } as never), 4_900)));
    vi.mocked(checkAiRateLimit).mockImplementation(pending);
    vi.mocked(analyzeNotes).mockImplementation(() => new Promise(resolve =>
      setTimeout(() => resolve({ conditions: [], summary: "No match", noConditionsMentioned: false,
        usage: { inputTokens: 10, outputTokens: 10 } }), 17_900)));
    vi.mocked(recordAiUsage).mockImplementation(pending);
    const result = POST(request());
    await vi.advanceTimersByTimeAsync(25_000);
    expect((await result).status).toBe(200);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels in-flight model work when the caller disconnects", async () => {
    vi.mocked(analyzeNotes).mockImplementation(pending);
    const controller = new AbortController();
    const result = POST(request(controller.signal));
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    expect((await result).status).toBe(499);
    expect(vi.mocked(analyzeNotes).mock.calls[0][0].signal?.aborted).toBe(true);
    expect(recordAiUsage).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not expose provider error details or return false success", async () => {
    vi.mocked(analyzeNotes).mockRejectedValue(new Error("sensitive upstream details"));
    const response = await POST(request());
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).not.toContain("sensitive");
    expect(recordAiUsage).not.toHaveBeenCalled();
  });

  it("classifies SDK timeouts even though their Error.name is generic", async () => {
    vi.mocked(analyzeNotes).mockRejectedValue(new APIConnectionTimeoutError());
    const response = await POST(request());
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ ok: false, stage: "llm" });
  });

  it("does not start dependencies for an already-cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();
    expect((await POST(request(controller.signal))).status).toBe(499);
    expect(getCurrentPerson).not.toHaveBeenCalled();
    expect(analyzeNotes).not.toHaveBeenCalled();
  });

  it("preserves authentication and rate-limit responses", async () => {
    vi.mocked(getCurrentPerson).mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
    vi.mocked(checkAiRateLimit).mockResolvedValueOnce({ allowed: false, reason: "Slow down", retryAfterSeconds: 60 });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(analyzeNotes).not.toHaveBeenCalled();
  });

  it("preserves empty and malformed input handling", async () => {
    expect((await POST(request(undefined, ""))).status).toBe(200);
    const invalid = new Request("http://localhost", { method: "POST", body: "{" });
    expect((await POST(invalid)).status).toBe(400);
    expect(analyzeNotes).not.toHaveBeenCalled();
  });
});
