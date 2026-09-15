import { Buffer } from "node:buffer";

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function integer(env, name, fallback, min, max) {
  const raw = env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function sessionKey(value) {
  let bytes;
  if (/^[0-9a-fA-F]{64}$/.test(value)) bytes = Buffer.from(value, "hex");
  else bytes = Buffer.from(value, "base64");
  if (bytes.length !== 32) throw new Error("GATEWAY_RUNNER_SESSION_KEY must decode to exactly 32 bytes.");
  return bytes;
}

function httpsOrigin(value, name) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an HTTPS origin.`);
  }
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password ||
    parsed.pathname !== "/" || parsed.search || parsed.hash
  ) {
    throw new Error(`${name} must be an HTTPS origin.`);
  }
  return parsed.origin;
}

export function loadRunnerConfig(env = process.env) {
  const backendBaseUrl = new URL(required(env, "GATEWAY_RUNNER_BACKEND_BASE_URL"));
  const callbackOrigins = new Set(
    required(env, "GATEWAY_RUNNER_ALLOWED_CALLBACK_ORIGINS")
      .split(",")
      .map((value) => new URL(value.trim()).origin),
  );
  const testMode = env.GATEWAY_RUNNER_TEST_MODE === "true";
  const sessionIdleTtlDays = integer(env, "GATEWAY_RUNNER_SESSION_IDLE_TTL_DAYS", 30, 8, 90);
  const providerModule = required(env, "GATEWAY_RUNNER_PROVIDER_MODULE");
  if (providerModule.includes("/providers/fake.mjs") || providerModule.includes("\\providers\\fake.mjs")) {
    if (!testMode) throw new Error("The fake Gateway provider is only allowed in GATEWAY_RUNNER_TEST_MODE.");
  }
  return {
    backendBaseUrl,
    callbackOrigins,
    connectToken: required(env, "GATEWAY_AGENT_CONNECT_TOKEN"),
    reportToken: required(env, "GATEWAY_AGENT_REPORT_TOKEN"),
    artifactUploadOrigin: httpsOrigin(required(env, "GATEWAY_RUNNER_ARTIFACT_UPLOAD_ORIGIN"), "GATEWAY_RUNNER_ARTIFACT_UPLOAD_ORIGIN"),
    sessionKey: sessionKey(required(env, "GATEWAY_RUNNER_SESSION_KEY")),
    sessionDir: required(env, "GATEWAY_RUNNER_SESSION_DIR"),
    sessionIdleTtlMs: sessionIdleTtlDays * 24 * 60 * 60 * 1000,
    sessionGcIntervalMs: integer(
      env,
      "GATEWAY_RUNNER_SESSION_GC_INTERVAL_MS",
      6 * 60 * 60 * 1000,
      testMode ? 50 : 60_000,
      24 * 60 * 60 * 1000,
    ),
    sessionGcBatchSize: integer(env, "GATEWAY_RUNNER_SESSION_GC_BATCH_SIZE", 500, 10, 5000),
    providerModule,
    listenHost: env.GATEWAY_RUNNER_HOST?.trim() || "127.0.0.1",
    listenPort: integer(env, "GATEWAY_RUNNER_PORT", 8788, 1, 65535),
    workerConcurrency: integer(env, "GATEWAY_RUNNER_CONCURRENCY", 4, 1, 4),
    connectConcurrency: integer(env, "GATEWAY_RUNNER_CONNECT_CONCURRENCY", 2, 1, 4),
    leaseSeconds: integer(env, "GATEWAY_RUNNER_LEASE_SECONDS", 900, 60, 3600),
    pollIntervalMs: integer(env, "GATEWAY_RUNNER_POLL_INTERVAL_MS", 10_000, testMode ? 50 : 1_000, 3_600_000),
    requestTimeoutMs: integer(env, "GATEWAY_RUNNER_REQUEST_TIMEOUT_MS", 30_000, 1_000, 300_000),
    providerTimeoutMs: integer(env, "GATEWAY_RUNNER_PROVIDER_TIMEOUT_MS", 120_000, 5_000, 900_000),
    connectTimeoutMs: integer(env, "GATEWAY_RUNNER_CONNECT_TIMEOUT_MS", 600_000, 60_000, 900_000),
    requestRetries: integer(env, "GATEWAY_RUNNER_REQUEST_RETRIES", 3, 0, 5),
    testMode,
  };
}

export function assertAllowedCallback(config, raw) {
  const callback = new URL(raw);
  if (
    !config.callbackOrigins.has(callback.origin) ||
    callback.pathname !== "/api/gateway/connect/callback" ||
    callback.username || callback.password || callback.hash
  ) {
    throw new Error("Gateway callback origin is not allowlisted.");
  }
  return callback;
}
