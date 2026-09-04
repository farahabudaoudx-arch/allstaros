import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ claim: vi.fn() }));
vi.mock("@/lib/gateway/report-pulls", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gateway/report-pulls")>("@/lib/gateway/report-pulls");
  return { ...actual, claimGatewayReportPullJob: mocks.claim };
});

import { POST } from "./route";

describe("Gateway report job claim route", () => {
  const original = process.env.GATEWAY_AGENT_REPORT_TOKEN;
  beforeEach(() => mocks.claim.mockReset());
  afterEach(() => {
    if (original === undefined) delete process.env.GATEWAY_AGENT_REPORT_TOKEN;
    else process.env.GATEWAY_AGENT_REPORT_TOKEN = original;
  });

  it("fails closed without the dedicated report-agent token", async () => {
    delete process.env.GATEWAY_AGENT_REPORT_TOKEN;
    const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/claim", { method: "POST" }));
    expect(response.status).toBe(503);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("rejects the wrong token", async () => {
    process.env.GATEWAY_AGENT_REPORT_TOKEN = "expected";
    const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/claim", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    }));
    expect(response.status).toBe(403);
  });

  it("returns one claimed personal job including the opaque session reference", async () => {
    process.env.GATEWAY_AGENT_REPORT_TOKEN = "expected";
    mocks.claim.mockResolvedValue({
      id: "job-1", personId: "person-1", pullKind: "monday", businessDate: "2026-09-07",
      sessionGeneration: 4, sessionRef: "opaque-session", attemptCount: 1,
    });
    const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/claim", {
      method: "POST",
      headers: { authorization: "Bearer expected", "content-type": "application/json" },
      body: JSON.stringify({ leaseSeconds: 900 }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, job: { pullKind: "monday", sessionRef: "opaque-session" } });
    expect(mocks.claim).toHaveBeenCalledWith(900);
  });
});
