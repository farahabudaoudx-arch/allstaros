import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const localPilot = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/lib/local-pilot", () => ({
  isWhitelabelLocalPilot: () => localPilot.enabled,
}));

import {
  verifyAnthropicAccess,
  verifyBunnyVideoAccess,
} from "./content-service-verification";

describe("Whitelabel content-service verification", () => {
  it("verifies the local Anthropic fixture without a cloud request", async () => {
    localPilot.enabled = true;
    const fetchMock = vi.fn(async () => {
      throw new Error("cloud fetch should not run in local pilot");
    });
    const result = await verifyAnthropicAccess("ignored", fetchMock as typeof fetch);
    expect(result).toMatchObject({
      ok: true,
      providerName: "Anthropic",
      accountRef: "anthropic",
      configuration: { provider: "anthropic" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    localPilot.enabled = false;
  });

  it("verifies Anthropic without returning the API key", async () => {
    const fetchMock = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("x-api-key")).toBe("customer-anthropic-key");
      expect(headers.get("anthropic-version")).toBeTruthy();
      return new Response(JSON.stringify({ data: [{ id: "claude-haiku" }] }), { status: 200 });
    });

    const result = await verifyAnthropicAccess("customer-anthropic-key", fetchMock as typeof fetch);
    expect(result).toMatchObject({ ok: true, providerName: "Anthropic", accountRef: "anthropic" });
    expect(JSON.stringify(result)).not.toContain("customer-anthropic-key");
  });

  it("verifies every configured Bunny library and returns only non-secret configuration", async () => {
    const seen: string[] = [];
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      seen.push(url);
      const key = new Headers(init?.headers).get("AccessKey");
      expect(["recruit-key", "live-key"]).toContain(key);
      return new Response(JSON.stringify({ totalItems: 0, items: [] }), { status: 200 });
    });

    const result = await verifyBunnyVideoAccess(
      [
        { key: "recruiting", libraryId: "123", apiKey: "recruit-key", cdnHostname: "vz.example.test" },
        { key: "live", libraryId: "456", apiKey: "live-key" },
        { key: "tutorials", libraryId: "", apiKey: "" },
      ],
      fetchMock as typeof fetch,
    );

    expect(result).toMatchObject({
      ok: true,
      providerName: "Bunny",
      accountRef: "123",
      configuration: {
        provider: "bunny",
        libraries: {
          recruiting: { libraryId: "123", cdnHostname: "vz.example.test" },
          live: { libraryId: "456" },
        },
      },
    });
    expect(seen).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain("recruit-key");
    expect(JSON.stringify(result)).not.toContain("live-key");
  });

  it("requires the primary Bunny training library", async () => {
    const result = await verifyBunnyVideoAccess([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/primary training library/i);
  });
});
