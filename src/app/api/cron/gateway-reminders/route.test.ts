import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  processPendingGatewayReminders: vi.fn(),
}));

vi.mock("@/lib/gateway/reminder-worker", () => ({
  processPendingGatewayReminders: mocks.processPendingGatewayReminders,
}));

import { GET } from "./route";

describe("Gateway reminder cron", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    mocks.processPendingGatewayReminders.mockReset();
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("fails closed when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(new NextRequest("http://localhost/api/cron/gateway-reminders"));
    expect(response.status).toBe(503);
    expect(mocks.processPendingGatewayReminders).not.toHaveBeenCalled();
  });

  it("rejects an invalid bearer token", async () => {
    process.env.CRON_SECRET = "expected-secret";
    const response = await GET(new NextRequest("http://localhost/api/cron/gateway-reminders", {
      headers: { authorization: "Bearer wrong-secret" },
    }));
    expect(response.status).toBe(403);
    expect(mocks.processPendingGatewayReminders).not.toHaveBeenCalled();
  });

  it("processes reminders for an authorized cron", async () => {
    process.env.CRON_SECRET = "expected-secret";
    mocks.processPendingGatewayReminders.mockResolvedValue({
      businessDate: "2026-09-07",
      mondayMinted: 1,
      loaded: 1,
      claimed: 1,
      sent: 1,
      failed: 0,
      missingRecipient: 0,
      cancelled: 0,
      deferred: 0,
      skipped: 0,
    });

    const response = await GET(new NextRequest("http://localhost/api/cron/gateway-reminders", {
      headers: { authorization: "Bearer expected-secret" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sent: 1, failed: 0, mondayMinted: 1 });
    expect(mocks.processPendingGatewayReminders).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when the reminder worker itself fails", async () => {
    process.env.CRON_SECRET = "expected-secret";
    mocks.processPendingGatewayReminders.mockRejectedValue(new Error("reminder worker failed"));

    const response = await GET(new NextRequest("http://localhost/api/cron/gateway-reminders", {
      headers: { authorization: "Bearer expected-secret" },
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "reminder worker failed" });
  });
});
