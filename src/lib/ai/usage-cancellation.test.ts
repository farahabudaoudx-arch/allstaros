import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { checkAiRateLimit, recordAiUsage } from "./usage";
import { createServiceRoleClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

it.each(["limit", "ledger"])("cancels the real Supabase %s transport", async (operation) => {
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
    init!.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    started();
  }));
  const client = createClient("https://test.supabase.co", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch },
  });
  vi.mocked(createServiceRoleClient).mockReturnValue(client);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const controller = new AbortController();
  const result = operation === "limit"
    ? checkAiRateLimit("person", "underwriting_analyze", controller.signal)
    : recordAiUsage({ personId: "person", tool: "underwriting_analyze", model: "test",
      usage: { inputTokens: 1, outputTokens: 1 }, signal: controller.signal });
  await ready;
  controller.abort();
  expect(await result).toEqual(operation === "limit" ? { allowed: true } : undefined);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
});
