import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ fail: vi.fn() }));
vi.mock("@/lib/gateway/connection", () => ({ failGatewayConnectRequest: mocks.fail }));

import { POST } from "./route";

describe("Gateway runner connection failure callback", () => {
  const originalToken = process.env.GATEWAY_AGENT_CONNECT_TOKEN;

  beforeEach(() => {
    mocks.fail.mockReset();
    mocks.fail.mockResolvedValue(undefined);
    process.env.GATEWAY_AGENT_CONNECT_TOKEN = "runner-connect-token";
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.GATEWAY_AGENT_CONNECT_TOKEN;
    else process.env.GATEWAY_AGENT_CONNECT_TOKEN = originalToken;
  });

  it("accepts only the runner bearer token and records a bounded failure code", async () => {
    const response = await POST(new NextRequest("https://app.example.test/api/gateway/connect/fail", {
      method: "POST",
      headers: { authorization: "Bearer runner-connect-token", "content-type": "application/json" },
      body: JSON.stringify({ state: "state-1", error: "gateway_connect_failed" }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.fail).toHaveBeenCalledWith("state-1", "gateway_connect_failed");
  });

  it("rejects an invalid runner token", async () => {
    const response = await POST(new NextRequest("https://app.example.test/api/gateway/connect/fail", {
      method: "POST",
      headers: { authorization: "Bearer wrong-token", "content-type": "application/json" },
      body: JSON.stringify({ state: "state-1", error: "gateway_connect_failed" }),
    }));
    expect(response.status).toBe(403);
    expect(mocks.fail).not.toHaveBeenCalled();
  });
});
