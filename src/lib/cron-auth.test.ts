import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { authorizeCronRequest } from "./cron-auth";

describe("scheduled job authorization", () => {
  const original = process.env.CRON_SECRET;

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("fails closed when CRON_SECRET is missing", () => {
    delete process.env.CRON_SECRET;
    expect(authorizeCronRequest(new NextRequest("http://localhost/api/cron/test"))).toEqual({
      ok: false,
      status: 503,
      error: "Scheduled job authorization is not configured.",
    });
  });

  it("rejects query-string secrets and wrong bearer values", () => {
    process.env.CRON_SECRET = "expected";
    expect(authorizeCronRequest(new NextRequest("http://localhost/api/cron/test?key=expected"))).toMatchObject({ ok: false, status: 403 });
    expect(authorizeCronRequest(new NextRequest("http://localhost/api/cron/test", { headers: { authorization: "Bearer wrong" } }))).toMatchObject({ ok: false, status: 403 });
  });

  it("accepts only the exact bearer token", () => {
    process.env.CRON_SECRET = "expected";
    expect(authorizeCronRequest(new NextRequest("http://localhost/api/cron/test", { headers: { authorization: "Bearer expected" } }))).toEqual({ ok: true });
  });
});
