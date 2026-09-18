import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { loadRunnerConfig, assertAllowedCallback } from "./config.mjs";
import { EncryptedSessionStore } from "./session-store.mjs";
import { GatewayBackendClient } from "./backend-client.mjs";
import { GatewayRunnerEngine, withTimeout } from "./engine.mjs";
import { verifyGatewayConnectRequest } from "./connect-auth.mjs";
import { HostedSurfaceManager } from "./hosted-surface.mjs";

async function loadProvider(modulePath, env) {
  const specifier = modulePath.startsWith("file:") ? modulePath : pathToFileURL(resolve(modulePath)).href;
  const providerModule = await import(specifier);
  if (typeof providerModule.createProvider !== "function") throw new Error("Gateway provider module must export createProvider().");
  const provider = await providerModule.createProvider({ env });
  for (const method of ["connectInteractive", "listHistoricalReports", "pullCurrentReports"]) {
    if (typeof provider?.[method] !== "function") throw new Error(`Gateway provider is missing ${method}().`);
  }
  return provider;
}

function respond(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": contentType, "cache-control": "no-store" });
  res.end(body);
}

function respondHostedPage(res, html, csp) {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": csp,
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  });
  res.end(html);
}

function authorizedControlRequest(req, token) {
  const authorization = req.headers.authorization ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expectedBytes = Buffer.from(token);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

async function readJsonBody(req, maxBytes = 4096) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("invalid_json");
  }
}

export async function startGatewayRunner(env = process.env) {
  const config = loadRunnerConfig(env);
  const provider = await loadProvider(config.providerModule, env);
  const sessions = new EncryptedSessionStore({
    dir: config.sessionDir,
    key: config.sessionKey,
    idleTtlMs: config.sessionIdleTtlMs,
    gcBatchSize: config.sessionGcBatchSize,
  });
  await sessions.init();
  await sessions.gcIdle();
  const backend = new GatewayBackendClient(config);
  const engine = new GatewayRunnerEngine({ config, backend, provider, sessions });
  const surfaces = new HostedSurfaceManager({ maxSessions: config.connectConcurrency });
  const stop = new AbortController();
  const sessionGc = setInterval(() => {
    sessions.gcIdle().catch(() => {
      console.error("[gateway-runner] Encrypted session cleanup failed.");
    });
  }, config.sessionGcIntervalMs);
  sessionGc.unref?.();
  let workerPoolFatal = false;
  const workers = engine.run(stop.signal).catch(() => {
    workerPoolFatal = true;
    console.error("[gateway-runner] Worker pool stopped unexpectedly.");
  });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (req.method === "POST" && url.pathname === "/control/session/revoke") {
        if (!authorizedControlRequest(req, config.connectToken)) return respond(res, 403, "Unauthorized");
        const payload = await readJsonBody(req).catch(() => null);
        const sessionRef = typeof payload?.sessionRef === "string" ? payload.sessionRef : "";
        if (!/^gw_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionRef)) {
          return respond(res, 400, "Invalid request");
        }
        await sessions.delete(sessionRef);
        return respond(res, 200, JSON.stringify({ ok: true }), "application/json; charset=utf-8");
      }
      if (req.method === "GET" && url.pathname === "/health") {
        const health = engine.health();
        const ok = health.ok && !workerPoolFatal;
        return respond(
          res,
          ok ? 200 : 503,
          JSON.stringify({ ...health, ok, workerPoolFatal }),
          "application/json; charset=utf-8",
        );
      }
      if (await surfaces.handle(req, res, url)) return;
      if (req.method !== "GET" || url.pathname !== "/connect") return respond(res, 404, "Not found");
      const state = url.searchParams.get("state")?.trim();
      const callbackRaw = url.searchParams.get("callback_url")?.trim();
      const expiresAt = url.searchParams.get("expires_at")?.trim();
      const signature = url.searchParams.get("sig")?.trim();
      if (!state || state.length > 256 || !callbackRaw || !expiresAt || !signature) {
        return respond(res, 400, "Invalid Gateway connection request.");
      }
      const callbackUrl = assertAllowedCallback(config, callbackRaw);
      const verified = verifyGatewayConnectRequest({
        secret: config.connectToken,
        state,
        callbackUrl: callbackUrl.toString(),
        expiresAt,
        signature,
      });
      if (!verified.ok) {
        return respond(res, verified.reason === "expired" ? 410 : 403, "Gateway connection request is not authorized.");
      }
      try {
        const hosted = surfaces.create({
          state,
          callbackUrl,
          expiresAt: verified.expiresAt,
          run: async ({ surface, signal }) => {
            try {
              const result = await withTimeout(
                (providerSignal) => provider.connectInteractive({ signal: providerSignal, surface }),
                config.connectTimeoutMs,
                signal,
              );
              if (!result?.session) throw new Error("Gateway sign-in did not produce a session.");
              const sessionRef = await sessions.create(result.session);
              try {
                await backend.callback(callbackUrl, state, sessionRef, signal);
              } catch (error) {
                await sessions.delete(sessionRef);
                throw error;
              }
            } catch (error) {
              await backend.failConnect(state, "gateway_connect_failed").catch(() => undefined);
              throw error;
            }
          },
        });
        return respondHostedPage(res, hosted.html, hosted.csp);
      } catch (error) {
        if (error?.message === "connect_already_active") return respond(res, 409, "Gateway connection is already in progress.");
        if (error?.message === "connect_capacity_reached") return respond(res, 503, "Gateway connection capacity is temporarily full.");
        throw error;
      }
    } catch {
      return respond(res, 502, "Gateway connection could not be completed.");
    }
  });

  server.listen(config.listenPort, config.listenHost);
  const close = async () => {
    clearInterval(sessionGc);
    surfaces.closeAll();
    stop.abort();
    await new Promise((resolve) => server.close(resolve));
    await workers;
  };
  return { config, server, engine, close };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const runner = await startGatewayRunner();
  const shutdown = async () => {
    await runner.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
