import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

describe("retired agency-wide Gateway upload", () => {
  const originalToken = process.env.GATEWAY_AGENT_UPLOAD_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) delete process.env.GATEWAY_AGENT_UPLOAD_TOKEN;
    else process.env.GATEWAY_AGENT_UPLOAD_TOKEN = originalToken;
  });

  it("rejects unauthorized callers without importing", async () => {
    process.env.GATEWAY_AGENT_UPLOAD_TOKEN = "secret-token";
    const response = await POST(new NextRequest("http://localhost/api/gateway/issued-premium/upload", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "forbidden" });
  });

  it("returns gone for the old shop-wide CSV path and does not fill other people", async () => {
    process.env.GATEWAY_AGENT_UPLOAD_TOKEN = "secret-token";
    const response = await POST(new NextRequest("http://localhost/api/gateway/issued-premium/upload", {
      method: "POST",
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        periodType: "wtd",
        csvText: "File Date,Producer NPN\n9/1/2026,123456",
      }),
    }));
    expect(response.status).toBe(410);
    const body = await response.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Agency-wide Gateway uploads are retired");
  });
});
