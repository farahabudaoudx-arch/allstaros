# Gateway / Scorecard production readiness — 2026-09-05

> Historical validation record. Its Chrome/hosted-browser deployment notes are superseded by the current HTTP-only runner in `docs/gateway-production-handoff.md`; keep the dated test evidence below as historical evidence only.

This change includes the accumulated application, runner, Gateway provider, and Scorecard corrections intended for the production deployment path. The web application no longer contains a Gateway hosted-login mock route; production Connect always targets the configured hosted runner.

## Behavior

- Worker failures and failed completion requests retain a live worker pool with bounded retry/backoff and shutdown. Health exposes worker-pool failures. Provider timeouts bound the worker wait; providers must still honor cancellation to stop their own side effects.
- Reconnect requests only current WTD/MTD/YTD, including after an interrupted first backfill. Historical holes remain holes. Final/current evidence can make a reconnected member eligible without replaying missed Mondays.
- Publication preserves the frozen roster and publishes the eligible subset. The independent verifier rejects duplicate or excluded card rows and verifies the actual prepared artifacts.
- A scoped WTD identity is its covered month plus Gateway week ordinal. File/acquisition dates are metadata, including when a previous month's final report arrives in the next month.
- Active Directs use provider-sourced `coverage.weekStart`, transported as `gatewayWeekStart` and persisted in audit `summary.gatewayWeekStart`. An ordinal never becomes a calendar date by arithmetic. Older scoped reports use month bounds only when those bounds settle the window. An unresolved boundary excludes the affected Builder from automatic publication; it does not block eligible Producers. Manual Builder generation and run verification reject an unresolved count.
- The database dedupe comparison includes provider week-date evidence. Identical bytes with corrected evidence replace the current audit; repeating identical evidence dedupes. Canonical premium rows remain unique.
- Production Monday scheduling remains server-derived and database-fenced. Runner polling only claims jobs already created by the backend and cannot manufacture report dates.

## Verification

- Full Vitest: **87 files, 829 tests passed** after the real Gateway provider and production connect-route acceptance additions, including encrypted sessionRef callback coverage, real prepare/verifier/artifact generation, Builder-isolation regressions, and provider evidence/parser regressions.
- `npm run check`: **exit 0**, zero lint errors, 58 existing warnings.
- Production `npm run build`: **exit 0** on the reviewed application changes.
- Full hardening migration plus both provider-week and durable-runner SQL acceptance ran transactionally. The durable gate exercised synthetic reconnect enqueue → claim token → lease renew → stale-token rejection → WTD/MTD/YTD import → completion, then proved the claim fence was cleared and the connection was verified.
- Migration `20260905000100_gateway_runner_hardening.sql` is now permanently applied to project `oyuqwuvewyntnxfboutd` with migration-ledger version `20260905000100`. Read-only verification confirmed `gateway_report_pull_job.claim_token`, `producer_issued_premium.source_kind`, and the lease-renew RPC are present.
- The real Mac provider completed login, session validation, and current WTD/MTD/YTD download with 920 / 1574 / 2696 rows and canonical coverage metadata.
- Dependency audit (`npm audit --omit=dev`): **zero reported vulnerabilities**. Staged whitespace check passed and the credential-pattern scan found no matches.
- GitNexus reindex completed (10,056 nodes / 18,010 edges). Staged change analysis reported **CRITICAL**, 773 changed symbols across 84 indexed files and 51 affected flows. This is a broad accumulated change set, not a clean impact verdict. The indexer also reported process-discovery budget limits and unresolved cross-language properties; graph analysis is supplementary to the executable tests, not exhaustive proof.

Reproduce the bounded DEV database gate from the repository root:

```powershell
node --env-file=.env.local scripts/verify-gateway-week-evidence.mjs
```

The broader durable gate is:

```powershell
node --env-file=.env.local scripts/verify-gateway-runner-dev.mjs
```

Both gates target only `oyuqwuvewyntnxfboutd`, use the configured Supabase Management token without printing it, wrap the migration and SQL assertions in rollback, then check the schema/data baseline again. Do not run the SQL assertion files on their own.

## Production deployment prerequisites

The remaining work is infrastructure rather than application fallback behavior: deploy the runner behind HTTPS, configure the production callback/report tokens and encrypted session directory, and provide an interactive hosted-browser surface so a member on another device can operate the Chrome session opened on the runner host. The legacy-profile compatibility mode must remain disabled for normal production members. See `docs/gateway-production-handoff.md`.
