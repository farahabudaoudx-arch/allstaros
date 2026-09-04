import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ process: vi.fn() }));
vi.mock("@/lib/scorecards/auto-publish", () => ({
  processCompletedScorecardPeriods: mocks.process,
}));

import { GET } from "./route";

describe("Scorecard publishing cron", () => {
  const original = process.env.CRON_SECRET;

  beforeEach(() => {
    mocks.process.mockReset();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("fails closed when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(new NextRequest("http://localhost/api/cron/scorecard-publishing"));
    expect(response.status).toBe(503);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("rejects an incorrect bearer token", async () => {
    process.env.CRON_SECRET = "secret";
    const response = await GET(new NextRequest("http://localhost/api/cron/scorecard-publishing", {
      headers: { authorization: "Bearer wrong" },
    }));
    expect(response.status).toBe(403);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("invokes only the automatic Scorecard orchestrator for an authorized cron", async () => {
    process.env.CRON_SECRET = "secret";
    mocks.process.mockResolvedValue({ evaluated: 1, published: 1, existing: 0, skipped: 0, periods: [] });
    const response = await GET(new NextRequest("http://localhost/api/cron/scorecard-publishing", {
      headers: { authorization: "Bearer secret" },
    }));
    expect(response.status).toBe(200);
    expect(mocks.process).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({ ok: true, evaluated: 1, published: 1 });
  });

  it("returns 500 when automatic publication fails", async () => {
    process.env.CRON_SECRET = "secret";
    mocks.process.mockRejectedValue(new Error("atomic publication failed"));
    const response = await GET(new NextRequest("http://localhost/api/cron/scorecard-publishing", {
      headers: { authorization: "Bearer secret" },
    }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "atomic publication failed" });
  });
});
