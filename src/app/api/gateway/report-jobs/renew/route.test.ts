import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ renew: vi.fn() }));
vi.mock("@/lib/gateway/report-pulls", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gateway/report-pulls")>("@/lib/gateway/report-pulls");
  return { ...actual, renewGatewayReportPullJobLease: mocks.renew };
});

import { POST } from "./route";

describe("Gateway report job lease renewal route", () => {
  const original = process.env.GATEWAY_AGENT_REPORT_TOKEN;
  beforeEach(() => mocks.renew.mockReset());
  afterEach(() => {
    if (original === undefined) delete process.env.GATEWAY_AGENT_REPORT_TOKEN;
    else process.env.GATEWAY_AGENT_REPORT_TOKEN = original;
    vi.restoreAllMocks();
  });

  it("renews an exact live claim", async () => {
    process.env.GATEWAY_AGENT_REPORT_TOKEN = "secret";
    mocks.renew.mockResolvedValue("2026-09-07T12:30:00.000Z");
    const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/renew", {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: JSON.stringify({
        jobId: "job-1",
        sessionGeneration: 4,
        claimToken: "claim-1",
        leaseSeconds: 900,
      }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, status: "renewed" });
    expect(mocks.renew).toHaveBeenCalledWith(expect.objectContaining({ claimToken: "claim-1" }));
  });

  it("rejects a stale claim without reviving it", async () => {
    process.env.GATEWAY_AGENT_REPORT_TOKEN = "secret";
    mocks.renew.mockResolvedValue(null);
    const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/renew", {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: JSON.stringify({ jobId: "job-1", sessionGeneration: 4, claimToken: "old-claim" }),
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, status: "stale" });
  });
});
