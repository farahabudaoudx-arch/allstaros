import { describe, it, expect, vi, beforeEach } from "vitest";

const captureException = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import {
  producerLoadErrorResponse,
  ProducerQueryError,
} from "./api-error";
import { PRODUCER_API_ERROR_COPY, PRODUCER_LOAD_ERROR_COPY } from "./error-copy";

describe("producerLoadErrorResponse", () => {
  beforeEach(() => {
    captureException.mockReset();
    captureException.mockReturnValue("sentry-event-id");
  });

  it("returns the stable copy and a correlationId for a timeout-style Error", async () => {
    const res = producerLoadErrorResponse(
      new Error("canceling statement due to statement timeout"),
      { route: "/api/producer/dashboard/metrics", rangeKey: "mtd", roleType: "producer" },
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe(PRODUCER_LOAD_ERROR_COPY);
    expect(body.correlationId).toBe("sentry-event-id");
    expect(JSON.stringify(body)).not.toContain("canceling statement");
    expect(JSON.stringify(body)).not.toContain("timeout");
  });

  it("normalizes a PostgREST-style plain object and tags Sentry", async () => {
    const res = producerLoadErrorResponse(
      { message: "relation does not exist", code: "42P01" },
      { route: "/api/producer/goal", roleType: "builder" },
    );
    const body = await res.json();
    expect(body.error).toBe(PRODUCER_LOAD_ERROR_COPY);
    expect(JSON.stringify(body)).not.toContain("relation does not exist");
    expect(JSON.stringify(body)).not.toContain("42P01");

    expect(captureException).toHaveBeenCalledTimes(1);
    const [captured, opts] = captureException.mock.calls[0];
    expect(captured).toBeInstanceOf(Error);
    expect((captured as Error).message).toContain("relation does not exist");
    expect((captured as Error).message).toContain("42P01");
    expect(opts.tags).toEqual({
      route: "/api/producer/goal",
      roleType: "builder",
    });
    expect(JSON.stringify(opts)).not.toMatch(/@|email|full_name/i);
  });

  it("picks queryPhase from ProducerQueryError when not passed in context", async () => {
    producerLoadErrorResponse(
      new ProducerQueryError("canceling statement due to statement timeout", "tracker"),
      { route: "/api/producer/analytics/metrics", rangeKey: "ytd" },
    );
    const [, opts] = captureException.mock.calls[0];
    expect(opts.tags).toMatchObject({
      route: "/api/producer/analytics/metrics",
      rangeKey: "ytd",
      queryPhase: "tracker",
    });
  });

  it("can return a generic API message for non-metrics routes", async () => {
    const res = producerLoadErrorResponse(new Error("relation does not exist"), {
      route: "/api/producer/tracker",
      queryPhase: "tracker",
      clientMessage: PRODUCER_API_ERROR_COPY,
    });
    const body = await res.json();
    expect(body.error).toBe(PRODUCER_API_ERROR_COPY);
    expect(JSON.stringify(body)).not.toContain("relation does not exist");
  });

  it("falls back to a UUID correlationId when Sentry returns empty", async () => {
    captureException.mockReturnValue("");
    const res = producerLoadErrorResponse(new Error("boom"), {
      route: "/api/producer/team",
    });
    const body = await res.json();
    expect(typeof body.correlationId).toBe("string");
    expect(body.correlationId.length).toBeGreaterThan(0);
  });
});
