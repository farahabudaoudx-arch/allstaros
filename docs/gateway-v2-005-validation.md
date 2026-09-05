# Gateway Feature v2 ? Ticket #005 Validation

Date: 2026-09-03
Branch: `feat/gateway-v2-005`
Base: `5b5fedc84e0d1e18e612bd25545039aa3d60ebef` (`origin/dev` after Scorecard #004)

## Scope

Ticket #005 adds a durable, per-person personal Gateway connection lifecycle without changing the production Gateway/Rent-a-Mac ingestion job or storing member Gateway credentials in All Star OS.

Implemented product states:

- never connected
- connecting
- connected
- disconnected
- needs reconnect
- state-store unavailable (fail closed)

## Product behavior

- Adds Gateway to the shared Producer/Builder Settings drawer.
- Adds a dismissible first-open prompt with `Connect Gateway` and `I?ll do it later`.
- Connect, reconnect, and disconnect are available without locking the rest of the app.
- All Star OS does not store Gateway passwords, 2FA codes, or browser cookies.
- 2FA is shown only when the hosted Gateway flow requests it.
- The development-only hosted-login mock is hard-gated to development and never calls the real Gateway.
- Gateway-dependent home values render `Unknown` when the personal connection is not verified.
- Issued Premium hides current values while never-connected/disconnected/unavailable instead of substituting client-book, zero, or stale values.
- Published Scorecard snapshots remain visible and independent of current Gateway connection state.

## Durable state and race safety

Migration: `supabase/migrations/20260903000200_gateway_connections.sql`

The migration adds:

- `gateway_connection`
- `gateway_connect_request`
- service-role-only lifecycle RPCs
- opaque `session_ref`
- monotonic `session_generation`
- immutable `first_connected_at`
- first-connect/backfill marker support for later tickets

Concurrency rules validated:

- only one pending login attempt per person
- a newer attempt cancels an older pending attempt
- starting a reconnect does not destroy a currently valid session
- a late callback after Disconnect cannot reconnect the user
- a stale callback cannot replace a newer reconnect
- a stale worker can invalidate only the exact session generation it verified

No Gateway username, password, OTP/2FA secret, or cookie field is persisted.

## DEV database validation

Target: Supabase Preview DEV project `oyuqwuvewyntnxfboutd`.

- migration `20260903000200` applied successfully
- transactional race smoke returned `gateway-race-smoke-ok`
- race smoke transaction rolled back
- Browser QA rows were removed after validation
- final QA cleanup verified `gateway_connection = 0` and `gateway_connect_request = 0`

No production Gateway/Rent-a-Mac state, credentials, schedules, or live login was touched.

## Browser QA

Validated against the isolated Gateway worktree dev server using Next Webpack mode (Turbopack cannot follow the worktree's external `node_modules` symlink).

Desktop and mobile coverage included:

- first-open never-connected prompt
- `I?ll do it later` dismissal
- app remains usable while disconnected
- Settings displays `Gateway ? Not connected`
- at the time of this historical QA pass, Connect used the isolated hosted-login harness; the current production path no longer contains that route
- normal successful hosted sign-in path
- Gateway-requested 2FA path
- required-code validation on the 2FA path
- successful connection displays `Connected`
- Disconnect changes the product state to `Reconnect`
- intentional Disconnect does not immediately reopen the first-open prompt
- disconnected Issued Premium renders reconnect copy and no stale values
- Producer home IP renders `Unknown` while disconnected
- Builder personal/team IP and writer count render `Unknown` while disconnected
- published Scorecard archive remains accessible
- mobile viewport `390x844`: no horizontal overflow; modal CTAs fit within viewport
- browser console: no warnings/errors observed in the validated flow

## Automated validation

Final results:

- `npm run typecheck` ? PASS
- `npm test` ? PASS, **61 files / 648 tests / 648 passed**
- Gateway-focused tests ? PASS, **16/16**
- `npm run lint` ? PASS with **0 errors / 58 pre-existing warnings**
- changed-file ESLint ? PASS with no new errors
- `git diff --check` ? PASS
- Semgrep scan of changed Gateway/product files ? **0 findings**
- `npx next build --webpack` ? PASS

The default Turbopack build command cannot run in this linked worktree because `node_modules` is a symlink pointing outside Turbopack's filesystem root. The same source compiled, typechecked, prerendered, and finalized successfully with Next's supported Webpack build mode.

## External integration boundary

This section described the state at the time Ticket #005 was originally validated. It is superseded by the 2026-09-05 Gateway production work.

The repository now contains the real external runner contract and Mac/Chrome Gateway provider. Production hosted login requires:

- `GATEWAY_HOSTED_CONNECT_URL`
- `GATEWAY_AGENT_CONNECT_TOKEN`
- `GATEWAY_AGENT_REPORT_TOKEN`
- a trusted runner that returns only an opaque `sessionRef` after real Gateway sign-in succeeds
- the production hosted-browser/live-view infrastructure described in `docs/gateway-production-handoff.md`

The application mock connector has been removed. A member is marked connected only after the authenticated runner callback succeeds.
