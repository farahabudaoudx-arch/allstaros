import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ mint: vi.fn(), configured: vi.fn() }));
vi.mock("@/lib/gateway/report-pulls", () => ({
  mintGatewayScheduledReportPullJobs: mocks.mint,
  gatewayReportAgentConfigured: mocks.configured,
}));

import { GET } from "./route";

describe("Gateway report pull cron", () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => {
    mocks.mint.mockReset();
    mocks.configured.mockReset();
    mocks.configured.mockReturnValue(true);
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
    vi.restoreAllMocks();
  });

  it("fails closed when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(new NextRequest("http://localhost/api/cron/gateway-report-pulls"));
    expect(response.status).toBe(503);
  });

  it("does not mint jobs when the report runner is not configured", async () => {
    process.env.CRON_SECRET = "secret";
    mocks.configured.mockReturnValue(false);
    const response = await GET(new NextRequest("http://localhost/api/cron/gateway-report-pulls", {
      headers: { authorization: "Bearer secret" },
    }));
    expect(response.status).toBe(503);
    expect(mocks.mint).not.toHaveBeenCalled();
  });

  it("mints idempotent Monday jobs for an authorized cron", async () => {
    process.env.CRON_SECRET = "secret";
    mocks.mint.mockResolvedValue({
      businessDate: "2026-09-07",
      minted: 12,
      schedule: { businessDate: "2026-09-07", accelerated: false, cycle: null, intervalMs: null },
    });
    const response = await GET(new NextRequest("http://localhost/api/cron/gateway-report-pulls", {
      headers: { authorization: "Bearer secret" },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      businessDate: "2026-09-07",
      minted: 12,
      schedule: { businessDate: "2026-09-07", accelerated: false, cycle: null, intervalMs: null },
    });
  });

  it("does not expose internal mint failures", async () => {
    process.env.CRON_SECRET = "secret";
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.mint.mockRejectedValue(new Error("database detail that must stay server-side"));
    const response = await GET(new NextRequest("http://localhost/api/cron/gateway-report-pulls", {
      headers: { authorization: "Bearer secret" },
    }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "gateway_report_pull_mint_failed" });
    expect(log).toHaveBeenCalledOnce();
  });
});
