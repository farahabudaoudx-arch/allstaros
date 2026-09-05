# Individual Gateway runner

This directory is the external runner boundary required by Tickets #005/#007. It is intentionally separate from the Next.js web process. All Star OS stores only an opaque `sessionRef`; provider/browser session material stays encrypted on the runner host.

## Production boundary

`server.mjs` exposes `/connect` for the existing `GATEWAY_HOSTED_CONNECT_URL` redirect and runs a bounded report-worker pool. A provider plug-in performs the actual Gateway interaction. The provider is responsible for requesting/handling 2FA **only when Gateway presents a verification challenge** and for returning explicit report coverage metadata from Gateway rather than guessing it from acquisition dates or labels.

No Gateway selectors, URLs, credentials, or 2FA details are present in this repository. A real provider module must be supplied after the Gateway/Rent-a-Mac browser flow is inspected. The included fake provider is test-only and the runner refuses to load it unless `GATEWAY_RUNNER_TEST_MODE=true`.

## Required environment

- `GATEWAY_RUNNER_BACKEND_BASE_URL` — All Star OS backend/callback base URL.
- `GATEWAY_RUNNER_ALLOWED_CALLBACK_ORIGINS` — comma-separated callback origins accepted by `/connect`.
- `GATEWAY_AGENT_CONNECT_TOKEN` — connector callback bearer token; server-only.
- `GATEWAY_AGENT_REPORT_TOKEN` — report claim/import/renew/complete bearer token; server-only.
- `GATEWAY_RUNNER_SESSION_KEY` — 32-byte AES key encoded as base64 or 64 hex characters.
- `GATEWAY_RUNNER_SESSION_DIR` — private runner-host directory for encrypted session envelopes.
- `GATEWAY_RUNNER_PROVIDER_MODULE` — absolute/relative module exporting `createProvider()`.

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

Acceptance is deliberately split into three layers: `report-pulls.test.ts` covers the application scheduler and mocked RPC boundary; `e2e.test.mjs` covers the runner against a fake backend while exercising the real claim loop; and real DEV durable-queue/claim acceptance requires the Gateway hardening schema. If DEV has not applied that schema, the first two layers can pass while the third remains explicitly schema-blocked.

## Provider contract

`createProvider()` returns an object with:

- `connectInteractive({signal}) -> {session, verificationWasRequired}`. The implementation owns the hosted browser. It must not persist the member password or verification code. If Gateway asks for 2FA, collect it in the hosted flow and discard it after submission.
- optional `validateSession(session,{signal}) -> boolean`.
- `listHistoricalReports(session,{from,through,signal})` for first connect. It must enumerate available Gateway months from 2026 onward. Historical files before 2026 may be reported but the backend will retain only a skipped audit.
- `pullCurrentReports(session,{businessDate,signal})` returning WTD, MTD and YTD.

Each report contains `periodType`, `csvText`, acquisition `reportDate`, optional file/label fields, and coverage. WTD coverage must include canonical month start/end, Gateway week ordinal, and whether it is the period-final Gateway week. MTD/YTD coverage identifies the actual month/year covered. `reportDate` is never used as Scorecard week identity.

The worker renews each claim lease, stops on a stale claim, marks a dead provider session `needs_reconnect`, and never carries a prior report forward into a missing week.

## Tunnel development

For a remote test against a local/backend preview, start the backend yourself and expose only that chosen HTTP endpoint through your existing tunnel tooling. Set `GATEWAY_RUNNER_BACKEND_BASE_URL` and `GATEWAY_RUNNER_ALLOWED_CALLBACK_ORIGINS` to the resulting preview origin. This repository does not create tunnels, expose ports, or modify external infrastructure automatically.

## Calendar evidence for Active Directs

WTD providers may supply `coverage.weekStart` as the actual source-documented calendar date (`YYYY-MM-DD`) for that week. The HTTP import field is `gatewayWeekStart`; the importer persists it in the existing audit `summary.gatewayWeekStart`. It is independent of the acquisition/File Date and of the canonical `(covered month, week ordinal)` identity. Do not derive it from the first Monday plus the ordinal. For example, September 2026 week 5 can cover September 28 even when downloaded October 5.

Older scoped reports without that date use covered-month bounds only when those bounds settle six-week window membership. A positive direct whose boundary remains ambiguous blocks the affected Builder calculation unless another documented in-window report already establishes that direct's activity. Producer-only eligibility and unrelated Builders are not blocked by that ambiguity. Reconnect still fetches only current WTD/MTD/YTD; it never manufactures missing weeks or replays history.

The hardening migration includes week-date metadata in deduplication, so unchanged CSV bytes with corrected date evidence create a new current audit. No additional column or RPC argument is required for this metadata.
