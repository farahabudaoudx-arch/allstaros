# Individual Gateway runner

This directory is the external runner boundary required by Tickets #005/#007. It is intentionally separate from the Next.js web process. All Star OS stores only an opaque `sessionRef`; per-member Gateway HTTP session material stays encrypted on the runner host.

## Production boundary

`server.mjs` exposes `/connect` for the existing `GATEWAY_HOSTED_CONNECT_URL` redirect and runs a bounded report-worker pool. `/connect` accepts only the application's short-lived HMAC-signed connection URL, then serves a token-protected same-origin sign-in form. A provider plug-in performs the actual Gateway interaction. The provider asks only for the current required value (credentials, OTP, or initial phone/email 2FA setup), forwards it over HTTPS to Gateway through `curl_cffi`, and returns explicit report coverage metadata rather than guessing it from acquisition dates or labels.

`providers/gateway.mjs` is the real HTTP-only provider derived from the inspected Gateway flow. Interactive connection asks the member for their Gateway email/password and, when Gateway requests it, the next OTP/setup value. The Node runner passes each one-shot operation to `gateway-http-worker/personal_bridge.py` over child-process stdin; the bridge uses `curl_cffi` for `/api/auth/user/login`, `/api/two-fa/*`, Gateway→StatS handoff, and report acquisition. Passwords and OTP values are discarded after the active step. Only the resulting per-person cookie session is placed inside the runner's AES-GCM encrypted session envelope. Session material is never placed in process arguments, child environment variables, logs, or the application database. The included fake provider remains test-only and the runner refuses to load it unless `GATEWAY_RUNNER_TEST_MODE=true`.

There is no Chrome/CDP/Playwright compatibility mode in the production Gateway runtime. Old encrypted version-1 `storageState` envelopes can still be resumed as cookie sources during migration, but no browser is launched to use them.

The hosted surface is scoped to one signed Gateway connection attempt, requires a separate random per-session bearer token for prompt/status endpoints, and expires with the connect request. Challenge state (cookies, Gateway remember token, and setup phase) stays server-side in memory. The browser receives only the prompt kind/id; credentials and verification codes are transient POST bodies and are not written to the application database, encrypted session envelope, or runner files.

## Required environment

- `GATEWAY_RUNNER_BACKEND_BASE_URL` — All Star OS backend/callback base URL.
- `GATEWAY_RUNNER_ALLOWED_CALLBACK_ORIGINS` — comma-separated callback origins accepted by `/connect`.
- `GATEWAY_AGENT_CONNECT_TOKEN` — connector callback bearer token; server-only.
- `GATEWAY_AGENT_REPORT_TOKEN` — report claim/import/renew/complete bearer token; server-only.
- `GATEWAY_RUNNER_SESSION_KEY` — 32-byte AES key encoded as base64 or 64 hex characters.
- `GATEWAY_RUNNER_SESSION_DIR` — private runner-host directory for encrypted session envelopes.
- `GATEWAY_RUNNER_SESSION_IDLE_TTL_DAYS` — idle retention for encrypted personal sessions; defaults to `30` days (minimum `8`) so weekly active sessions remain available while stale/revoked state ages out.
- `GATEWAY_RUNNER_PROVIDER_MODULE` — absolute/relative module exporting `createProvider()`.

Real provider settings (`providers/gateway.mjs`):

- `GATEWAY_RUNNER_GATEWAY_HTTP_PYTHON` — Python executable used for the private bridge; defaults to `python`.
- `GATEWAY_RUNNER_GATEWAY_HTTP_HELPER_PATH` — optional bridge script override; defaults to the repository `gateway-http-worker/personal_bridge.py`.

Chrome, Playwright, browser-headless flags, browser fallback, legacy profile settings, and shared `GATEWAY_LOGIN_EMAIL` / `GATEWAY_LOGIN_PASSWORD` values are retired from the production runner. The Mac install uses `npm ci --omit=dev`, so the repository's unrelated development browser-test tooling is not installed there.

Operational tuning:

- `GATEWAY_RUNNER_CONCURRENCY` (default/max `4`)
- `GATEWAY_RUNNER_CONNECT_CONCURRENCY` (default `2`, max `4`)
- `GATEWAY_RUNNER_LEASE_SECONDS` (`60..3600`, default `900`)
- `GATEWAY_RUNNER_POLL_INTERVAL_MS` (default `10000`; production minimum `1000`)
- `GATEWAY_RUNNER_REQUEST_TIMEOUT_MS` (default `30000`)
- `GATEWAY_RUNNER_PROVIDER_TIMEOUT_MS` (default `120000`; bounds session validation, not an entire multi-report acquisition)
- `GATEWAY_RUNNER_CONNECT_TIMEOUT_MS` (default `600000`, max `900000`)
- `GATEWAY_RUNNER_REQUEST_RETRIES` (default `3`)
- `GATEWAY_RUNNER_SESSION_GC_INTERVAL_MS` (default `21600000`, six hours)
- `GATEWAY_RUNNER_SESSION_GC_BATCH_SIZE` (default `500`, max `5000` session files per pass)
- `GATEWAY_RUNNER_HOST` / `GATEWAY_RUNNER_PORT`

Testing only:

- `GATEWAY_RUNNER_TEST_MODE=true` — permits accelerated polling and the fake provider.

The normal production Monday cadence remains in All Star OS. Runner polling does not manufacture Monday jobs; it only claims durable jobs already queued by the backend.

The runner E2E acceptance in `e2e.test.mjs` is explicitly a **fake-backend** clock, not application-scheduler integration. Its fake backend releases durable-shaped jobs on configurable millisecond delays and applies the same `(person, pull kind, session generation, business date)` uniqueness key before the real `GatewayRunnerEngine.run()` worker loop can claim them. The fixture advances cycles with distinct canonical Monday business dates, so repeated release of one cycle dedupes while the next cycle remains claimable. It does not weaken `mint_gateway_monday_report_pull_jobs`, add a user-facing date override, or make fast runner polling create production jobs.

For application-scheduler acceptance there is a separate, server-only acceleration gate in `src/lib/gateway/report-pulls.ts`. It is disabled by default and throws if enabled under `NODE_ENV=production`. In a non-production test process, set all of:

- `GATEWAY_REPORT_PULL_TEST_ACCELERATION=true`
- `GATEWAY_REPORT_PULL_TEST_INTERVAL_MS` (`100..3600000`)
- `GATEWAY_REPORT_PULL_TEST_ANCHOR_INSTANT` (ISO instant)
- `GATEWAY_REPORT_PULL_TEST_ANCHOR_BUSINESS_DATE` (an ISO Monday)

The server derives `cycle = floor((now - anchorInstant) / interval)` and advances the configured Monday by exactly seven days per cycle before calling the normal `mint_gateway_monday_report_pull_jobs` RPC. It fails closed before the configured anchor instant. There is no request/query date override. Queue uniqueness, Monday validation, session generation fencing, and service-role authorization remain in the database boundary.

Acceleration changes only the server-derived business date for a cron invocation. It does not install an in-process timer and does not change the production Vercel cron cadence. Fast application-scheduler acceptance must have the test harness invoke the existing authorized cron route at the configured test interval; the request supplies only the cron authorization, never a business date or cycle.

The durable backend contract requires `20260905000100_gateway_runner_hardening.sql` plus the personal artifact/replay additions in `20260914000100_gateway_report_pull_artifacts.sql`. Production deployment must apply the required migrations before hybrid runner traffic is enabled. The repository verification layers cover scheduler behavior, runner claim/fencing behavior, encrypted session callbacks, artifact evidence, and the durable SQL contract independently so failures can be localized without weakening the production path.

## Provider contract

`createProvider()` returns an object with:

- `connectInteractive({signal,surface}) -> {session, verificationWasRequired}`. The implementation owns the HTTP authentication state machine. `surface.prompt()` collects only the next required member value. It must not persist the member password or verification code; only the resulting HTTP cookie session may be returned for encryption.
- optional `validateSession(session,{signal}) -> boolean`.
- `listHistoricalReports(session,{from,through,signal})` for first connect. The result may be `{reports, failures}` so one failed historical export does not discard successful siblings.
- `pullCurrentReports(session,{businessDate,signal})` resolves independent WTD, MTD and YTD outcomes and may return `{reports, failures}`. One failed period does not discard successfully acquired periods.

Each report contains `periodType`, `csvText`, acquisition `reportDate`, optional file/label fields, coverage, and canonical raw-XLSX artifact evidence. Coverage also carries `gatewayReportDate`, the upstream Gateway snapshot/navigation identity used to distinguish multiple WTD, MTD, or YTD artifacts inside one first-connect claim. The runner verifies the XLSX hash and byte count, parses importer CSV from those same bytes, registers the artifact against the fenced personal job, uploads it through a short-lived signed Storage URL, confirms the upload, then imports the report. The signed URL never receives the runner bearer token and is never logged. WTD coverage includes the sidebar's covered month, the explicit `Week N` ordinal, the workbook `File Date` as `weekStart`, and `periodFinal=true` only for the highest `Week N` Gateway exposes inside that exact month. MTD/YTD coverage starts from the workbook `File Date` and ends at that month/year boundary. The acquisition `reportDate` is the durable job business date; `gatewayReportDate` and WTD `weekStart` remain separate source evidence and are never substituted for acquisition time or Scorecard week identity.

On the inspected Mac flow on 2026-09-05, the earlier real provider completed login, session validation, and all three current downloads without upload side effects: WTD 920 rows, MTD 1574 rows, and YTD 2696 rows. The acquisition `reportDate` was `2026-09-05`; WTD resolved to `August Week 4`, covered `2026-08-01` through `2026-08-31`, used workbook `File Date` `2026-08-22` as `weekStart`, and correctly marked `periodFinal=true` even though the Gateway weekly key was `2026-08-28`. MTD started `2026-08-01`; YTD started `2026-01-01`. The HTTP-only provider preserves the same evidence model.

The runner HTTP connect boundary is independently covered by `server.test.mjs`: a successful `/connect` stores provider session material only in the AES-256-GCM encrypted session store and callbacks an opaque `gw_...` reference, while a failed application callback deletes the just-created encrypted session.

The worker renews each claim lease and aborts provider work when lease renewal can no longer prove ownership. Only the backend's explicit `gateway_report_pull_stale` code is treated as a stale fencing result; unrelated HTTP 409 conflicts remain job failures. Current and first-connect report acquisition is not wrapped in one short wall-clock provider timeout: each HTTP export remains individually bounded while the renewable lease is the cross-cutting ownership fence. Current and first-connect pulls persist/import every successful report before completing a partial job as retryable. If a period reports authentication expiry, successful siblings are still committed, only that job's `sessionRef` is deleted, and that person's connection becomes `needs_reconnect`. The runner never carries a prior report forward into a missing period.

Intentional Disconnect and successful reconnect use the existing connect-token trust boundary to POST the old opaque `sessionRef` to the runner-local revocation control endpoint after database fencing succeeds. Revocation is best-effort and bounded so runner downtime does not undo the database state. Independently, session reads refresh the encrypted file's idle timestamp; the runner sweeps expired files at startup and on a bounded periodic cadence. With the default 30-day idle TTL, normal weekly use keeps live sessions warm while a missed revocation cannot retain obsolete Gateway cookies indefinitely once the runner is back online.

## Tunnel development

For a remote test against a local/backend preview, start the backend yourself and expose only that chosen HTTP endpoint through your existing tunnel tooling. Set `GATEWAY_RUNNER_BACKEND_BASE_URL` and `GATEWAY_RUNNER_ALLOWED_CALLBACK_ORIGINS` to the resulting preview origin. This repository does not create tunnels, expose ports, or modify external infrastructure automatically.

## Calendar evidence for Active Directs

WTD providers may supply `coverage.weekStart` as the actual source-documented calendar date (`YYYY-MM-DD`) for that week. The HTTP import field is `gatewayWeekStart`; the importer persists it in the existing audit `summary.gatewayWeekStart`. It is independent of the acquisition/File Date and of the canonical `(covered month, week ordinal)` identity. Do not derive it from the first Monday plus the ordinal. For example, September 2026 week 5 can cover September 28 even when downloaded October 5.

Older scoped reports without that date use covered-month bounds only when those bounds settle six-week window membership. A positive direct whose boundary remains ambiguous blocks the affected Builder calculation unless another documented in-window report already establishes that direct's activity. Producer-only eligibility and unrelated Builders are not blocked by that ambiguity. Reconnect still fetches only current WTD/MTD/YTD; it never manufactures missing weeks or replays history.

The hardening migration includes week-date metadata in deduplication, so unchanged CSV bytes with corrected date evidence create a new current audit. No additional column or RPC argument is required for this metadata.
