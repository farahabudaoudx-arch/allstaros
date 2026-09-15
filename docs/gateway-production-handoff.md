# Gateway production deployment handoff

The repository side is wired for the real Gateway provider and durable **per-person** report flow. Each AllStarOS member has their own Gateway session. Do not introduce a shared agency Gateway identity, product mock, synthetic session reference, or alternate user-facing test path. The application Connect route only uses `GATEWAY_HOSTED_CONNECT_URL`.

## Required deployment order

1. Apply repository migrations through `20260914000100_gateway_report_pull_artifacts.sql` before enabling the HTTP-first runner traffic.
2. Provision the dedicated Gateway Mac with Node.js, Python 3, and `cloudflared`. Chrome/Playwright are not Gateway runtime dependencies.
3. Install with `deploy/gateway/install-macos.sh`. It installs lockfile production Node dependencies plus an isolated Python venv for `curl_cffi`/XLSX validation.
4. Provision a private persistent directory for encrypted runner sessions and a stable 32-byte session encryption key.
5. Configure the runner and web deployment with matching dedicated connect/report bearer tokens.
6. Put the runner behind an HTTPS reverse proxy and expose only the required hosted-connect/health surface.
7. Verify the runner's signed `/connect` surface can accept per-member Gateway email/password and, only when Gateway requests it, OTP/2FA setup values. Those values terminate at the runner and are never posted to the All Star OS backend.
8. Point the application `GATEWAY_HOSTED_CONNECT_URL` at the public runner `/connect` endpoint after the HTTP-only Connect surface is operational.
9. Run the runner and tunnel as system **LaunchDaemons** under the dedicated non-root runtime account, then verify `/health` before enabling Connect in the application deployment.

## Required web environment

- `GATEWAY_HOSTED_CONNECT_URL` — public HTTPS runner `/connect` URL.
- `GATEWAY_AGENT_CONNECT_TOKEN` — shared only by the web backend and runner callback client.
- `GATEWAY_AGENT_REPORT_TOKEN` — shared only by the web backend and runner report-job client.

## Required runner environment

- `GATEWAY_RUNNER_BACKEND_BASE_URL` — production All Star OS origin.
- `GATEWAY_RUNNER_ALLOWED_CALLBACK_ORIGINS` — production All Star OS origin.
- `GATEWAY_AGENT_CONNECT_TOKEN`
- `GATEWAY_AGENT_REPORT_TOKEN`
- `GATEWAY_RUNNER_ARTIFACT_UPLOAD_ORIGIN` — exact HTTPS Supabase project origin; signed raw-XLSX uploads to any other host are rejected by the runner.
- `GATEWAY_RUNNER_SESSION_KEY` — exactly 32 bytes, encoded as base64 or 64 hex characters.
- `GATEWAY_RUNNER_SESSION_DIR` — private persistent host path; keep permissions restricted to the runner account.
- `GATEWAY_RUNNER_PROVIDER_MODULE` — real provider module, normally `gateway-runner/providers/gateway.mjs`.
- `GATEWAY_RUNNER_GATEWAY_HTTP_PYTHON` / `GATEWAY_RUNNER_GATEWAY_HTTP_HELPER_PATH` only when overriding installer defaults.
- Optional operational tuning: concurrency, lease duration, polling, request/provider timeouts, and request retries documented in `gateway-runner/README.md`.

## Production invariants

- Never configure `GATEWAY_RUNNER_TEST_MODE=true`.
- Never use the fake provider in a production runner.
- Never configure a shared production `GATEWAY_LOGIN_EMAIL` or `GATEWAY_LOGIN_PASSWORD`. Interactive Gateway authentication is per member and credentials are supplied only inside that member's short-lived signed Connect session.
- Do not configure retired Chrome/headless/browser-fallback/legacy-profile variables. The production provider is HTTP-only.
- Passwords and verification codes are transient request values only. The runner persists only encrypted per-member HTTP session state and gives All Star OS an opaque `sessionRef`.
- Keep the runner session key stable across restarts. Rotating it without migrating or revoking stored sessions makes existing `sessionRef` values unreadable.
- The web backend owns person identity, job identity, business date, session generation, claim token, and report fencing. The runner must not accept person IDs or business dates from browser query parameters.
- Do not bypass stale-claim fencing. Only the explicit `gateway_report_pull_stale` response means the runner has lost job ownership. Other deterministic conflicts (for example conflicting immutable XLSX evidence) are failures to surface, not permission to silently abandon a still-owned job.
- Current reconnect/Monday jobs require exactly WTD, MTD, and YTD before successful completion. Missing reports remain missing; never carry a prior file forward.
- A first-connect historical pull also preserves already-validated artifacts if a sibling acquisition fails. The personal job is retried/reconnected as appropriate instead of declaring an incomplete history successful.
- Raw XLSX is canonical evidence for the HTTP provider. The private `gateway-report-evidence` bucket is job/person/claim fenced; application business rows remain `source_kind='personal_gateway'`.
- Claim POST retry is replay-safe through a stable request UUID. Reusing the same claim request can never claim a second job after a commit-then-timeout.

## Operational cutover

Focused verification must cover per-member email/password login, existing-2FA OTP, first-time 2FA setup, Gateway→StatS handoff, WTD/MTD/YTD identity and File Date/schema checks, exact-NPN behavior, retry/idempotency including commit-then-timeout, one-period failure, lease fencing, and Mac reboot/LaunchDaemon recovery. There is no fixed multi-day validation window and no minimum sync-count gate.

There is no external browser-streaming/control dependency. The stable HTTPS runner hostname serves the complete signed Connect form and the HTTP worker performs both authentication and report acquisition.
