import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  currentPerson: vi.fn(),
  create: vi.fn(),
  fail: vi.fn(),
  hostedUrl: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentPerson: mocks.currentPerson }));
vi.mock("@/lib/gateway/connection", () => ({
  createGatewayConnectRequest: mocks.create,
  failGatewayConnectRequest: mocks.fail,
  gatewayHostedConnectUrl: mocks.hostedUrl,
}));

import { POST } from "./route";

describe("Gateway connection start route", () => {
  const originalHosted = process.env.GATEWAY_HOSTED_CONNECT_URL;
  const originalConnectToken = process.env.GATEWAY_AGENT_CONNECT_TOKEN;

  beforeEach(() => {
    mocks.currentPerson.mockReset();
    mocks.create.mockReset();
    mocks.fail.mockReset();
    mocks.hostedUrl.mockReset();
    mocks.currentPerson.mockResolvedValue({
      id: "person-1",
      status: "active",
      is_producer: true,
      is_builder: false,
    });
    mocks.create.mockResolvedValue({
      requestId: "request-1",
      state: "state-1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    process.env.GATEWAY_AGENT_CONNECT_TOKEN = "connect-token";
  });

  afterEach(() => {
    if (originalHosted === undefined) delete process.env.GATEWAY_HOSTED_CONNECT_URL;
    else process.env.GATEWAY_HOSTED_CONNECT_URL = originalHosted;
    if (originalConnectToken === undefined) delete process.env.GATEWAY_AGENT_CONNECT_TOKEN;
    else process.env.GATEWAY_AGENT_CONNECT_TOKEN = originalConnectToken;
    vi.restoreAllMocks();
  });

  it("redirects only to the configured hosted connector", async () => {
    process.env.GATEWAY_HOSTED_CONNECT_URL = "https://gateway-runner.example.test/connect";
    mocks.hostedUrl.mockReturnValue("https://gateway-runner.example.test/connect?state=state-1");

    const response = await POST(new NextRequest("https://app.example.test/api/gateway/connect/start", {
      method: "POST",
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://gateway-runner.example.test/connect?state=state-1");
    expect(mocks.hostedUrl).toHaveBeenCalledWith({
      baseUrl: "https://gateway-runner.example.test/connect",
      state: "state-1",
      callbackUrl: "https://app.example.test/api/gateway/connect/callback",
      expiresAt: "2099-01-01T00:00:00.000Z",
      connectToken: "connect-token",
    });
  });

  it("fails closed when the hosted connector is not configured", async () => {
    delete process.env.GATEWAY_HOSTED_CONNECT_URL;

    const response = await POST(new NextRequest("https://app.example.test/api/gateway/connect/start", {
      method: "POST",
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("gatewayError=connector_unavailable");
    expect(mocks.fail).toHaveBeenCalledWith("state-1", "hosted_connector_unavailable");
    expect(mocks.hostedUrl).not.toHaveBeenCalled();
  });
});
