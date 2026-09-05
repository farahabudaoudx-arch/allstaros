# Gateway production deployment handoff

The repository side is wired for the real Gateway provider and durable personal report flow. Do not add a product mock, synthetic session reference, or alternate user-facing test path. The application Connect route only uses `GATEWAY_HOSTED_CONNECT_URL`.

## Required deployment order

1. Apply repository migrations through `20260905000100_gateway_runner_hardening.sql` before enabling runner traffic.
2. Provision a dedicated runner host with Node.js and system Google Chrome.
3. Install repository dependencies on the runner host. The provider uses system Chrome, so `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci` is sufficient.
4. Provision a private persistent directory for encrypted runner sessions and a stable 32-byte session encryption key.
5. Configure the runner and web deployment with matching dedicated connect/report bearer tokens.
6. Put the runner behind an HTTPS reverse proxy and expose only the required hosted-connect/health surface.
7. Configure an interactive hosted-browser/live-view surface for the Chrome window opened by `connectInteractive()`. The member must be able to complete Gateway sign-in and any Gateway-requested verification challenge from their own device.
8. Point the application `GATEWAY_HOSTED_CONNECT_URL` at the public runner `/connect` endpoint only after the hosted-browser surface is operational.
9. Start the runner under a process supervisor and verify `/health` before enabling Connect in the application deployment.

## Required web environment

- `GATEWAY_HOSTED_CONNECT_URL` — public HTTPS runner `/connect` URL.
- `GATEWAY_AGENT_CONNECT_TOKEN` — shared only by the web backend and runner callback client.
- `GATEWAY_AGENT_REPORT_TOKEN` — shared only by the web backend and runner report-job client.

## Required runner environment

- `GATEWAY_RUNNER_BACKEND_BASE_URL` — production All Star OS origin.
- `GATEWAY_RUNNER_ALLOWED_CALLBACK_ORIGINS` — production All Star OS origin.
- `GATEWAY_AGENT_CONNECT_TOKEN`
- `GATEWAY_AGENT_REPORT_TOKEN`
- `GATEWAY_RUNNER_SESSION_KEY` — exactly 32 bytes, encoded as base64 or 64 hex characters.
- `GATEWAY_RUNNER_SESSION_DIR` — private persistent host path; keep permissions restricted to the runner account.
- `GATEWAY_RUNNER_PROVIDER_MODULE` — real provider module, normally `gateway-runner/providers/gateway.mjs`.
- `GATEWAY_RUNNER_GATEWAY_CHROME_PATH` when Chrome is not at the macOS default path.
- Optional operational tuning: concurrency, lease duration, polling, request/provider timeouts, and request retries documented in `gateway-runner/README.md`.

## Production invariants

- Never configure `GATEWAY_RUNNER_TEST_MODE=true`.
- Never use the fake provider in a production runner.
- Do not configure `GATEWAY_RUNNER_GATEWAY_LEGACY_PROFILE_DIR` for normal member traffic. That mode exists only for the already-inspected single-host compatibility path and would represent one established browser identity rather than independent member sessions.
- Passwords and verification codes must stay inside the interactive browser flow. The runner persists only encrypted browser storage state and gives All Star OS an opaque `sessionRef`.
- Keep the runner session key stable across restarts. Rotating it without migrating or revoking stored sessions makes existing `sessionRef` values unreadable.
- The web backend owns person identity, job identity, business date, session generation, claim token, and report fencing. The runner must not accept person IDs or business dates from browser query parameters.
- Do not bypass stale-claim responses. A 409 from renew/import/complete is a fencing decision and the worker must stop that job.
- Current reconnect/Monday jobs require exactly WTD, MTD, and YTD before successful completion. Missing reports remain missing; never carry a prior file forward.

## Operational cutover

Keep the existing legacy ingestion process untouched until the dedicated runner is healthy and the first production personal connection has completed a real connect → claim → renew → WTD/MTD/YTD import → complete cycle. After that canary, retire or narrow the legacy process only according to the intended ingestion ownership; do not run two writers for the same personal report path.

The repository cannot supply the external hosted-browser streaming/control service. That is the one infrastructure item the deployment owner must provide before enabling personal Connect for remote members.
