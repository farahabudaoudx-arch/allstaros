import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ complete: vi.fn(), fail: vi.fn() }));
vi.mock("@/lib/gateway/report-pulls", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gateway/report-pulls")>("@/lib/gateway/report-pulls");
  return {
    ...actual,
    completeGatewayReportPullJob: mocks.complete,
    failGatewayReportPullJob: mocks.fail,
  };
});

import { POST } from "./route";

describe("Gateway report job completion route", () => {
  const original = process.env.GATEWAY_AGENT_REPORT_TOKEN;
  beforeEach(() => {
    mocks.complete.mockReset();
    mocks.fail.mockReset();
  });
  afterEach(() => {
    if (original === undefined) delete process.env.GATEWAY_AGENT_REPORT_TOKEN;
    else process.env.GATEWAY_AGENT_REPORT_TOKEN = original;
  });

  it("marks a successful job complete", async () => {
    process.env.GATEWAY_AGENT_REPORT_TOKEN = "secret";
    mocks.complete.mockResolvedValue(true);
    const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/complete", {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: JSON.stringify({ jobId: "job-1", sessionGeneration: 4, outcome: "succeeded", summary: { reports: 3 } }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "succeeded" });
  });

  it("maps a dead Gateway session to the exact-generation reconnect path", async () => {
    process.env.GATEWAY_AGENT_REPORT_TOKEN = "secret";
    mocks.fail.mockResolvedValue("needs_reconnect");
    const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/complete", {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: JSON.stringify({
        jobId: "job-1",
        sessionGeneration: 4,
        outcome: "needs_reconnect",
        error: "gateway logged out",
      }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "needs_reconnect" });
    expect(mocks.fail).toHaveBeenCalledWith(expect.objectContaining({
      needsReconnect: true,
      sessionGeneration: 4,
    }));
  });

  it("returns conflict when a stale runner tries to finish an older generation", async () => {
    process.env.GATEWAY_AGENT_REPORT_TOKEN = "secret";
    mocks.complete.mockResolvedValue(false);
    const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/complete", {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: JSON.stringify({ jobId: "job-1", sessionGeneration: 3, outcome: "succeeded" }),
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, status: "stale" });
  });
});
