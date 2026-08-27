# SENTRY HANDOFF

Audit date: 2026-08-17  
Application: All Star OS  
Sentry organization: `systamazing`  
Sentry project: `javascript-nextjs` (project ID `4511554268692480`)  
Application stack: Next.js 16.2.6, React 19.2.4, Supabase/Postgres, Sentry 10.57.0, PostHog 1.386.6

## Purpose

This document is the engineering handoff for every distinct error group found in Sentry during the audit. It explains:

- what Sentry recorded;
- what a user is likely to see;
- what is confirmed versus inferred;
- where the relevant code lives;
- how to reproduce and diagnose each problem;
- what should be fixed, filtered, or monitored;
- how to prove the work is complete.

No production code or database schema was changed as part of this audit.

## Audit Scope and Limitations

The Sentry issue feed was reviewed with `level:error` over 14-day, 30-day, and 90-day windows.

- 14 days contained 10 distinct error groups.
- 30 and 90 days contained 11 distinct error groups.
- The oldest visible issue was first seen approximately two months before the audit, so the 90-day result appears to cover the project's known Sentry history.
- Sentry's attempted all-time URL returned to the 14-day view. Therefore, "all errors" in this document means all 11 distinct groups visible in the 90-day audit, not an independently verified unlimited-retention export.
- Event totals are Sentry's displayed grouped counts. The `1.7K` value is rounded.
- Sentry reports `0 users` for these groups. That does **not** mean no users were affected. The application intentionally configures `sendDefaultPii: false`, so Sentry is not attaching user identity or IP information.
- Several browser stacks are minified because production source-map upload does not appear to be configured in `next.config.ts`. Those issues cannot be assigned to an exact application source line yet.

## Executive Summary

There are four different classes of findings:

1. **Active application/database reliability problem:** Postgres statement timeouts affecting producer pages and metrics. This is the top priority.
2. **Potential application defects requiring better evidence:** a read-only-array mutation and an older "unexpected response" failure around the tracker flow.
3. **Deployment-version mismatch:** an old browser page called a Server Action that no longer existed after a deployment.
4. **Third-party, extension, or injected-script noise:** MetaMask, PostHog recorder, obfuscated scripts, and two very high-volume `M_ID` groups.

The most important operational finding is not just one slow query. Loading `/producer` starts multiple overlapping database workloads:

- The producer layout performs an unread-message calculation before rendering any producer page.
- The dashboard then starts three metrics requests from three client components.
- Two of those metrics requests are identical month-to-date requests.
- Each dashboard metrics request loads every client row for the producer and filters the date range in JavaScript.
- The unread calculation loads a broad set of visible builder-channel messages and reduces them to two booleans in JavaScript.
- Analytics similarly loads all client rows and all lead-purchase rows before date filtering in JavaScript.

This combination creates query amplification and makes response time grow with account history and downline/message volume.

## Priority and Disposition

| Priority | Sentry groups | Disposition | Reason |
| --- | --- | --- | --- |
| P0/P1 | `JAVASCRIPT-NEXTJS-D`, `H`, `E` | Fix and validate immediately | Active database timeouts and producer render failures |
| P2 | `JAVASCRIPT-NEXTJS-3` | Reproduce and investigate | High historical volume; tracker/server response could fail visibly |
| P2 | `JAVASCRIPT-NEXTJS-C` | Diagnose after source maps | Possible first-party mutation bug; exact source is hidden |
| P3 | `JAVASCRIPT-NEXTJS-7` | Add version-skew protection/monitoring | Low count but a real failed user action |
| P4 | `JAVASCRIPT-NEXTJS-F`, `J`, `6`, `G`, `B` | Filter narrowly, then archive | Strong signs of extension, recorder, or injected-script noise |

## Complete Issue Register

| Sentry ID | Events | First/last seen at audit | Route or transaction | Plain-English meaning | Likely user impact | Confidence / disposition |
| --- | ---: | --- | --- | --- | --- | --- |
| [`JAVASCRIPT-NEXTJS-F`](https://systamazing.sentry.io/issues/7666985208/) | 1.7K | 6d / 2h | `/producer/analytics` | A script tried to read `M_ID` from a missing object. | Probably none; likely background/injected code. | Medium-high noise confidence; filter only by message plus stack source. |
| [`JAVASCRIPT-NEXTJS-J`](https://systamazing.sentry.io/issues/7676791603/) | 75 | 9h / 9h | `/producer/clients` | Same `M_ID` failure as above. | Probably none; potentially noisy console/Sentry traffic only. | Medium-high noise confidence; same fingerprint/filter as `F`. |
| [`JAVASCRIPT-NEXTJS-D`](https://systamazing.sentry.io/issues/7657749372/) | 28 | 11d / 2h | `GET /producer` | Postgres stopped a query because it exceeded the statement time limit. | Slow or incomplete producer dashboard; raw database error may appear in dashboard widgets. | Confirmed database failure; exact SQL still needs Postgres evidence. |
| [`JAVASCRIPT-NEXTJS-H`](https://systamazing.sentry.io/issues/7670771517/) | 9 | 4d / 2h | `GET /producer` | Same database timeout, in a separate Sentry grouping. | Same as `D`; seen primarily in Mobile Safari 26.6 in the reviewed event. | Confirmed database failure; likely same workload family as `D`. |
| [`JAVASCRIPT-NEXTJS-E`](https://systamazing.sentry.io/issues/7657749398/) | 12 | 11d / 2h | `/producer` | A Server Component render failed; production hides the original message. | Whole route or route segment can show a generic error/failed render rather than the producer page. | Confirmed render failure; likely downstream companion to server/database failure, but not proven identical. |
| [`JAVASCRIPT-NEXTJS-C`](https://systamazing.sentry.io/issues/7634502989/) | 3 | 22d / 6h | `/` | Code tried to call `push` on an array that had been frozen/read-only. | A component or navigation on the home route may stop working or crash. | Unknown first-party status; source maps required. |
| [`JAVASCRIPT-NEXTJS-6`](https://systamazing.sentry.io/issues/7579341441/) | 18 | 2mo / 11h | `/producer` | A page script tried to connect to MetaMask, but the extension was unavailable. | Usually none in this app; All Star OS has no wallet flow. | High confidence extension noise. |
| [`JAVASCRIPT-NEXTJS-3`](https://systamazing.sentry.io/issues/7553998836/) | 205 | 2mo / 10d | Sentry transaction `/auth/signin`; breadcrumb/request around `/producer/tracker` | The browser received a server response that Next.js did not expect for the operation in progress. | Tracker load/save or post-sign-in navigation may fail until retry/refresh. | Real historical signal, but exact current cause is unknown. |
| [`JAVASCRIPT-NEXTJS-G`](https://systamazing.sentry.io/issues/7670570297/) | 1 | 4d / 4d | `/producer/resources/carrier-contacts` | PostHog's session recorder tried to inspect a cross-origin iframe and the browser blocked it. | None expected; browser security behaved correctly. | High confidence PostHog recorder noise. |
| [`JAVASCRIPT-NEXTJS-7`](https://systamazing.sentry.io/issues/7579342255/) | 2 | 2mo / 11d | `/auth/confirm` | The browser submitted a Server Action ID from an older build that the current server no longer knew. | Clicking Continue/confirm can fail until the page is refreshed or the link is reopened. | High confidence deployment version skew. |
| [`JAVASCRIPT-NEXTJS-B`](https://systamazing.sentry.io/issues/7633403840/) | 1 | 23d / 23d | `/auth/signin` | An obfuscated script referenced a generated variable that did not exist. | Probably none; likely injected browser code. | Medium-high confidence noise; no matching symbol exists in the repository. |

## Finding 1: Producer Database Timeouts

### Sentry evidence

Relevant groups:

- `JAVASCRIPT-NEXTJS-D`: `Error: canceling statement due to statement timeout`, 28 events, ongoing, `GET /producer`.
- `JAVASCRIPT-NEXTJS-H`: same database message, 9 events, ongoing, `GET /producer`.
- `JAVASCRIPT-NEXTJS-E`: generic Server Components render error, 12 events, ongoing, `/producer`.

The reviewed timeout events contained Supabase/PostgREST breadcrumbs involving `recruit`, `message_read`, and `message`, including builder-channel message filtering. This makes the unread-message path a strong performance suspect. The evidence does **not** identify one exact SQL statement with certainty.

### What users can see

Depending on where the timeout occurs, a user may experience one or more of the following:

- `/producer` takes a long time to become usable.
- The producer route fails to render and falls back to a generic Next.js error experience.
- "Activity Dashboard" shows a dash and the raw text `canceling statement due to statement timeout`.
- "Today" or monthly-goal sections show the same raw database message below the panel.
- Analytics displays the raw database message beside the page title and leaves metrics at zero/empty values.
- Navigation between any producer pages feels slow because the unread calculation runs in the shared producer layout.

Raw database messages reach users because the API routes return `err.message`, and client components display that value directly.

### Confirmed code paths

#### A. Shared producer layout blocks on unread state

`src/app/producer/layout.tsx:75` awaits `getProducerUnread(person.id)` before rendering the producer shell. This means the workload runs for every page below `/producer`, not only messaging pages.

`src/lib/producer/unread.ts:20-30` starts three requests:

- the current person's recruit row;
- all of that person's read receipts;
- all visible, non-AI, builder-channel messages not sent by that person, ordered newest first.

`src/lib/producer/unread.ts:41-47` then scans the returned message rows in JavaScript to answer only two yes/no questions: whether the upline thread is unread and whether any team thread is unread.

Important nuance: this function currently ignores Supabase response errors, so it may silently return `false/false` after a timeout instead of throwing. It is a confirmed inefficient and blocking path, but it is **not yet proven** to be the direct source of the unhandled Sentry timeout.

#### B. `/producer` launches duplicate metrics work

On initial dashboard load:

- `TodaySnapshot` requests dashboard metrics for `range=today`.
- `ProducerGoals` requests dashboard metrics for `range=mtd`.
- `DashboardOverview` also requests dashboard metrics for `range=mtd`.

The two month-to-date calls are duplicate requests. All three can run close together after hydration.

#### C. Each dashboard metrics call loads all client history

`src/lib/producer/metrics.ts:240-243` correctly bounds tracker rows by date, but fetches `clients` only by `person_id` with no date constraint.

`src/lib/producer/metrics.ts:265-275` computes sale and issue dates and filters rows in JavaScript. As the client book grows, every metrics request transfers and processes increasing history even for "today."

#### D. Analytics repeats the unbounded pattern

`src/lib/producer/metrics.ts:351-356` loads:

- tracker rows within range;
- all clients for the person;
- deposits within a broad timestamp window;
- all lead purchases for the person.

`src/lib/producer/metrics.ts:362-397` then date-filters client and lead-purchase data in JavaScript.

#### E. RLS can magnify message-query cost

The `message` RLS policy calls `can_view_recruit(recruit_id)` for visible rows. That helper delegates to `can_view`, which walks the person/downline tree with a recursive CTE. The broad message query does not provide explicit recruit IDs, so the database may need to evaluate visibility across many candidate rows. This must be confirmed with the production query plan.

### Existing indexes

Relevant indexes already present in migrations:

- `recruit.person_id` has a unique constraint and therefore an index.
- `message(recruit_id, created_at)` exists.
- `message_read(person_id, recruit_id)` is the primary key and covers lookups by `person_id`.
- `tracker_entry(person_id, entry_date desc)` exists.
- `clients(person_id, updated_at desc)`, `clients(person_id, sale_status)`, and `clients(person_id, created_at desc)` exist.
- `lead_purchases(person_id, purchase_date desc)` exists.

There is no index tailored to "builder channel, non-AI messages by recruit and newest timestamp." However, adding an index before rewriting the broad query may not solve the core issue. The query should first stop requesting all matching rows.

### Root-cause confidence

- **High confidence:** Postgres statement timeouts are real and ongoing.
- **High confidence:** `/producer` creates duplicate metrics calls and performs unbounded historical client reads.
- **High confidence:** unread calculation is broad, blocks the shared layout, and reduces many rows to two booleans.
- **Medium confidence:** unread/message RLS is one of the statements timing out; Sentry breadcrumbs point there, but no query plan or Postgres log line was captured in this audit.
- **Medium confidence:** the Server Components error is caused by the same database incident; timing and route match, but the generic production error hides its original cause.

### Required diagnosis before final SQL changes

The developer should collect production-like evidence for each candidate query:

1. Use Supabase Query Performance / `pg_stat_statements` to identify statements with high total and mean execution time involving `message`, `clients`, `lead_purchases`, `tracker_entry`, and RLS helper functions.
2. Record representative row counts for a normal producer, a large producer, and an owner/builder with a large downline.
3. Run `EXPLAIN (ANALYZE, BUFFERS)` in a safe non-production environment with comparable data. Use plain `EXPLAIN` first if the statement currently times out.
4. Compare query plans as the authenticated producer, builder, and owner because RLS visibility differs.
5. Confirm which exact request produces the timeout by adding route/query-phase tags to server-side Sentry capture.

Supabase references:

- [Query optimization](https://supabase.com/docs/guides/database/query-optimization)
- [Debugging performance issues](https://supabase.com/docs/guides/database/debugging-performance)
- [Database debugging and monitoring](https://supabase.com/docs/guides/database/inspect)

### Recommended implementation

#### 1. Consolidate dashboard metrics requests

Fetch dashboard data once per range and share it between `TodaySnapshot`, `ProducerGoals`, and `DashboardOverview`, or use one deduplicating client cache keyed by the complete metrics URL. At minimum, the two identical MTD requests must collapse to one request.

Consider a single dashboard bootstrap endpoint that returns:

- today's metrics;
- month-to-date metrics;
- goal;
- projection.

This reduces connection/query pressure and makes loading/error behavior consistent.

#### 2. Move aggregation and date filtering into Postgres

Do not load all client and lead-purchase history for narrow ranges. The durable design is a database query or RPC that returns the aggregate result needed by the UI.

The current sale date has fallback semantics (`submit_date`, then `date`, then timezone-adjusted `created_at`). Preserve those semantics exactly. Options include:

- a carefully written SQL aggregation function;
- a normalized effective sale-date field maintained on write;
- bounded queries for each date source followed by deduplication, as an interim fix.

Similarly, lead spend should be bounded using `purchase_date` with the existing `created_at` fallback instead of fetching all rows.

Any new function must preserve RLS and authorization. Prefer `SECURITY INVOKER` where possible. Do not add a public `SECURITY DEFINER` function merely to bypass a permission problem.

#### 3. Replace unread row retrieval with existence checks

Return the two booleans from the database rather than returning message rows to JavaScript. A good implementation should:

- determine the user's own recruit thread;
- determine visible/downline thread IDs once;
- use `EXISTS`/`LIMIT 1` for messages newer than each thread's read receipt;
- stop as soon as upline/team unread state is known;
- preserve current RLS behavior for self, downline, and owner access;
- define deliberate behavior when the query fails instead of silently reporting no unread messages.

After the query is shaped around explicit recruit IDs, evaluate a partial index such as a builder-channel/non-AI index on `(recruit_id, created_at desc)`. Create it only after `EXPLAIN` shows it improves the actual plan.

#### 4. Do not expose database internals to users

API routes should capture the detailed exception server-side and return a stable message such as:

`We couldn't load your activity right now. Please try again.`

Include structured Sentry context server-side:

- route name;
- range key;
- query phase (`tracker`, `clients`, `deposits`, `lead_purchases`, `unread`);
- target role type, but no client PII;
- release/deployment identifier.

#### 5. Add a producer-level error boundary

Only `src/app/producer/clients/error.tsx` exists under the producer tree. Add an error boundary at the appropriate producer segment so an unexpected Server Component failure gives the user a clear retry path instead of an opaque framework failure. This is resilience, not a substitute for fixing the query.

### Acceptance criteria

- One `/producer` page load does not issue duplicate requests for the same range and person.
- Dashboard and analytics responses match current calculations for `today`, WTD, MTD, YTD, all-time, and custom ranges.
- Date-boundary tests cover at least UTC, America/Chicago, America/Los_Angeles, and a timezone east of UTC.
- Unread-state tests cover: no messages, no receipt, fully read, unread upline, unread team, both unread, self-sent messages, AI messages, and unauthorized threads.
- RLS tests prove a producer cannot read another branch's messages or metrics.
- Representative large-account tests complete without a statement timeout.
- Recommended service target: metrics endpoint p95 under 1.5 seconds and p99 under 3 seconds on representative production-sized data.
- The UI never displays raw Postgres/Supabase error text.
- Sentry receives one server-side event with route/query-phase context when a forced database failure is introduced in staging.
- No new `D`, `H`, or `E` events occur for 72 hours after production rollout under normal traffic.

## Finding 2: Tracker "Unexpected Response"

### Sentry evidence

`JAVASCRIPT-NEXTJS-3` recorded 205 events. It was first seen about two months before the audit and last seen 10 days before the audit. The reviewed event included a `/producer/tracker` request/breadcrumb with HTTP 200, while Sentry grouped the transaction under `/auth/signin`.

### Plain-English meaning and user impact

Next.js received a response that did not match what the browser expected for the operation. A user could have seen tracker data fail to load/save, navigation appear stuck, or an action work only after refresh.

The event is not currently active in the last 10 days, so it may reflect an older deployment or an already-changed flow. Do not close it solely on that assumption.

### Relevant current code

- `src/components/producer/DialTracker.tsx:43-73` loads tracker and projection JSON in parallel.
- `src/components/producer/DialTracker.tsx:80-96` saves tracker values after a 600 ms debounce.
- `src/app/api/producer/tracker/route.ts` returns JSON for GET and POST and exposes raw server error messages.
- `src/app/auth/confirm/actions.ts:20-40` documents a previously fixed stale-URL/redirect problem in which a Server Action could post to the wrong route after authentication.

### Investigation steps

1. Check Sentry release/deployment metadata for the 205 events. Determine whether they all predate the current auth-confirm implementation.
2. Reproduce this sequence in staging: sign in from a fresh invite/magic link, navigate to tracker without a full reload, rapidly increment counters, change dates while a save is pending, background/foreground the tab, and deploy a new version while the page remains open.
3. Inspect the response content type and body for every failed tracker request. An HTTP 200 does not prove the response was valid JSON or came from the intended route.
4. Add explicit `res.ok` and `content-type` checks before calling `res.json()`.
5. Add an idempotency/race test for debounced saves when date changes or the component unmounts.
6. Capture server-side route failures in Sentry with a generic client-facing message.

### Acceptance criteria

- Sign-in-to-tracker navigation works without a full refresh.
- Tracker values persist correctly under rapid clicks, date changes, tab backgrounding, and slow-network simulation.
- A failed request shows a friendly retryable message and does not silently lose the user's latest values.
- No recurrence is observed for 30 days after the release that contains the fix/instrumentation.

## Finding 3: Read-Only Array Mutation

### Sentry evidence

`JAVASCRIPT-NEXTJS-C` recorded three events on `/`. The error was:

`Cannot assign to read only property 'push' of object '[object Array]'`

The available stack contains minified Next/Turbopack chunks, so the responsible source module cannot be identified from the current event.

### Plain-English meaning and user impact

Some code tried to append to an array that was intentionally frozen or otherwise immutable. If first-party, this can break the component or interaction that performs the mutation.

### Required work

1. Configure production source-map upload and release association first.
2. Re-test `/` across the browser/OS combinations in the Sentry event.
3. Search mapped frames for state/prop arrays being mutated with `push`, `sort`, `reverse`, or `splice`.
4. Replace in-place mutation with immutable operations only after the responsible source is known.
5. If mapped frames prove the error is extension/injected code, filter it by frame origin rather than by this broad JavaScript message.

### Acceptance criteria

- A new staged test exception maps to the original TypeScript/TSX source line in Sentry.
- The responsible code path has a regression test if it belongs to the app.
- Do not mark the issue ignored until mapped frames establish ownership.

## Finding 4: Missing Server Action After Deployment

### Sentry evidence

`JAVASCRIPT-NEXTJS-7` recorded two events on `/auth/confirm`:

`Server Action "400d2d97ce77830dab3084e058a460970af3182a5b" was not found on the server.`

### Plain-English meaning and user impact

The browser had an older copy of the page. After a new deployment, it submitted an action identifier that belonged to the old build. The user's confirmation action can fail until the page is refreshed or reopened.

Next.js 16's bundled documentation identifies this as version skew and recommends a per-deployment `deploymentId` for rolling or multi-instance deployments. The current `next.config.ts` does not set one.

### Recommended work

- Confirm whether the hosting platform already supplies equivalent deployment skew protection.
- If not, set `deploymentId` or `NEXT_DEPLOYMENT_ID` to a stable value shared by all instances of one deployment and changed for the next deployment.
- Ensure the hosting/CDN routes assets and Server Function requests consistently for a deployment.
- Keep the auth confirmation form retryable and show a refresh/reopen instruction for this specific mismatch.

### Acceptance criteria

- Keep `/auth/confirm` open, deploy a new build, then submit. The browser must recover with a hard navigation or a clear retry path.
- No Server Action "not found" recurrence is observed across at least three production deployments.

## Finding 5: Browser/Third-Party Noise

These groups should not consume the same alerting attention as first-party failures. Filtering must be narrow enough that a genuine application exception with a similar message still reaches Sentry.

### `JAVASCRIPT-NEXTJS-F` and `J`: `M_ID`

Evidence:

- About 1.7K events on `/producer/analytics` and 75 on `/producer/clients`.
- Frames include `app:///executors/200.js` and minified chunks.
- No `M_ID`, `executors/200.js`, or related identifier exists in the repository outside dependencies/build output.
- Sentry recorded no application-specific source line.

Disposition:

- Treat as likely injected or third-party script noise unless source maps or reproduction prove otherwise.
- Filter only when both the exception text and a non-application frame such as `executors/200.js` match.
- Consider fingerprinting `F` and `J` together if the stack/source proves they are the same script.

### `JAVASCRIPT-NEXTJS-6`: MetaMask

Evidence:

- Stack source `app:///scripts/inpage.js`.
- Breadcrumb says no extension was found for MetaMask's Chrome extension ID.
- The repository has no wallet/MetaMask product flow.

Disposition:

- Filter when the message is "Failed to connect to MetaMask" and the frame/source is the injected `inpage.js` script.
- Do not add MetaMask or wallet code to the application to "fix" it.

### `JAVASCRIPT-NEXTJS-G`: PostHog recorder cross-origin frame

Evidence:

- One `SecurityError` on carrier contacts.
- Stack source `app:///static/posthog-recorder.js`.
- The browser blocked `app.allstarlifegroup.com` from reading a cross-origin frame.
- Session recording is enabled in `src/instrumentation-client.ts:49-53`.

Disposition:

- Verify the installed PostHog version is current and whether the recorder offers an iframe exclusion setting.
- If behavior is expected, filter only this cross-origin `SecurityError` when the stack is owned by `posthog-recorder.js`.
- Do not broadly ignore all `SecurityError` events; first-party cross-origin mistakes can be real bugs.

### `JAVASCRIPT-NEXTJS-B`: obfuscated `_0x3c02`

Evidence:

- One event on `/auth/signin`.
- The generated identifier does not exist in repository source.
- The variable name is characteristic of obfuscated/injected code, but that characteristic alone is not absolute proof.

Disposition:

- Filter only when the missing identifier and external/injected stack source both match.
- Archive after confirming no first-party source-map frame appears.

## Sentry and Observability Improvements

### 1. Upload source maps and associate releases

The current `next.config.ts` contains only `devIndicators: false`; it does not show Sentry build wrapping or source-map upload configuration. Browser issues currently point to minified Next/Turbopack chunks.

Required outcome:

- production exceptions map to original TypeScript/TSX files and lines;
- each event includes a release/deployment identifier;
- source maps are uploaded to Sentry as build artifacts and are not accidentally exposed as public application assets if the chosen setup supports hidden maps.

### 2. Capture handled API failures server-side

Producer API routes catch exceptions and return HTTP 500 JSON, but most do not explicitly call `Sentry.captureException`. Add one centralized helper or consistent route pattern that:

- records the original error once;
- adds safe route/query-phase context;
- avoids cookies, tokens, client names, medical information, and other PII;
- returns a generic message and a correlation/event ID to the browser where practical.

### 3. Align environments

Client Sentry uses `NODE_ENV`; server and edge use `VERCEL_ENV ?? NODE_ENV`. Confirm preview and production events land in consistent, intentionally named environments.

### 4. Add targeted performance visibility

`tracesSampleRate` is `0` in client, server, and edge configuration. That protects quota but removes the timing/spans needed to identify which database phase is slow.

Choose one of these approaches:

- temporarily enable a low, privacy-reviewed server trace sample rate;
- manually record timings and safe tags around candidate queries;
- use Supabase `pg_stat_statements`/Query Performance as the primary database evidence and correlate by route/release.

### 5. Filter by ownership, not message alone

The current `ignoreErrors` list only covers network/abort text. Add a `beforeSend` or equivalent ownership-aware filter that checks exception type, message, and frame filename together.

Do not globally ignore:

- all `TypeError` events;
- all `SecurityError` events;
- all read-only-property errors;
- all failures on `/producer`.

### 6. Review Sentry issue alerting after cleanup

Recommended alert split:

- page/server render errors: immediate alert;
- Postgres timeouts: immediate alert with a short recurrence threshold;
- new first-party browser exceptions: alert after a small count threshold;
- known extension/recorder fingerprints: dropped before ingestion or muted without paging.

## Suggested Engineering Tickets

### Ticket A: Eliminate producer database timeouts

Owner: full-stack/backend + database  
Priority: P0/P1

Scope:

- collect query plans and `pg_stat_statements` evidence;
- collapse duplicate dashboard metrics requests;
- move client/lead-spend date filtering and aggregation into Postgres;
- replace unread row retrieval with database existence checks;
- add only plan-backed indexes;
- preserve RLS and metric semantics;
- add producer error fallback and friendly API errors.

Definition of done: all acceptance criteria under Finding 1 pass and Sentry remains clear for 72 hours.

### Ticket B: Make Sentry actionable

Owner: platform/full-stack  
Priority: P1

Scope:

- production source maps;
- release/deployment IDs;
- consistent environment names;
- server capture for handled API failures;
- safe query-phase tags;
- privacy review of all added context.

Definition of done: a forced staging browser error and a forced staging API/database error both resolve to actionable source/phase information without PII.

### Ticket C: Reproduce tracker unexpected-response failures

Owner: full-stack  
Priority: P2

Scope:

- correlate old events to releases;
- test sign-in-to-tracker, slow network, rapid saves, date changes, backgrounding, and deployment during an open session;
- validate response status/content type before JSON parsing;
- add race/error tests and friendly retry behavior.

Definition of done: cause is identified or conclusively tied to an obsolete release, with 30 days of no recurrence.

### Ticket D: Diagnose read-only array mutation

Owner: frontend  
Priority: P2

Blocked by: Ticket B source maps

Scope:

- map the production stack;
- determine app versus extension ownership;
- fix immutable-state misuse and add regression coverage if first-party;
- otherwise add a frame-specific filter.

### Ticket E: Add deployment version-skew protection

Owner: platform/full-stack  
Priority: P3

Scope:

- verify hosting behavior;
- configure Next.js deployment IDs if needed;
- test Server Action submission across a deployment;
- add a user-recoverable mismatch state.

### Ticket F: Remove known Sentry noise

Owner: frontend/platform  
Priority: P3/P4

Scope:

- narrow filters for `M_ID` + `executors/200.js`;
- MetaMask + `inpage.js`;
- PostHog cross-origin `SecurityError` + `posthog-recorder.js`;
- `_0x3c02` + external/injected frame;
- verify each filter with unit tests against representative Sentry event payloads;
- keep `JAVASCRIPT-NEXTJS-C` unfiltered until ownership is known.

## Verification and Rollout Checklist

Before merging:

- Record before/after query plans and timings.
- Run unit tests for range calculations and unread scenarios.
- Run RLS tests as producer, builder, owner, and unauthorized user.
- Run `npm run typecheck`, `npm run lint`, and targeted Vitest suites.
- Build the production application with the Sentry release/source-map configuration enabled.
- Confirm no PII appears in a staging Sentry event.

Before production rollout:

- Capture baseline route/database timings.
- Confirm migration/index creation strategy will not cause unacceptable write blocking; use a production-appropriate concurrent strategy when necessary.
- Deploy during a monitored window.
- Keep rollback available for query/schema changes.

After rollout:

- Test `/producer`, `/producer/analytics`, `/producer/clients`, `/producer/tracker`, and `/auth/confirm` on desktop Chrome and mobile Safari.
- Validate small and large accounts.
- Confirm dashboard totals match pre-deploy expected values.
- Monitor Supabase query performance, database CPU/connections, route latency, and Sentry.
- Do not resolve `D`, `H`, or `E` immediately. Wait for the agreed clean observation window.
- Archive filtered noise only after confirming the filter is live and no first-party frames are being discarded.

## Relevant Repository References

- `src/app/producer/layout.tsx:64-88` - shared producer layout and unread dependency
- `src/lib/producer/unread.ts:17-50` - broad unread calculation
- `src/app/producer/page.tsx:22-62` - dashboard composition
- `src/components/producer/TodaySnapshot.tsx:49-76` - today metrics request and raw error display
- `src/components/producer/ProducerGoals.tsx:13-34` - duplicate MTD metrics request and raw error display
- `src/components/producer/DashboardOverview.tsx:46-64` - duplicate MTD metrics request
- `src/components/producer/DashboardOverview.tsx:122-145` - raw timeout text displayed in chart panel
- `src/lib/producer/metrics.ts:218-312` - dashboard metrics and unbounded client read
- `src/lib/producer/metrics.ts:340-398` - analytics metrics and unbounded client/lead-spend reads
- `src/app/api/producer/dashboard/metrics/route.ts:17-29` - caught error returned to client
- `src/app/api/producer/analytics/metrics/route.ts:20-32` - caught error returned to client
- `src/components/producer/DialTracker.tsx:43-108` - tracker load/debounced save
- `src/app/api/producer/tracker/route.ts:12-79` - tracker API behavior
- `src/app/auth/confirm/actions.ts:20-40` - prior stale URL/redirect incident context
- `src/instrumentation-client.ts:9-54` - Sentry filters and PostHog recorder configuration
- `src/sentry.server.config.ts:8-18` - server Sentry configuration
- `src/instrumentation.ts:6-17` - Next.js request error capture
- `next.config.ts:1-9` - no visible release/source-map or deployment-ID configuration
- `supabase/migrations/20260525000200_schema.sql:42-60` - recruit schema/indexes
- `supabase/migrations/20260525000200_schema.sql:92-102` - message schema/index
- `supabase/migrations/20260525000400_rls.sql:66-84` - message RLS policy
- `supabase/migrations/20260603000100_message_channel_realtime.sql:7-37` - message channel/realtime change
- `supabase/migrations/20260610000200_message_read.sql:7-23` - read receipt table and policies
- `supabase/migrations/20260601000200_producer_sales_tracking.sql:155-169` - tracker entry/index
- `supabase/migrations/20260601000400_clients.sql:18-77` - clients table/indexes
- `supabase/migrations/20260612000300_clients_person_created_idx.sql:8-9` - client created-at index
- `supabase/migrations/20260608000100_lead_purchases.sql:8-35` - lead purchases/index/RLS

## Final Triage Decision

Do not hand all 11 issues to a developer as 11 equally urgent bugs.

- Fix the producer/database workload first.
- Improve Sentry source maps and server context in parallel so remaining defects become diagnosable.
- Investigate tracker and read-only-array errors with release/source evidence.
- Add deployment-skew protection for the auth Server Action.
- Narrowly filter the five extension/recorder/injected-script groups.

The highest-value first change is reducing `/producer` query amplification while collecting the exact query plan that times out. The highest-value monitoring change is source maps plus query-phase context. Together, those changes address both the current incident and the reason this audit could not assign every minified event to one exact source line.
