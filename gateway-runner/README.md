# Individual Gateway runner

This directory is the external runner boundary required by Tickets #005/#007. It is intentionally separate from the Next.js web process. All Star OS stores only an opaque `sessionRef`; provider/browser session material stays encrypted on the runner host.

## Production boundary

`server.mjs` exposes `/connect` for the existing `GATEWAY_HOSTED_CONNECT_URL` redirect and runs a bounded report-worker pool. A provider plug-in performs the actual Gateway interaction. The provider is responsible for requesting/handling 2FA **only when Gateway presents a verification challenge** and for returning explicit report coverage metadata from Gateway rather than guessing it from acquisition dates or labels.

`providers/gateway.mjs` is the real Mac/Chrome provider derived from the inspected Gateway flow. The production-default path opens an isolated system-Chrome context for each personal connection, waits for the member to complete Gateway sign-in and any Gateway-requested OTP, exchanges that authenticated dashboard session for the IP Report session, then stores only Playwright storage state inside the runner's encrypted session envelope. The included fake provider remains test-only and the runner refuses to load it unless `GATEWAY_RUNNER_TEST_MODE=true`.

The inspected Mac also has an **acceptance-only legacy-profile compatibility mode**. When `GATEWAY_RUNNER_GATEWAY_LEGACY_PROFILE_DIR` is set explicitly, the provider launches the host's established Chrome profile with a bounded local CDP port and reuses its existing Gateway/Cloudflare browser state for operator-controlled acceptance. Only in that explicit mode may the provider consume the legacy host's `GATEWAY_LOGIN_EMAIL` / `GATEWAY_LOGIN_PASSWORD` environment values for autofill; they are never serialized into the session envelope, logged, or returned to All Star OS. This compatibility path is not the production personal-login design and must not be used to represent multiple members with one global Gateway identity.

The real provider does **not** implement remote browser streaming. Its interactive Chrome window appears on the runner host. That is sufficient for the inspected Rent-a-Mac acceptance host and for an operator-controlled hosted-browser surface, but it is not by itself a finished internet-facing personal-login UX for members on unrelated devices. Do not claim production personal-login acceptance until the chosen hosted-browser surface lets the connecting member actually interact with that Chrome session.

## Required environment

- `GATEWAY_RUNNER_BACKEND_BASE_URL` — All Star OS backend/callback base URL.
- `GATEWAY_RUNNER_ALLOWED_CALLBACK_ORIGINS` — comma-separated callback origins accepted by `/connect`.
- `GATEWAY_AGENT_CONNECT_TOKEN` — connector callback bearer token; server-only.
- `GATEWAY_AGENT_REPORT_TOKEN` — report claim/import/renew/complete bearer token; server-only.
- `GATEWAY_RUNNER_SESSION_KEY` — 32-byte AES key encoded as base64 or 64 hex characters.
- `GATEWAY_RUNNER_SESSION_DIR` — private runner-host directory for encrypted session envelopes.
- `GATEWAY_RUNNER_PROVIDER_MODULE` — absolute/relative module exporting `createProvider()`.

Real provider settings (`providers/gateway.mjs`):

- `GATEWAY_RUNNER_GATEWAY_CHROME_PATH` — system Chrome executable; defaults to `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- `GATEWAY_RUNNER_GATEWAY_DASHBOARD_URL` — defaults to `https://ww3.familyfirstlife.com/dashboard`.
- `GATEWAY_RUNNER_GATEWAY_STATS_BASE_URL` — defaults to `https://stats.uppatop.com`.
- `GATEWAY_RUNNER_GATEWAY_HEADLESS` — background validate/pull mode; defaults to headless, set `false` only for diagnosis. Interactive `/connect` is always visible.
- `GATEWAY_RUNNER_GATEWAY_LAUNCH_TIMEOUT_MS`, `GATEWAY_RUNNER_GATEWAY_STEP_TIMEOUT_MS`, `GATEWAY_RUNNER_GATEWAY_DOWNLOAD_TIMEOUT_MS` — bounded provider-side browser timeouts.
- `GATEWAY_RUNNER_GATEWAY_LEGACY_PROFILE_DIR` — **acceptance-only** opt-in for the inspected Mac's established Chrome profile. Leave unset for the production-default personal flow.
- `GATEWAY_RUNNER_GATEWAY_LEGACY_CDP_PORT` — local CDP port used only with the acceptance legacy profile; defaults to `9223`.

The provider uses the host's existing Chrome, so install dependencies without downloading a Playwright browser when provisioning the runner host, for example `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci`.

Operational tuning:

- `GATEWAY_RUNNER_CONCURRENCY` (default/max `4`)
- `GATEWAY_RUNNER_LEASE_SECONDS` (`60..3600`, default `900`)
- `GATEWAY_RUNNER_POLL_INTERVAL_MS` (default `10000`; production minimum `1000`)
- `GATEWAY_RUNNER_REQUEST_TIMEOUT_MS` (default `30000`)
- `GATEWAY_RUNNER_PROVIDER_TIMEOUT_MS` (default `120000`)
- `GATEWAY_RUNNER_REQUEST_RETRIES` (default `3`)
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

The durable backend contract requires migration `20260905000100_gateway_runner_hardening.sql`. Production deployment must apply that migration before runner traffic is enabled. The repository verification layers cover scheduler behavior, runner claim/fencing behavior, encrypted session callbacks, and the durable SQL contract independently so failures can be localized without weakening the production path.

## Provider contract

`createProvider()` returns an object with:

- `connectInteractive({signal}) -> {session, verificationWasRequired}`. The implementation owns the hosted browser. It must not persist the member password or verification code. If Gateway asks for 2FA, collect it in the hosted flow and discard it after submission.
- optional `validateSession(session,{signal}) -> boolean`.
- `listHistoricalReports(session,{from,through,signal})` for first connect. It must enumerate available Gateway months from 2026 onward. Historical files before 2026 may be reported but the backend will retain only a skipped audit.
- `pullCurrentReports(session,{businessDate,signal})` returning WTD, MTD and YTD.

Each report contains `periodType`, `csvText`, acquisition `reportDate`, optional file/label fields, and coverage. WTD coverage includes the sidebar's covered month, the explicit `Week N` ordinal, the workbook `File Date` as `weekStart`, and `periodFinal=true` only for the highest `Week N` Gateway exposes inside that exact month. MTD/YTD coverage starts from the workbook `File Date` and ends at that month/year boundary. The acquisition `reportDate` is the durable job business date; Gateway's weekly URL/data key is coverage evidence and is never substituted for acquisition time or Scorecard week identity.

On the inspected Mac flow on 2026-09-05, the real Gateway provider completed login, session validation, and all three current downloads without upload side effects: WTD 920 rows, MTD 1574 rows, and YTD 2696 rows. The acquisition `reportDate` was `2026-09-05`; WTD resolved to `August Week 4`, covered `2026-08-01` through `2026-08-31`, used workbook `File Date` `2026-08-22` as `weekStart`, and correctly marked `periodFinal=true` even though the Gateway weekly key was `2026-08-28`. MTD started `2026-08-01`; YTD started `2026-01-01`. This is why the provider keeps acquisition date, weekly end key, and covered-period metadata separate.

The runner HTTP connect boundary is independently covered by `server.test.mjs`: a successful `/connect` stores provider session material only in the AES-256-GCM encrypted session store and callbacks an opaque `gw_...` reference, while a failed application callback deletes the just-created encrypted session.

The worker renews each claim lease, stops on a stale claim, marks a dead provider session `needs_reconnect`, and never carries a prior report forward into a missing week.

## Tunnel development

For a remote test against a local/backend preview, start the backend yourself and expose only that chosen HTTP endpoint through your existing tunnel tooling. Set `GATEWAY_RUNNER_BACKEND_BASE_URL` and `GATEWAY_RUNNER_ALLOWED_CALLBACK_ORIGINS` to the resulting preview origin. This repository does not create tunnels, expose ports, or modify external infrastructure automatically.

## Calendar evidence for Active Directs

WTD providers may supply `coverage.weekStart` as the actual source-documented calendar date (`YYYY-MM-DD`) for that week. The HTTP import field is `gatewayWeekStart`; the importer persists it in the existing audit `summary.gatewayWeekStart`. It is independent of the acquisition/File Date and of the canonical `(covered month, week ordinal)` identity. Do not derive it from the first Monday plus the ordinal. For example, September 2026 week 5 can cover September 28 even when downloaded October 5.

Older scoped reports without that date use covered-month bounds only when those bounds settle six-week window membership. A positive direct whose boundary remains ambiguous blocks the affected Builder calculation unless another documented in-window report already establishes that direct's activity. Producer-only eligibility and unrelated Builders are not blocked by that ambiguity. Reconnect still fetches only current WTD/MTD/YTD; it never manufactures missing weeks or replays history.

The hardening migration includes week-date metadata in deduplication, so unchanged CSV bytes with corrected date evidence create a new current audit. No additional column or RPC argument is required for this metadata.
