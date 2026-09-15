import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (!new Set(["app", "runner"]).has(mode)) {
  console.error("Usage: node deploy/gateway/preflight.mjs <app|runner>");
  process.exit(2);
}

const errors = [];
const notes = [];
const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function value(name) {
  return process.env[name]?.trim() ?? "";
}

function required(name) {
  const current = value(name);
  if (!current || /^REPLACE_WITH_/.test(current) || current.includes("example.com") || current.includes("PROJECT.supabase.co")) {
    errors.push(`${name} is missing or still contains an example value.`);
  }
  return current;
}

function secret(name) {
  const current = required(name);
  if (current && current.length < 32) errors.push(`${name} must be at least 32 characters.`);
  return current;
}

function httpsUrl(name, { exactPath = null, originOnly = false } = {}) {
  const current = required(name);
  if (!current) return null;
  try {
    const url = new URL(current);
    if (url.protocol !== "https:") errors.push(`${name} must use https:// in production.`);
    if (url.username || url.password || url.hash) errors.push(`${name} must not contain credentials or a fragment.`);
    if (exactPath != null && url.pathname !== exactPath) errors.push(`${name} pathname must be exactly ${exactPath}.`);
    if (originOnly && (url.pathname !== "/" || url.search || url.hash)) errors.push(`${name} must be an origin only.`);
    return url;
  } catch {
    errors.push(`${name} is not a valid URL.`);
    return null;
  }
}

function ensureDistinct(entries) {
  const populated = entries.filter(Boolean);
  if (new Set(populated).size !== populated.length) errors.push("Gateway/cron secrets must all be different values.");
}

if (mode === "app") {
  httpsUrl("NEXT_PUBLIC_APP_URL", { originOnly: true });
  httpsUrl("NEXT_PUBLIC_SUPABASE_URL", { originOnly: true });
  required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  required("SUPABASE_SERVICE_ROLE_KEY");
  const hosted = httpsUrl("GATEWAY_HOSTED_CONNECT_URL", { exactPath: "/connect" });
  if (hosted?.search) errors.push("GATEWAY_HOSTED_CONNECT_URL must not contain a query string.");
  const connectToken = secret("GATEWAY_AGENT_CONNECT_TOKEN");
  const reportToken = secret("GATEWAY_AGENT_REPORT_TOKEN");
  const cronSecret = secret("CRON_SECRET");
  ensureDistinct([connectToken, reportToken, cronSecret]);
  required("RESEND_API_KEY");
  required("RESEND_FROM");
  notes.push("Vercel app environment is structurally ready for Gateway production deployment.");
}

if (mode === "runner") {
  const backend = httpsUrl("GATEWAY_RUNNER_BACKEND_BASE_URL", { originOnly: true });
  const publicUrl = httpsUrl("GATEWAY_RUNNER_PUBLIC_URL", { originOnly: true });
  const callbackOriginsRaw = required("GATEWAY_RUNNER_ALLOWED_CALLBACK_ORIGINS");
  const callbackOrigins = callbackOriginsRaw.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (!callbackOrigins.length) errors.push("GATEWAY_RUNNER_ALLOWED_CALLBACK_ORIGINS must contain at least one origin.");
  for (const origin of callbackOrigins) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== "https:" || parsed.origin !== origin.replace(/\/$/, "")) {
        errors.push(`Invalid callback origin: ${origin}`);
      }
    } catch {
      errors.push(`Invalid callback origin: ${origin}`);
    }
  }
  if (backend && !callbackOrigins.includes(backend.origin)) {
    errors.push("GATEWAY_RUNNER_ALLOWED_CALLBACK_ORIGINS must include the backend production origin.");
  }
  if (publicUrl && backend && publicUrl.origin === backend.origin) {
    notes.push("Runner and application use the same origin; verify routing intentionally separates /connect from the app.");
  }

  const connectToken = secret("GATEWAY_AGENT_CONNECT_TOKEN");
  const reportToken = secret("GATEWAY_AGENT_REPORT_TOKEN");
  ensureDistinct([connectToken, reportToken]);
  httpsUrl("GATEWAY_RUNNER_ARTIFACT_UPLOAD_ORIGIN", { originOnly: true });

  const sessionKey = required("GATEWAY_RUNNER_SESSION_KEY");
  if (sessionKey) {
    let decoded;
    if (/^[0-9a-fA-F]{64}$/.test(sessionKey)) decoded = Buffer.from(sessionKey, "hex");
    else {
      try { decoded = Buffer.from(sessionKey, "base64"); } catch { decoded = Buffer.alloc(0); }
    }
    if (decoded.length !== 32) errors.push("GATEWAY_RUNNER_SESSION_KEY must decode to exactly 32 bytes.");
  }

  const sessionDir = required("GATEWAY_RUNNER_SESSION_DIR");
  if (sessionDir && !isAbsolute(sessionDir)) errors.push("GATEWAY_RUNNER_SESSION_DIR must be an absolute path.");

  const providerSetting = required("GATEWAY_RUNNER_PROVIDER_MODULE");
  const provider = providerSetting === "auto"
    ? resolve(repoDir, "gateway-runner/providers/gateway.mjs")
    : providerSetting;
  if (provider && !isAbsolute(provider)) errors.push("GATEWAY_RUNNER_PROVIDER_MODULE must be `auto` or an absolute path in production.");
  if (provider && /providers[\\/]fake\.mjs$/i.test(provider)) errors.push("The fake Gateway provider is forbidden in production.");
  if (provider && !existsSync(provider)) errors.push(`Gateway provider module does not exist: ${provider}`);

  if (value("GATEWAY_RUNNER_GATEWAY_HTTP_ENABLED") === "false") {
    errors.push("GATEWAY_RUNNER_GATEWAY_HTTP_ENABLED=false is no longer supported; the production provider is HTTP-only.");
  }
  const helper = value("GATEWAY_RUNNER_GATEWAY_HTTP_HELPER_PATH") || resolve(repoDir, "gateway-http-worker/personal_bridge.py");
  if (!isAbsolute(helper)) errors.push("GATEWAY_RUNNER_GATEWAY_HTTP_HELPER_PATH must be absolute when configured.");
  if (!existsSync(helper)) errors.push(`Gateway HTTP helper does not exist: ${helper}`);

  secret("GATEWAY_TUNNEL_TOKEN");
  if (value("GATEWAY_RUNNER_TEST_MODE") === "true") errors.push("GATEWAY_RUNNER_TEST_MODE must be unset/false in production.");
  for (const obsolete of [
    "GATEWAY_RUNNER_GATEWAY_CHROME_PATH",
    "GATEWAY_RUNNER_GATEWAY_HEADLESS",
    "GATEWAY_RUNNER_GATEWAY_CONNECT_HEADLESS",
    "GATEWAY_RUNNER_GATEWAY_BROWSER_FALLBACK_ENABLED",
    "GATEWAY_RUNNER_GATEWAY_LEGACY_PROFILE_DIR",
    "GATEWAY_RUNNER_GATEWAY_LEGACY_CDP_PORT",
    "GATEWAY_LOGIN_EMAIL",
    "GATEWAY_LOGIN_PASSWORD",
  ]) {
    if (value(obsolete)) errors.push(`${obsolete} is obsolete in the HTTP-only runner and must be unset.`);
  }
  notes.push("Mac HTTP-only runner environment is structurally ready for production startup.");
}

if (errors.length) {
  console.error("Gateway production preflight FAILED:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

for (const note of notes) console.log(`PASS: ${note}`);
