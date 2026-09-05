# Gateway / Scorecard hardening acceptance — 2026-09-05

This change includes the accumulated application, runner, and Scorecard corrections reviewed on `dev`. It is not a production Gateway integration sign-off.

## Behavior

- Worker failures and failed completion requests retain a live worker pool with bounded retry/backoff and shutdown. Health exposes worker-pool failures. Provider timeouts bound the worker wait; providers must still honor cancellation to stop their own side effects.
- Reconnect requests only current WTD/MTD/YTD, including after an interrupted first backfill. Historical holes remain holes. Final/current evidence can make a reconnected member eligible without replaying missed Mondays.
- Publication preserves the frozen roster and publishes the eligible subset. The independent verifier rejects duplicate or excluded card rows and verifies the actual prepared artifacts.
- A scoped WTD identity is its covered month plus Gateway week ordinal. File/acquisition dates are metadata, including when a previous month's final report arrives in the next month.
- Active Directs use provider-sourced `coverage.weekStart`, transported as `gatewayWeekStart` and persisted in audit `summary.gatewayWeekStart`. An ordinal never becomes a calendar date by arithmetic. Older scoped reports use month bounds only when those bounds settle the window. An unresolved boundary excludes the affected Builder from automatic publication; it does not block eligible Producers. Manual Builder generation and run verification reject an unresolved count.
- The database dedupe comparison includes provider week-date evidence. Identical bytes with corrected evidence replace the current audit; repeating identical evidence dedupes. Canonical premium rows remain unique.
- Scheduler acceleration is server-only and test-only. The fake-backend E2E exercises real runner HTTP/claim polling; it is separate from application/DEV queue acceptance and does not change production Monday cron semantics.

## Verification

- Full Vitest: **84 files, 817 tests passed** after the final application changes, including real prepare/verifier/artifact generation and Builder-isolation regressions.
- `npm run check`: **exit 0**, zero lint errors, 58 existing warnings.
- Production `npm run build`: **exit 0** on the reviewed application changes.
- Full hardening migration plus the provider-week SQL acceptance ran on DEV **inside BEGIN / ROLLBACK**. It verified missing evidence → A → repeated A → B → A with unchanged CSV bytes, one canonical premium row, impossible-date rejection, and a File Date outside the covered month.
- Post-rollback read-only verification: latest migration `20260904000600`; the period ledger and `claim_token` remain absent; zero synthetic acceptance people or sessions persisted.
- Browser acceptance: **2 passed, 2 failed**. Producer Issued Premium reports unavailable data; Admin Coverage reports `producer_issued_premium.source_kind` missing. The harness retains these application failures.
- Dependency audit (`npm audit --omit=dev`): **zero reported vulnerabilities**. Staged whitespace check passed and the credential-pattern scan found no matches.
- GitNexus reindex completed (10,056 nodes / 18,010 edges). Staged change analysis reported **CRITICAL**, 773 changed symbols across 84 indexed files and 51 affected flows. This is a broad accumulated change set, not a clean impact verdict. The indexer also reported process-discovery budget limits and unresolved cross-language properties; graph analysis is supplementary to the executable tests, not exhaustive proof.

Reproduce the bounded DEV database gate from the repository root:

```powershell
node --env-file=.env.local scripts/verify-gateway-week-evidence.mjs
```

It targets only `oyuqwuvewyntnxfboutd`, uses the configured Supabase Management token without printing it, wraps the migration and SQL assertions in rollback, then checks the schema/data baseline again. Do not run the SQL assertion file on its own.

## Remaining environment prerequisites

`20260905000100_gateway_runner_hardening.sql` is committed for review but has **not been permanently applied to DEV**. The application requires that compatible schema for full browser/API/durable-queue acceptance. Plan its application separately; do not hide missing-column failures or treat rollback testing as a deployment.

A real hosted Gateway browser provider is still required, followed by real login, conditional 2FA, and report-download acceptance. Only the fake provider is included. Tickets #005/#007 remain incomplete for production integration. No production database or Rent-a-Mac operation was part of this acceptance. The previously deferred published-history/disconnect requirements dispute remains deferred.
