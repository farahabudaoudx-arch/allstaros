import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { verifyResendSenderAccess } from "./email-verification";

describe("Resend customer access verification", () => {
  it("verifies the configured sender domain and returns safe references only", async () => {
    const fetchMock = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer re_private_customer_key");
      return new Response(JSON.stringify({
        data: [{ id: "dom_123", name: "acme.test", status: "verified", capabilities: { sending: "enabled" } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const result = await verifyResendSenderAccess(
      { accessToken: "re_private_customer_key", emailFrom: "Acme <notifications@acme.test>" },
      fetchMock as typeof fetch,
    );
    expect(result).toEqual({
      ok: true,
      providerName: "Resend",
      accountRef: "dom_123",
      accountLabel: "acme.test",
      billingUrl: "https://resend.com/domains",
    });
    expect(JSON.stringify(result)).not.toContain("re_private_customer_key");
  });

  it("blocks an unverified sender domain without returning provider bodies or the key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [{ id: "dom_123", name: "acme.test", status: "pending" }],
    }), { status: 200 }));
    const result = await verifyResendSenderAccess(
      { accessToken: "re_private_customer_key", emailFrom: "notifications@acme.test" },
      fetchMock as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not ready|DNS/i);
    expect(JSON.stringify(result)).not.toContain("re_private_customer_key");
  });
});
