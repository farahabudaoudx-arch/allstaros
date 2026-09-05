import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { loadRunnerConfig, assertAllowedCallback } from "./config.mjs";
import { EncryptedSessionStore } from "./session-store.mjs";
import { GatewayBackendClient } from "./backend-client.mjs";
import { GatewayRunnerEngine, withTimeout } from "./engine.mjs";

async function loadProvider(modulePath) {
  const specifier = modulePath.startsWith("file:") ? modulePath : pathToFileURL(resolve(modulePath)).href;
  const providerModule = await import(specifier);
  if (typeof providerModule.createProvider !== "function") throw new Error("Gateway provider module must export createProvider().");
  const provider = await providerModule.createProvider();
  for (const method of ["connectInteractive", "listHistoricalReports", "pullCurrentReports"]) {
    if (typeof provider?.[method] !== "function") throw new Error(`Gateway provider is missing ${method}().`);
  }
  return provider;
}

function respond(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": contentType, "cache-control": "no-store" });
  res.end(body);
}

export async function startGatewayRunner(env = process.env) {
  const config = loadRunnerConfig(env);
  const provider = await loadProvider(config.providerModule);
  const sessions = new EncryptedSessionStore({ dir: config.sessionDir, key: config.sessionKey });
  await sessions.init();
  const backend = new GatewayBackendClient(config);
  const engine = new GatewayRunnerEngine({ config, backend, provider, sessions });
  const stop = new AbortController();
  let workerPoolFatal = false;
  const workers = engine.run(stop.signal).catch(() => {
    workerPoolFatal = true;
    console.error("[gateway-runner] Worker pool stopped unexpectedly.");
  });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
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
      if (req.method !== "GET" || url.pathname !== "/connect") return respond(res, 404, "Not found");
      const state = url.searchParams.get("state")?.trim();
      const callbackRaw = url.searchParams.get("callback_url")?.trim();
      if (!state || state.length > 256 || !callbackRaw) return respond(res, 400, "Invalid Gateway connection request.");
      const callbackUrl = assertAllowedCallback(config, callbackRaw);
      const result = await withTimeout(
        (signal) => provider.connectInteractive({ signal }),
        config.providerTimeoutMs,
        stop.signal,
      );
      if (!result?.session) return respond(res, 502, "Gateway sign-in did not produce a session.");
      const sessionRef = await sessions.create(result.session);
      try {
        await backend.callback(callbackUrl, state, sessionRef, stop.signal);
      } catch (error) {
        await sessions.delete(sessionRef);
        throw error;
      }
      return respond(
        res,
        200,
        "<!doctype html><meta charset=utf-8><title>Gateway connected</title><p>Gateway is connected. You can close this window and return to All Star OS.</p>",
        "text/html; charset=utf-8",
      );
    } catch {
      return respond(res, 502, "Gateway connection could not be completed.");
    }
  });

  server.listen(config.listenPort, config.listenHost);
  const close = async () => {
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
