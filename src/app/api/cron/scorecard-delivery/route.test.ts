import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  processPendingScorecardDeliveries: vi.fn(),
}));

vi.mock("@/lib/scorecards/delivery-worker", () => ({
  processPendingScorecardDeliveries: mocks.processPendingScorecardDeliveries,
}));

import { GET } from "./route";

describe("Scorecard delivery cron", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    mocks.processPendingScorecardDeliveries.mockReset();
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("fails closed when the cron secret is not configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(new NextRequest("http://localhost/api/cron/scorecard-delivery"));
    expect(response.status).toBe(503);
    expect(mocks.processPendingScorecardDeliveries).not.toHaveBeenCalled();
  });

  it("rejects an invalid cron bearer token", async () => {
    process.env.CRON_SECRET = "expected-secret";
    const response = await GET(new NextRequest("http://localhost/api/cron/scorecard-delivery", {
      headers: { authorization: "Bearer wrong-secret" },
    }));
    expect(response.status).toBe(403);
    expect(mocks.processPendingScorecardDeliveries).not.toHaveBeenCalled();
  });

  it("processes the delivery outbox for the authorized cron", async () => {
    process.env.CRON_SECRET = "expected-secret";
    mocks.processPendingScorecardDeliveries.mockResolvedValue({
      loaded: 2,
      claimed: 2,
      sent: 1,
      failed: 1,
      missingRecipient: 0,
      skipped: 0,
    });

    const response = await GET(new NextRequest("http://localhost/api/cron/scorecard-delivery", {
      headers: { authorization: "Bearer expected-secret" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sent: 1, failed: 1 });
    expect(mocks.processPendingScorecardDeliveries).toHaveBeenCalledTimes(1);
  });
});