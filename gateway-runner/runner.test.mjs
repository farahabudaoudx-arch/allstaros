import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { assertAllowedCallback, loadRunnerConfig } from "./config.mjs";
import { GatewayBackendClient, GatewayBackendError } from "./backend-client.mjs";
import { GatewayRunnerEngine, GatewayTransientError, withTimeout } from "./engine.mjs";
import { createProvider as createFakeProvider } from "./providers/fake.mjs";
import { EncryptedSessionStore } from "./session-store.mjs";

function baseConfig(overrides = {}) {
  return {
    backendBaseUrl: new URL("https://backend.example.test/"),
    callbackOrigins: new Set(["https://app.example.test"]),
    connectToken: "connect-token",
    reportToken: "report-token",
    sessionKey: Buffer.alloc(32, 7),
    sessionDir: "unused",
    providerModule: "unused",
    listenHost: "127.0.0.1",
    listenPort: 8788,
    workerConcurrency: 4,
    leaseSeconds: 60,
    pollIntervalMs: 50,
    requestTimeoutMs: 1000,
    providerTimeoutMs: 1000,
    requestRetries: 0,
    testMode: true,
    ...overrides,
  };
}

function report(periodType, coverage, reportDate = "2026-02-23") {
  return {
    periodType,
    reportDate,
    csvText: "File Date,Producer\n2/23/2026,Acceptance",
    sourceFileName: `${periodType}-${reportDate}.csv`,
    coverage,
  };
}

function trio() {
  return [
    report("wtd", { periodStart: "2026-02-01", periodEnd: "2026-02-28", weekOrdinal: 4, periodFinal: true }),
    report("mtd", { periodStart: "2026-02-01", periodEnd: "2026-02-28" }),
    report("ytd", { periodStart: "2026-01-01", periodEnd: "2026-12-31" }),
  ];
}

function job(overrides = {}) {
  return {
    id: "job-1",
    personId: "person-1",
    pullKind: "monday",
    businessDate: "2026-02-23",
    sessionGeneration: 1,
    sessionRef: "session-1",
    attemptCount: 1,
    claimToken: "claim-1",
    leaseExpiresAt: "2099-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function fakeBackend(overrides = {}) {
  return {
    renew: vi.fn(async () => ({ ok: true })),
    importReport: vi.fn(async () => ({ status: "imported" })),
    complete: vi.fn(async (_job, outcome) => ({ status: outcome === "succeeded" ? "succeeded" : outcome })),
    claim: vi.fn(async () => null),
    ...overrides,
  };
}

describe("Gateway runner contract", () => {
  it("accepts only the exact All Star OS callback path on an allowlisted origin", () => {
    const config = baseConfig();
    expect(assertAllowedCallback(config, "https://app.example.test/api/gateway/connect/callback").pathname)
      .toBe("/api/gateway/connect/callback");
    expect(() => assertAllowedCallback(config, "https://app.example.test/api/gateway/report-jobs/import"))
      .toThrow("not allowlisted");
    expect(() => assertAllowedCallback(config, "https://other.example.test/api/gateway/connect/callback"))
      .toThrow("not allowlisted");
  });

  it("refuses the fake provider unless explicit runner test mode is enabled", () => {
    const env = {
      GATEWAY_RUNNER_BACKEND_BASE_URL: "https://app.example.test",
      GATEWAY_RUNNER_ALLOWED_CALLBACK_ORIGINS: "https://app.example.test",
      GATEWAY_AGENT_CONNECT_TOKEN: "connect",
      GATEWAY_AGENT_REPORT_TOKEN: "report",
      GATEWAY_RUNNER_SESSION_KEY: Buffer.alloc(32, 1).toString("base64"),
      GATEWAY_RUNNER_SESSION_DIR: "sessions",
      GATEWAY_RUNNER_PROVIDER_MODULE: "./gateway-runner/providers/fake.mjs",
    };
    expect(() => loadRunnerConfig(env)).toThrow("only allowed");
    expect(loadRunnerConfig({ ...env, GATEWAY_RUNNER_TEST_MODE: "true", GATEWAY_RUNNER_POLL_INTERVAL_MS: "50" }).testMode)
      .toBe(true);
  });

  it("encrypts session material at rest and deletes it on revoke", async () => {
    const dir = await mkdtemp(join(tmpdir(), "allstar-gateway-session-"));
    try {
      const store = new EncryptedSessionStore({ dir, key: Buffer.alloc(32, 2) });
      const ref = await store.create({ cookie: "sensitive-cookie", nested: { token: "secret" } });
      expect(await store.get(ref)).toEqual({ cookie: "sensitive-cookie", nested: { token: "secret" } });
      const { readdir } = await import("node:fs/promises");
      const files = await readdir(dir);
      expect(files).toHaveLength(1);
      expect(await readFile(join(dir, files[0]), "utf8")).not.toContain("sensitive-cookie");
      await store.delete(ref);
      expect(await store.get(ref)).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("imports exactly WTD, MTD, and YTD then completes the claimed job", async () => {
    const backend = fakeBackend();
    const provider = {
      validateSession: vi.fn(async () => true),
      pullCurrentReports: vi.fn(async () => trio()),
      listHistoricalReports: vi.fn(),
    };
    const sessions = { get: vi.fn(async () => ({ id: "provider-session" })), delete: vi.fn() };
    const engine = new GatewayRunnerEngine({ config: baseConfig(), backend, provider, sessions });

    await expect(engine.runClaimedJob(job())).resolves.toMatchObject({ status: "succeeded", reports: 3 });
    expect(backend.importReport).toHaveBeenCalledTimes(3);
    expect(backend.complete).toHaveBeenCalledWith(expect.anything(), "succeeded", expect.anything(), expect.any(AbortSignal));
  });

  it("reconnect pulls only the current WTD, MTD, and YTD and never requests missed history", async () => {
    const backend = fakeBackend();
    const provider = {
      validateSession: vi.fn(async () => true),
      pullCurrentReports: vi.fn(async () => trio()),
      listHistoricalReports: vi.fn(async () => {
        throw new Error("reconnect must not backfill missed Mondays");
      }),
    };
    const sessions = { get: vi.fn(async () => ({ id: "provider-session" })), delete: vi.fn() };
    const engine = new GatewayRunnerEngine({ config: baseConfig(), backend, provider, sessions });

    await expect(engine.runClaimedJob(job({ pullKind: "reconnect", sessionGeneration: 2 })))
      .resolves.toMatchObject({ status: "succeeded", reports: 3 });
    expect(provider.pullCurrentReports).toHaveBeenCalledTimes(1);
    expect(provider.listHistoricalReports).not.toHaveBeenCalled();
    expect(backend.importReport.mock.calls.map(([, imported]) => imported.periodType).sort())
      .toEqual(["mtd", "wtd", "ytd"]);
  });

  it("does not carry stale data forward when a current pull misses or duplicates a required report type", async () => {
    for (const current of [[...trio().slice(0, 2)], [...trio(), trio()[0]]]) {
      const backend = fakeBackend();
      const provider = { validateSession: vi.fn(async () => true), pullCurrentReports: vi.fn(async () => current) };
      const sessions = { get: vi.fn(async () => ({})), delete: vi.fn() };
      const engine = new GatewayRunnerEngine({ config: baseConfig(), backend, provider, sessions });
      const result = await engine.runClaimedJob(job());
      expect(result.status).toBe("retryable");
      expect(backend.importReport).not.toHaveBeenCalled();
      expect(backend.complete).toHaveBeenCalledWith(expect.anything(), "retryable", expect.anything(), expect.any(AbortSignal));
    }
  });

  it("requires explicit WTD coverage even during first-connect history", async () => {
    const backend = fakeBackend();
    const historical = report("wtd", null, "2026-02-23");
    const provider = {
      validateSession: vi.fn(async () => true),
      listHistoricalReports: vi.fn(async () => [historical]),
    };
    const sessions = { get: vi.fn(async () => ({})), delete: vi.fn() };
    const engine = new GatewayRunnerEngine({ config: baseConfig(), backend, provider, sessions });
    const result = await engine.runClaimedJob(job({ pullKind: "first_connect" }));
    expect(provider.listHistoricalReports).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ from: "2026-01-01" }));
    expect(result.status).toBe("failed");
    expect(backend.importReport).not.toHaveBeenCalled();
  });

  it("turns a dead provider session into needs_reconnect and removes local session material", async () => {
    const backend = fakeBackend({ complete: vi.fn(async () => ({ status: "needs_reconnect" })) });
    const provider = { validateSession: vi.fn(async () => false) };
    const sessions = { get: vi.fn(async () => ({ alive: false })), delete: vi.fn(async () => undefined) };
    const engine = new GatewayRunnerEngine({ config: baseConfig(), backend, provider, sessions });
    await expect(engine.runClaimedJob(job())).resolves.toMatchObject({ status: "needs_reconnect" });
    expect(sessions.delete).toHaveBeenCalledWith("session-1");
    expect(backend.complete).toHaveBeenCalledWith(expect.anything(), "needs_reconnect", expect.anything(), expect.any(AbortSignal));
  });

  it("stops a stale worker after a 409 import fence and never completes it", async () => {
    const backend = fakeBackend({
      importReport: vi.fn(async () => { throw new GatewayBackendError("stale", { status: 409, code: "gateway_report_pull_stale" }); }),
    });
    const provider = { validateSession: vi.fn(async () => true), pullCurrentReports: vi.fn(async () => trio()) };
    const sessions = { get: vi.fn(async () => ({})), delete: vi.fn() };
    const engine = new GatewayRunnerEngine({ config: baseConfig(), backend, provider, sessions });
    await expect(engine.runClaimedJob(job())).resolves.toEqual({ status: "stale" });
    expect(backend.complete).not.toHaveBeenCalled();
  });

  it("keeps a worker alive when processing and failure completion both fail, then processes the next job", async () => {
    const stop = new AbortController();
    const first = job({ id: "job-broken", claimToken: "claim-broken" });
    const second = job({ id: "job-recovered", claimToken: "claim-recovered" });
    const claims = [first, second];
    const logs = [];
    const backend = fakeBackend({
      claim: vi.fn(async () => claims.shift() ?? null),
      importReport: vi.fn(async (claimed) => {
        if (claimed.id === first.id) throw new Error("sensitive processing detail");
        return { status: "imported" };
      }),
      complete: vi.fn(async (claimed, outcome) => {
        if (claimed.id === first.id) throw new TypeError("sensitive backend transport detail");
        if (claimed.id === second.id && outcome === "succeeded") {
          queueMicrotask(() => stop.abort());
          return { status: "succeeded" };
        }
        return { status: outcome };
      }),
    });
    const provider = { validateSession: vi.fn(async () => true), pullCurrentReports: vi.fn(async () => trio()) };
    const sessions = { get: vi.fn(async () => ({})), delete: vi.fn() };
    const engine = new GatewayRunnerEngine({
      config: baseConfig({ workerConcurrency: 1, pollIntervalMs: 50 }),
      backend,
      provider,
      sessions,
      logger: { error: (message) => logs.push(message) },
    });

    await engine.run(stop.signal);

    expect(backend.claim).toHaveBeenCalledTimes(2);
    expect(backend.complete).toHaveBeenCalledWith(first, "failed", expect.anything(), expect.any(AbortSignal));
    expect(backend.complete).toHaveBeenCalledWith(second, "succeeded", expect.anything(), expect.any(AbortSignal));
    expect(backend.importReport.mock.calls.filter(([claimed]) => claimed.id === second.id)).toHaveLength(3);
    expect(engine.health()).toMatchObject({ ok: false, runningWorkers: 0, workerFailures: 1 });
    expect(logs.join("\n")).toContain("completion failed (transport_failure)");
    expect(logs.join("\n")).not.toContain("sensitive");
  });

  it("stops cleanly when shutdown arrives during worker failure backoff", async () => {
    const stop = new AbortController();
    const backend = fakeBackend({
      claim: vi.fn(async () => { throw new TypeError("backend unavailable"); }),
    });
    const engine = new GatewayRunnerEngine({
      config: baseConfig({ workerConcurrency: 1, pollIntervalMs: 50 }),
      backend,
      provider: {},
      sessions: {},
      logger: { error() {} },
    });
    const running = engine.run(stop.signal);
    await vi.waitFor(() => expect(engine.health().workerFailures).toBeGreaterThan(0), { timeout: 1_000 });
    stop.abort();
    await expect(running).resolves.toBeUndefined();
    expect(engine.health()).toMatchObject({ ok: false, runningWorkers: 0 });
  });

  it("bounds runner wait even when a provider ignores cancellation", async () => {
    const started = Date.now();
    const never = new Promise(() => {});
    await expect(withTimeout(() => never, 20)).rejects.toBeInstanceOf(GatewayTransientError);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("releases an ignored provider wait when runner shutdown aborts the parent signal", async () => {
    const stop = new AbortController();
    const never = new Promise(() => {});
    const pending = withTimeout(() => never, 5_000, stop.signal);
    stop.abort(new Error("runner shutdown"));
    await expect(pending).rejects.toThrow("runner shutdown");
  });

  it("generates canonical month ends in the test provider", async () => {
    const provider = createFakeProvider();
    const feb = await provider.pullCurrentReports({ alive: true }, { businessDate: "2026-02-23" });
    const mar = await provider.pullCurrentReports({ alive: true }, { businessDate: "2026-03-30" });
    expect(feb[0].coverage.periodEnd).toBe("2026-02-28");
    expect(mar[0].coverage.periodEnd).toBe("2026-03-31");
  });
});

it("serializes the provider week date without substituting the acquisition date", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  const backend = new GatewayBackendClient(baseConfig(), fetchMock);
  await backend.importReport(job(), report("wtd", { periodStart: "2026-09-01", periodEnd: "2026-09-30",
    weekOrdinal: 5, periodFinal: true, weekStart: "2026-09-28" }, "2026-10-05"));
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ gatewayWeekStart: "2026-09-28", reportDate: "2026-10-05" });
});
