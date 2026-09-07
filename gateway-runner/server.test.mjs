import { createServer } from "node:http";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { signGatewayConnectRequest } from "./connect-auth.mjs";
import { EncryptedSessionStore } from "./session-store.mjs";
import { startGatewayRunner } from "./server.mjs";

const cleanup = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()();
});

async function listen(server, port = 0) {
  await new Promise((resolveListen) => server.listen(port, "127.0.0.1", resolveListen));
  return server.address().port;
}

async function unusedPort() {
  const probe = createServer();
  const port = await listen(probe);
  await new Promise((resolveClose) => probe.close(resolveClose));
  return port;
}

async function fakeBackend({ failCallback = false } = {}) {
  const calls = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
    calls.push({ path: req.url, authorization: req.headers.authorization, body });
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/gateway/report-jobs/claim") return res.end(JSON.stringify({ job: null }));
    if (req.url === "/api/gateway/connect/callback") {
      if (failCallback) {
        res.statusCode = 503;
        return res.end(JSON.stringify({ error: "callback_unavailable" }));
      }
      return res.end(JSON.stringify({ status: "connected" }));
    }
    if (req.url === "/api/gateway/connect/fail") return res.end(JSON.stringify({ ok: true }));
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: "not_found" }));
  });
  const port = await listen(server);
  cleanup.push(() => new Promise((resolveClose) => server.close(resolveClose)));
  return { calls, baseUrl: new URL(`http://127.0.0.1:${port}/`) };
}

async function startHarness({ failCallback = false, failProvider = false, connectDelayMs = 50 } = {}) {
  const backend = await fakeBackend({ failCallback });
  const sessionDir = await mkdtemp(join(tmpdir(), "allstar-gateway-server-"));
  cleanup.push(() => rm(sessionDir, { recursive: true, force: true }));
  const runnerPort = await unusedPort();
  const sessionKey = Buffer.alloc(32, 6);
  const providerModule = resolve("gateway-runner/providers/fake.mjs");
  const runner = await startGatewayRunner({
    GATEWAY_RUNNER_BACKEND_BASE_URL: backend.baseUrl.toString(),
    GATEWAY_RUNNER_ALLOWED_CALLBACK_ORIGINS: backend.baseUrl.origin,
    GATEWAY_AGENT_CONNECT_TOKEN: "connect-token",
    GATEWAY_AGENT_REPORT_TOKEN: "report-token",
    GATEWAY_RUNNER_SESSION_KEY: sessionKey.toString("base64"),
    GATEWAY_RUNNER_SESSION_DIR: sessionDir,
    GATEWAY_RUNNER_PROVIDER_MODULE: providerModule,
    GATEWAY_RUNNER_TEST_MODE: "true",
    GATEWAY_RUNNER_HOST: "127.0.0.1",
    GATEWAY_RUNNER_PORT: String(runnerPort),
    GATEWAY_RUNNER_CONCURRENCY: "1",
    GATEWAY_RUNNER_POLL_INTERVAL_MS: "50",
    GATEWAY_RUNNER_REQUEST_TIMEOUT_MS: "1000",
    GATEWAY_RUNNER_PROVIDER_TIMEOUT_MS: "5000",
    GATEWAY_RUNNER_REQUEST_RETRIES: "0",
    GATEWAY_RUNNER_FAKE_CONNECT_DELAY_MS: String(connectDelayMs),
    GATEWAY_RUNNER_FAKE_CONNECT_FAIL: failProvider ? "true" : "false",
  });
  cleanup.push(() => runner.close());
  return { backend, runnerPort, sessionDir, sessionKey };
}

function signedConnectUrl(runnerPort, callback, state) {
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const callbackUrl = callback.toString();
  const signature = signGatewayConnectRequest({
    secret: "connect-token",
    state,
    callbackUrl,
    expiresAt,
  });
  const url = new URL(`http://127.0.0.1:${runnerPort}/connect`);
  url.searchParams.set("state", state);
  url.searchParams.set("callback_url", callbackUrl);
  url.searchParams.set("expires_at", expiresAt);
  url.searchParams.set("sig", signature);
  return url;
}

describe("Gateway runner connect server", () => {
  it("stores provider session material encrypted and callbacks only an opaque sessionRef", async () => {
    const { backend, runnerPort, sessionDir, sessionKey } = await startHarness();
    const callback = new URL("/api/gateway/connect/callback", backend.baseUrl);
    const connectUrl = signedConnectUrl(runnerPort, callback, "state-123");

    const response = await fetch(connectUrl);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("secure hosted browser");
    await expect.poll(() => backend.calls.some((call) => call.path === "/api/gateway/connect/callback")).toBe(true);
    const callbackCall = backend.calls.find((call) => call.path === "/api/gateway/connect/callback");
    expect(callbackCall.authorization).toBe("Bearer connect-token");
    expect(callbackCall.body.state).toBe("state-123");
    expect(callbackCall.body.sessionRef).toMatch(/^gw_/);

    const files = await readdir(sessionDir);
    expect(files).toHaveLength(1);
    const raw = await readFile(join(sessionDir, files[0]), "utf8");
    expect(raw).not.toContain("fake-session");
    const store = new EncryptedSessionStore({ dir: sessionDir, key: sessionKey });
    expect(await store.get(callbackCall.body.sessionRef)).toEqual({ id: "fake-session", alive: true });
  });

  it("deletes the encrypted session if the application callback fails", async () => {
    const { backend, runnerPort, sessionDir } = await startHarness({ failCallback: true });
    const callback = new URL("/api/gateway/connect/callback", backend.baseUrl);
    const connectUrl = signedConnectUrl(runnerPort, callback, "state-fail");

    const response = await fetch(connectUrl);
    expect(response.status).toBe(200);
    await expect.poll(() => backend.calls.some((call) => call.path === "/api/gateway/connect/callback")).toBe(true);
    await expect.poll(async () => (await readdir(sessionDir)).length).toBe(0);
    expect(await readdir(sessionDir)).toEqual([]);
  });

  it("rejects unsigned connect URLs before opening a hosted browser", async () => {
    const { backend, runnerPort } = await startHarness();
    const callback = new URL("/api/gateway/connect/callback", backend.baseUrl);
    const connectUrl = new URL(`http://127.0.0.1:${runnerPort}/connect`);
    connectUrl.searchParams.set("state", "unsigned-state");
    connectUrl.searchParams.set("callback_url", callback.toString());

    const response = await fetch(connectUrl);
    expect(response.status).toBe(400);
    expect(backend.calls.some((call) => call.path === "/api/gateway/connect/callback")).toBe(false);
  });

  it("exposes a token-protected hosted viewport while Gateway login is active", async () => {
    const { backend, runnerPort } = await startHarness({ connectDelayMs: 1000 });
    const callback = new URL("/api/gateway/connect/callback", backend.baseUrl);
    const response = await fetch(signedConnectUrl(runnerPort, callback, "state-surface"));
    const html = await response.text();
    const sessionId = /const sessionId = "([A-Za-z0-9_-]+)";/.exec(html)?.[1];
    const token = /const token = "([A-Za-z0-9_-]+)";/.exec(html)?.[1];
    expect(sessionId).toBeTruthy();
    expect(token).toBeTruthy();
    const base = `http://127.0.0.1:${runnerPort}/connect/session/${sessionId}`;
    const headers = { authorization: `Bearer ${token}` };

    await expect.poll(async () => (await (await fetch(`${base}/status`, { headers })).json()).status).toBe("interactive");
    const frame = await fetch(`${base}/frame`, { headers });
    expect(frame.status).toBe(200);
    expect(frame.headers.get("content-type")).toBe("image/jpeg");
    const input = await fetch(`${base}/input`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ type: "text", text: "user@example.com" }),
    });
    expect(input.status).toBe(200);
    expect((await fetch(`${base}/status`)).status).toBe(404);
  });

  it("reports provider connection failure back to the application instead of leaving the request pending", async () => {
    const { backend, runnerPort } = await startHarness({ failProvider: true });
    const callback = new URL("/api/gateway/connect/callback", backend.baseUrl);
    const response = await fetch(signedConnectUrl(runnerPort, callback, "state-provider-fail"));
    expect(response.status).toBe(200);
    await response.text();
    await expect.poll(() => backend.calls.some((call) => call.path === "/api/gateway/connect/fail")).toBe(true);
    expect(backend.calls.some((call) => call.path === "/api/gateway/connect/callback")).toBe(false);
  });
});
