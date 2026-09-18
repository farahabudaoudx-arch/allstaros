import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ claim: vi.fn() }));
vi.mock("@/lib/gateway/report-pulls", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gateway/report-pulls")>("@/lib/gateway/report-pulls");
  return { ...actual, claimGatewayReportPullJob: mocks.claim };
});

import { POST } from "./route";

describe("Gateway report job claim route", () => {
  const claimRequestId = "11111111-1111-4111-8111-111111111111";
  const original = process.env.GATEWAY_AGENT_REPORT_TOKEN;
  beforeEach(() => mocks.claim.mockReset());
  afterEach(() => {
    if (original === undefined) delete process.env.GATEWAY_AGENT_REPORT_TOKEN;
    else process.env.GATEWAY_AGENT_REPORT_TOKEN = original;
    vi.restoreAllMocks();
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

  it("rejects a same-character-count Unicode token without throwing", async () => {
    process.env.GATEWAY_AGENT_REPORT_TOKEN = "expected";
    const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/claim", {
      method: "POST",
      headers: { authorization: "Bearer éééééééé" },
    }));
    expect(response.status).toBe(403);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("returns one claimed personal job including the opaque session reference", async () => {
    process.env.GATEWAY_AGENT_REPORT_TOKEN = "expected";
    mocks.claim.mockResolvedValue({
      id: "job-1", personId: "person-1", pullKind: "monday", businessDate: "2026-09-07",
      sessionGeneration: 4, sessionRef: "opaque-session", attemptCount: 1,
      claimToken: "claim-token-1", leaseExpiresAt: "2026-09-07T12:15:00.000Z",
    });
    const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/claim", {
      method: "POST",
      headers: { authorization: "Bearer expected", "content-type": "application/json" },
      body: JSON.stringify({ claimRequestId, leaseSeconds: 900 }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      job: { pullKind: "monday", sessionRef: "opaque-session", claimToken: "claim-token-1" },
    });
    expect(mocks.claim).toHaveBeenCalledWith({ claimRequestId, leaseSeconds: 900 });
  });

  it("requires a canonical stable claim request UUID before touching the queue", async () => {
    process.env.GATEWAY_AGENT_REPORT_TOKEN = "expected";
    for (const body of [
      { leaseSeconds: 900 },
      { claimRequestId: "not-a-uuid", leaseSeconds: 900 },
      { claimRequestId: "11111111-1111-0111-8111-111111111111", leaseSeconds: 900 },
    ]) {
      const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/claim", {
        method: "POST",
        headers: { authorization: "Bearer expected", "content-type": "application/json" },
        body: JSON.stringify(body),
      }));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_claim_request_id" });
    }
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("normalizes an otherwise canonical UUID before forwarding it", async () => {
    process.env.GATEWAY_AGENT_REPORT_TOKEN = "expected";
    mocks.claim.mockResolvedValue(null);
    const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/claim", {
      method: "POST",
      headers: { authorization: "Bearer expected", "content-type": "application/json" },
      body: JSON.stringify({ claimRequestId: claimRequestId.toUpperCase() }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.claim).toHaveBeenCalledWith({ claimRequestId, leaseSeconds: 1200 });
  });

  it("does not expose internal claim failures", async () => {
    process.env.GATEWAY_AGENT_REPORT_TOKEN = "expected";
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.claim.mockImplementationOnce(async () => {
      throw new Error("database detail that must stay server-side");
    });
    const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/claim", {
      method: "POST",
      headers: { authorization: "Bearer expected", "content-type": "application/json" },
      body: JSON.stringify({ claimRequestId, leaseSeconds: 900 }),
    }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "gateway_report_claim_failed" });
    expect(log).toHaveBeenCalledWith("[gateway-report-jobs/claim] Failed to claim report job.");
    expect(JSON.stringify(log.mock.calls)).not.toContain("database detail");
  });
});
