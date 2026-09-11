# Client Four Fixes - Technical Handoff

Date: 2026-09-11

## Branch and Repository

- Repository: `farahabudaoudx-arch/allstaros`
- Integration branch: `feat/client-four-fixes`
- Base branch lineage: `feat/live-leaderboard-25`
- The integration branch therefore includes the completed Live Leaderboard work from tickets `#19` through `#25` plus the client follow-up changes described below.
- `main` and `dev` were not modified.
- No production deployment was performed.

## Included Client Work

### 1. Producer Menu / Training Navigation

Commit: `cfde2b3`

The client menu changes from Nicholas' `407038b` were integrated into the Farah branch while preserving the existing Live Leaderboard work.

Implemented behavior:

- Added `Production` as a grouped navigation section.
- Production contains:
  - Activity Analytics -> `/producer/analytics`
  - Leads -> `/producer/lead-spend`
  - Issued Premium -> `/producer/issued-premium`
  - Clients -> `/producer/clients`
  - Leaderboard -> `/producer/leaderboard`
- Added the darker Production icon.
- `All Star TV` is presented as `Agent Vlogs` while keeping the existing route and training library identity.
- `Live Dials` is presented as `Live Calls` while keeping the existing route.
- The Live Calls page heading is now `Live Sales Calls`.
- `Case Studies` remains available.
- `Bootcamp` behavior remains unchanged.
- `Resources & Tools` includes `Merch`, which opens `https://all-star.clothing/` as an external link.
- Scorecards currently remain a separate navigation item.

Browser acceptance was run for both Producer and Builder roles on desktop and mobile. Final menu QA result: `42/42` checks passed.

### 2. Underwriting - Explicit Submit and Bounded Dependencies

Commit: `1290588`

Integrated the behavior from client PR #26.

Key changes:

- Underwriting analysis is no longer triggered while typing, on blur, or while changing vitals/toolkit inputs.
- Claude analysis begins only after an explicit Submit action.
- Duplicate in-flight submissions are blocked.
- Results are tied to the submitted input snapshot so stale results are not shown for subsequently edited inputs.
- The API uses a bounded absolute request budget rather than allowing long inherited SDK timeouts.
- Dependency stages are bounded separately, including authentication, rate limiting, request parsing, model execution, and usage accounting.
- Anthropic retries are disabled for this flow to keep execution inside the server budget.
- Slow usage accounting does not discard an already completed analysis result.
- Stage timing instrumentation was added without logging medical notes or full provider payloads.
- Added regression tests for submission behavior, deadlines, LLM cancellation, and usage accounting.

The dependency conflict in `package.json` / `package-lock.json` during integration was resolved by retaining the newer Farah branch versions while adding the only missing PR #26 dev dependency (`jsdom`).

### 3. Supabase Invalid Refresh Token Recovery

Commit: `e34cb18`

Integrated the behavior from client PR #27.

Key changes:

- Redirect responses preserve cookie mutations and relevant cache-control headers.
- Invalid or reused Supabase refresh tokens clear only this project's Supabase session cookies, including chunked session-cookie variants.
- Invite/OAuth verifier cookies, other Supabase project cookies, and unrelated application cookies are preserved.
- Successful refresh cookie rotation is propagated to both the browser response and downstream request state.
- Public routes recover from an invalid local session without creating a redirect loop.
- Retryable auth-service outages and unrelated auth failures remain surfaced rather than being incorrectly treated as invalid-refresh-token cases.

Integration-specific test files were kept isolated because the pre-existing Gateway and Live Leaderboard middleware tests mock `@supabase/ssr`, while the refresh-token regression suite intentionally uses the real SSR client behavior with a mocked network layer.

Additional integration test commits:

- `2d847f7` - keeps Gateway middleware coverage working with the new early Supabase session-cookie calculation.
- `5c76b2e` - keeps Live Leaderboard public-route and capability-management middleware coverage working with the same change.

These two changes only add the required Supabase test environment values; they do not change production behavior.

### 4. Scorecards - Builder Ratings and Producer Daily Tracking

Commit: `58cee66`

Implemented the client Scorecards corrections across the rating helpers, verifier, previews, and tests.

Builder scoring now follows the requested direction and thresholds:

- First Leg %: lower concentration is better.
  - `< 30%` -> 5 stars
  - `30% to < 40%` -> 4 stars
  - `40% to < 50%` -> 3 stars
  - `50% to < 60%` -> 2 stars
  - `60% to < 70%` -> 1 star
  - `>= 70%` -> 0 stars
- Avg IP Per Writer uses the requested stepped thresholds:
  - `>= $15,000` -> 5 stars
  - `>= $12,500` -> 4 stars
  - `>= $10,000` -> 3 stars
  - `>= $7,500` -> 2 stars
  - `>= $5,000` -> 1 star
  - `< $5,000` -> 0 stars
- Recruits Licensed:
  - `5+` -> 5 stars
  - `4` -> 4 stars
  - `3` -> 3 stars
  - `2` -> 2 stars
  - `1` -> 1 star
  - `0` -> 0 stars

Note: the exact `$5,000` boundary is currently implemented as `1 star`. Product confirmation is still requested because the source material puts `$5k` in both the 1-star and 0-star wording.

Producer tracking changes:

- Sundays are now scored the same as every other elapsed day.
- A qualifying logged day displays green.
- An elapsed day with no qualifying log displays red.
- Future dates remain non-scored / neutral.
- Multiple qualifying entries on the same date count as one tracked day.
- Sunday contributes to the tracked-day total and therefore to Producer tracking stars.
- Regression coverage includes the acceptance boundary where `23` other tracked days plus `1` Sunday equals `24` days / `5 stars`, and removing the Sunday gives `23` days / `4 stars`.

The independent published-scorecard verifier was updated to use the same rating rules so preview, generation, stored snapshots, verification, and auto-publish do not disagree.

## Database / Migration Impact

No new database migration is part of these four client fixes.

- No `supabase/migrations/**` files are included in the branch diff for this work.
- No production database write or schema change was performed while implementing these tasks.
- The existing Live Leaderboard migration from ticket #19 was already part of the earlier Live work and is not a new change in this client-fixes branch.

Normal application testing may exercise ordinary application data paths, but there is no schema migration required by PR #26, PR #27, the Menu task, or the Scorecards task.

## Integration Notes

The client changes were not merged wholesale from the client `dev` branch. They were integrated selectively onto the Farah Live Leaderboard branch to avoid importing unrelated work.

The integration branch contains only the requested client work plus two small middleware test compatibility changes needed because PR #27 changed when Supabase environment values are read.

No `gateway-runner/**` files were added to the integration diff.

## Validation Results

Validation was run on the final combined branch, not only on the individual task branches.

- Full Vitest suite: `917/917` passing.
- Supabase / Gateway / Live middleware integration suite: passing.
- Scorecards regression suite: passing.
- TypeScript: passing.
- ESLint: `0 errors`; existing advisory warnings remain.
- Production build: passing.
- Next.js production build generated `101` application routes successfully.
- Menu browser QA: `42/42` passing across:
  - Producer desktop
  - Producer mobile
  - Builder desktop
  - Builder mobile
  - Production group links
  - Training labels and pages
  - Merch external behavior
  - active-link highlighting
  - mobile drawer dismissal
  - Builder section visibility
  - no browser JavaScript errors during the acceptance pass

Expected `Invalid Refresh Token` errors printed by the refresh-token regression tests are simulated test inputs and do not represent failing tests.

## Current Product Decisions Requiring Confirmation

The following items are implemented with a current default behavior but still require final product confirmation before a production release is considered fully accepted:

1. Live Leaderboard freshness target: approve visible updates within `< 5 seconds` under normal connectivity.
2. Team Live Link membership: current behavior is dynamic and follows the current recruiting/downline tree rather than freezing membership at link creation.
3. Offline Live deals: current behavior replays previously unseen same-day deals once after reconnect, but does not replay historical initial data or prior-day deals after midnight.
4. Builder Avg IP boundary: current implementation treats exactly `$5,000` as `1 star`; source wording is ambiguous.
5. Scorecards navigation placement: current implementation keeps Scorecards as a separate navigation item rather than moving it under Production.

## Release Status

The work is pushed only to:

`farahabudaoudx-arch/allstaros:feat/client-four-fixes`

No merge to `dev` or `main` has been performed and no production deployment has been performed.

Real-device Live Leaderboard AirPlay / Chromecast acceptance and the product decisions above remain outside the scope of this branch push.
