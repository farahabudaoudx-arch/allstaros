import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({ rpc: mocks.rpc }),
}));

import {
  claimGatewayReportPullJob,
  gatewayReportPullSchedule,
  mintGatewayScheduledReportPullJobs,
} from "./report-pulls";

const envNames = [
  "GATEWAY_REPORT_PULL_TEST_ACCELERATION",
  "GATEWAY_REPORT_PULL_TEST_INTERVAL_MS",
  "GATEWAY_REPORT_PULL_TEST_ANCHOR_INSTANT",
  "GATEWAY_REPORT_PULL_TEST_ANCHOR_BUSINESS_DATE",
] as const;
const saved = new Map<string, string | undefined>();

describe("Gateway application report-pull scheduler", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocks.rpc.mockReset();
    for (const name of envNames) {
      saved.set(name, process.env[name]);
      delete process.env[name];
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const name of envNames) {
      const value = saved.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("keeps normal scheduling on the real Chicago business date", () => {
    expect(gatewayReportPullSchedule(new Date("2026-09-07T15:00:00.000Z"), { NODE_ENV: "test" }))
      .toEqual({ businessDate: "2026-09-07", accelerated: false, cycle: null, intervalMs: null });
  });

  it("advances one controlled Monday business-date cycle per configured test interval", () => {
    const env = {
      NODE_ENV: "test",
      GATEWAY_REPORT_PULL_TEST_ACCELERATION: "true",
      GATEWAY_REPORT_PULL_TEST_INTERVAL_MS: "1000",
      GATEWAY_REPORT_PULL_TEST_ANCHOR_INSTANT: "2026-09-05T10:00:00.000Z",
      GATEWAY_REPORT_PULL_TEST_ANCHOR_BUSINESS_DATE: "2026-09-07",
    };

    expect(gatewayReportPullSchedule(new Date("2026-09-05T10:00:02.500Z"), env)).toEqual({
      businessDate: "2026-09-21",
      accelerated: true,
      cycle: 2,
      intervalMs: 1000,
    });
  });

  it("fails closed if acceleration is enabled in production or with a non-Monday anchor", () => {
    expect(() => gatewayReportPullSchedule(new Date(), {
      NODE_ENV: "production",
      GATEWAY_REPORT_PULL_TEST_ACCELERATION: "true",
    })).toThrow(/forbidden in production/i);
    expect(() => gatewayReportPullSchedule(new Date("2026-09-05T10:00:00.000Z"), {
      NODE_ENV: "test",
      GATEWAY_REPORT_PULL_TEST_ACCELERATION: "true",
      GATEWAY_REPORT_PULL_TEST_INTERVAL_MS: "1000",
      GATEWAY_REPORT_PULL_TEST_ANCHOR_INSTANT: "2026-09-05T10:00:00.000Z",
      GATEWAY_REPORT_PULL_TEST_ANCHOR_BUSINESS_DATE: "2026-09-08",
    })).toThrow(/must be a Monday/i);
  });

  it("does not mint an accelerated cycle before the server-controlled anchor instant", async () => {
    process.env.GATEWAY_REPORT_PULL_TEST_ACCELERATION = "true";
    process.env.GATEWAY_REPORT_PULL_TEST_INTERVAL_MS = "1000";
    process.env.GATEWAY_REPORT_PULL_TEST_ANCHOR_INSTANT = "2026-09-05T10:00:05.000Z";
    process.env.GATEWAY_REPORT_PULL_TEST_ANCHOR_BUSINESS_DATE = "2026-09-07";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T10:00:04.999Z"));

    await expect(mintGatewayScheduledReportPullJobs()).rejects.toThrow(/has not reached its anchor instant/i);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("drives the actual application mint RPC with the server-derived accelerated business date", async () => {
    process.env.GATEWAY_REPORT_PULL_TEST_ACCELERATION = "true";
    process.env.GATEWAY_REPORT_PULL_TEST_INTERVAL_MS = "1000";
    process.env.GATEWAY_REPORT_PULL_TEST_ANCHOR_INSTANT = "2026-09-05T10:00:00.000Z";
    process.env.GATEWAY_REPORT_PULL_TEST_ANCHOR_BUSINESS_DATE = "2026-09-07";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T10:00:03.100Z"));
    mocks.rpc.mockResolvedValue({ data: 4, error: null });

    await expect(mintGatewayScheduledReportPullJobs()).resolves.toEqual({
      businessDate: "2026-09-28",
      minted: 4,
      schedule: { businessDate: "2026-09-28", accelerated: true, cycle: 3, intervalMs: 1000 },
    });
    expect(mocks.rpc).toHaveBeenCalledWith("mint_gateway_monday_report_pull_jobs", {
      p_business_date: "2026-09-28",
    });
  });

  it("passes a stable request UUID into the fenced claim RPC", async () => {
    const claimRequestId = "11111111-1111-4111-8111-111111111111";
    mocks.rpc.mockResolvedValue({
      data: [{
        id: "job-1",
        person_id: "person-1",
        pull_kind: "monday",
        business_date: "2026-09-14",
        session_generation: 7,
        session_ref: "opaque-session",
        attempt_count: 2,
        claim_token: "claim-token",
        lease_expires_at: "2026-09-14T12:30:00.000Z",
      }],
      error: null,
    });

    await expect(claimGatewayReportPullJob({ claimRequestId, leaseSeconds: 900 })).resolves.toMatchObject({
      id: "job-1",
      personId: "person-1",
      claimToken: "claim-token",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("claim_gateway_report_pull_job", {
      p_claim_request_id: claimRequestId,
      p_lease_seconds: 900,
    });
  });
});
