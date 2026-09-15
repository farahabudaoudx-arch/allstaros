import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GatewayBackendClient } from "./backend-client.mjs";
import { GatewayRunnerEngine } from "./engine.mjs";
import { createProvider } from "./providers/fake.mjs";
import { EncryptedSessionStore } from "./session-store.mjs";

const cleanup = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()();
});

async function fakeBackendServer() {
  const calls = [];
  const claimQueue = [];
  const scheduledKeys = new Set();
  const timers = new Set();
  const uniqueJobKey = (job) => [job.personId, job.pullKind, job.sessionGeneration, job.businessDate].join("|");
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
    calls.push({ path: req.url, authorization: req.headers.authorization, body });
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/gateway/report-jobs/claim") {
      return res.end(JSON.stringify({ job: claimQueue.shift() ?? null }));
    }
    if (req.url === "/api/gateway/report-jobs/import") return res.end(JSON.stringify({ status: "imported" }));
    if (req.url === "/api/gateway/report-jobs/complete") return res.end(JSON.stringify({ status: body.outcome === "succeeded" ? "succeeded" : body.outcome }));
    if (req.url === "/api/gateway/report-jobs/renew") return res.end(JSON.stringify({ ok: true, leaseExpiresAt: "2099-01-01T00:00:00.000Z" }));
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  cleanup.push(() => {
    for (const timer of timers) clearTimeout(timer);
    return new Promise((resolve) => server.close(resolve));
  });
  return {
    calls,
    baseUrl: new URL(`http://127.0.0.1:${address.port}/`),
    schedule(job, delayMs) {
      const key = uniqueJobKey(job);
      if (scheduledKeys.has(key)) return false;
      scheduledKeys.add(key);
      const timer = setTimeout(() => {
        timers.delete(timer);
        claimQueue.push(job);
      }, delayMs);
      timers.add(timer);
      return true;
    },
  };
}

function historicalWtd(reportDate, periodStart, periodEnd, weekOrdinal) {
  return {
    periodType: "wtd",
    reportDate,
    csvText: `File Date,Producer\n${reportDate},Historical E2E`,
    sourceFileName: `history-${reportDate}.csv`,
    coverage: { periodStart, periodEnd, gatewayReportDate: reportDate, weekOrdinal, periodFinal: true },
  };
}

async function createHarness(providerOptions = {}) {
  const fakeBackend = await fakeBackendServer();
  const sessionDir = await mkdtemp(join(tmpdir(), "allstar-gateway-e2e-"));
  cleanup.push(() => rm(sessionDir, { recursive: true, force: true }));
  const config = {
    backendBaseUrl: fakeBackend.baseUrl,
    reportToken: "e2e-report-token",
    requestRetries: 0,
    requestTimeoutMs: 1000,
    providerTimeoutMs: 1000,
    leaseSeconds: 60,
    workerConcurrency: 1,
    pollIntervalMs: 10,
    testMode: true,
  };
  const backend = new GatewayBackendClient(config);
  const sessions = new EncryptedSessionStore({ dir: sessionDir, key: Buffer.alloc(32, 9) });
  const provider = createProvider(providerOptions);
  const engine = new GatewayRunnerEngine({ config, backend, provider, sessions, logger: { error() {} } });
  return { fakeBackend, sessions, engine };
}

describe("fake-backend accelerated Gateway runner HTTP harness", () => {
  it("runs first connection then two reconnect report cycles without touching another person", async () => {
    const history = [
      historicalWtd("2026-01-26", "2026-01-01", "2026-01-31", 4),
      historicalWtd("2026-02-23", "2026-02-01", "2026-02-28", 4),
    ];
    const { fakeBackend, sessions, engine } = await createHarness({ history, weekOrdinal: 4, periodFinal: true });
    const sessionRef1 = await sessions.create({ alive: true, generation: 1 });
    const sessionRef2 = await sessions.create({ alive: true, generation: 2 });
    const baseJob = {
      personId: "person-under-test",
      businessDate: "2026-02-23",
      attemptCount: 1,
      leaseExpiresAt: "2099-01-01T00:00:00.000Z",
    };

    const first = await engine.runClaimedJob({ ...baseJob, id: "job-first", pullKind: "first_connect", sessionGeneration: 1, sessionRef: sessionRef1, claimToken: "claim-first" });
    const reconnect1 = await engine.runClaimedJob({ ...baseJob, id: "job-reconnect-1", pullKind: "reconnect", sessionGeneration: 2, sessionRef: sessionRef2, claimToken: "claim-r1" });
    const reconnect2 = await engine.runClaimedJob({ ...baseJob, id: "job-reconnect-2", pullKind: "reconnect", sessionGeneration: 2, sessionRef: sessionRef2, claimToken: "claim-r2" });

    expect([first.status, reconnect1.status, reconnect2.status]).toEqual(["succeeded", "succeeded", "succeeded"]);
    const imports = fakeBackend.calls.filter((call) => call.path === "/api/gateway/report-jobs/import");
    expect(imports).toHaveLength(8);
    expect(new Set(imports.map((call) => call.body.jobId))).toEqual(new Set(["job-first", "job-reconnect-1", "job-reconnect-2"]));
    expect(imports.filter((call) => call.body.jobId === "job-first")).toHaveLength(2);
    for (const reconnectJobId of ["job-reconnect-1", "job-reconnect-2"]) {
      expect(imports.filter((call) => call.body.jobId === reconnectJobId).map((call) => call.body.periodType).sort())
        .toEqual(["mtd", "wtd", "ytd"]);
    }
    expect(imports.every((call) => call.authorization === "Bearer e2e-report-token")).toBe(true);
    expect(imports.every((call) => call.body.personId == null)).toBe(true);
    expect(fakeBackend.calls.some((call) => JSON.stringify(call.body).includes("another-person"))).toBe(false);
  });

  it.each([
    ["one retained month", [historicalWtd("2026-02-23", "2026-02-01", "2026-02-28", 4)], 1],
    ["no retained history", [], 0],
  ])("accepts first-connect with %s", async (_label, history, expectedImports) => {
    const { fakeBackend, sessions, engine } = await createHarness({ history });
    const sessionRef = await sessions.create({ alive: true, generation: 1 });
    const result = await engine.runClaimedJob({
      id: `job-first-${expectedImports}`,
      personId: "person-under-test",
      pullKind: "first_connect",
      businessDate: "2026-02-23",
      sessionGeneration: 1,
      sessionRef,
      attemptCount: 1,
      claimToken: `claim-first-${expectedImports}`,
      leaseExpiresAt: "2099-01-01T00:00:00.000Z",
    });

    expect(result).toMatchObject({ status: "succeeded", reports: expectedImports });
    expect(fakeBackend.calls.filter((call) => call.path === "/api/gateway/report-jobs/import")).toHaveLength(expectedImports);
    expect(fakeBackend.calls.filter((call) => call.path === "/api/gateway/report-jobs/complete")).toHaveLength(1);
  });

  it("runs fake-backend accelerated cycles through the real claim loop while deduping one cycle", async () => {
    const { fakeBackend, sessions, engine } = await createHarness({
      history: [historicalWtd("2026-02-23", "2026-02-01", "2026-02-28", 4)],
      weekOrdinal: 1,
      periodFinal: false,
    });
    const sessionRef1 = await sessions.create({ alive: true, generation: 1 });
    const sessionRef2 = await sessions.create({ alive: true, generation: 2 });
    const jobFor = (id, pullKind, businessDate, generation, sessionRef) => ({
      id,
      personId: "person-under-test",
      pullKind,
      businessDate,
      sessionGeneration: generation,
      sessionRef,
      attemptCount: 1,
      claimToken: `claim-${id}`,
      leaseExpiresAt: "2099-01-01T00:00:00.000Z",
    });
    const cycle1 = jobFor("cycle-1", "monday", "2026-03-02", 1, sessionRef1);
    const cycle1Duplicate = jobFor("cycle-1-duplicate", "monday", "2026-03-02", 1, sessionRef1);
    const cycle2 = jobFor("cycle-2", "monday", "2026-03-09", 1, sessionRef1);
    const reconnect = jobFor("cycle-reconnect", "reconnect", "2026-03-10", 2, sessionRef2);

    expect(fakeBackend.schedule(cycle1, 0)).toBe(true);
    expect(fakeBackend.schedule(cycle1Duplicate, 5)).toBe(false);
    expect(fakeBackend.schedule(cycle2, 20)).toBe(true);
    expect(fakeBackend.schedule(reconnect, 40)).toBe(true);

    const stop = new AbortController();
    const running = engine.run(stop.signal);
    await expect.poll(
      () => fakeBackend.calls.filter((call) => call.path === "/api/gateway/report-jobs/complete").length,
      { timeout: 2_000, interval: 10 },
    ).toBe(3);
    stop.abort();
    await running;

    const imports = fakeBackend.calls.filter((call) => call.path === "/api/gateway/report-jobs/import");
    expect(new Set(imports.map((call) => call.body.jobId))).toEqual(new Set(["cycle-1", "cycle-2", "cycle-reconnect"]));
    for (const jobId of ["cycle-1", "cycle-2", "cycle-reconnect"]) {
      expect(imports.filter((call) => call.body.jobId === jobId).map((call) => call.body.periodType).sort())
        .toEqual(["mtd", "wtd", "ytd"]);
    }
    expect(imports.some((call) => String(call.body.sourceFileName ?? "").startsWith("history-"))).toBe(false);
    expect(fakeBackend.calls.filter((call) => call.path === "/api/gateway/report-jobs/claim").length).toBeGreaterThanOrEqual(3);
  });
});
