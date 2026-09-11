# Live Leaderboard — Release Verification (#25)

Status: **Software verification in progress. Release is not approved yet.**

This document records the release evidence for Live Leaderboard tickets #19–#25. It deliberately keeps hardware- and product-owner-only checks open rather than treating browser automation as a substitute.

## Delivered ticket chain

| Ticket | Branch / commit | Status |
| --- | --- | --- |
| #19 | `feat/live-leaderboard-19` / `a81f1dc` | Pushed |
| #20 | `feat/live-leaderboard-20` / `df053b6` | Pushed |
| #21 | `feat/live-leaderboard-21` / `f7c2ab1` | Pushed |
| #22 | `feat/live-leaderboard-22` / `9a2a46d` | Pushed |
| #23 | `feat/live-leaderboard-23` / `15b2e59` | Pushed |
| #24 | `feat/live-leaderboard-24` / `bc68ff9` | Software implementation pushed; real-device checks remain open |
| #25 | `feat/live-leaderboard-25` | Verification branch |

## Browser / device environments

### Automated

- Playwright Chromium through the repository's standard `playwright.config.mjs`.
- Landscape TV coverage at 1920×1080.
- 1280×720 long-name / long-carrier coverage.
- Multiple independent browser pages using the same capability URL.
- Presentation API behavior is exercised through a standards-shaped browser test double so connection, close, reconnect, terminate, no-device, and fallback UI can be verified deterministically.

### Supported but still requiring real-device acceptance

- iPhone / iPad → AirPlay Screen Mirroring → Apple TV / AirPlay display.
- Android / Chrome → supported Cast / screen-cast path.
- Chrome browsers exposing the Presentation API can use the in-page display picker; otherwise the UI accurately directs the user to Chrome's Cast controls and preserves Copy link.

**Do not mark #24 or #25 complete until both promised platform paths have been demonstrated on real supported hardware.**

## Measured freshness

Release target used by the implementation: **visible scoped Live update in under 5 seconds under normal connectivity**.

- Poll interval: `3000 ms`.
- Controlled running-browser release measurements on 2026-09-10: **2400–2419 ms** from making a new snapshot available to both independent displays showing the new producer.
- Test: `browser-tests/live-leaderboard-release.spec.mjs`.

This is an automated controlled-browser measurement, not a production-network SLA.

## Automated acceptance evidence

### Capability and security boundary

- Capability token generation and hashing covered.
- Public snapshot requires Bearer capability rather than an app session.
- Capability storage remains service-role only under RLS.
- Creator-only management is covered.
- Rotate uses the atomic database RPC.
- Revoked capability returns the dead-link state.
- Public snapshot does not expose internal `person_id` values.

Relevant tests:

```text
src/app/api/producer/live-leaderboard/capabilities/route.test.ts
src/app/api/live-leaderboard/snapshot/route.test.ts
src/lib/producer/live-leaderboard-contract.test.ts
src/lib/producer/live-leaderboard.test.ts
src/lib/supabase/live-leaderboard-middleware.test.ts
```

### Scope, ranking, totals, and eligibility

- Team scope maps to creator + current downline.
- No-downline Team scope retains the active creator only.
- Organization scope is supported.
- Inactive and explicitly excluded people are removed from Live scopes.
- Multiple deals for one person aggregate into one leaderboard row.
- Tie order is dollars descending, then deal count descending, then display name alphabetically.
- Empty morning safely renders zero totals.
- Week / month totals can include people absent from today's ranking.
- Missing / unapproved photo uses initials fallback.
- Missing carrier stays omitted.

Relevant tests:

```text
src/lib/producer/submitted-ap-leaderboard.test.ts
src/lib/producer/live-leaderboard.test.ts
browser-tests/live-leaderboard-celebration.spec.mjs
```

### Freshness, reconnect, rollover, and corrections

- 3-second polling.
- Initial historical rows do not celebrate.
- Same-day missed events are replayed once after reconnect.
- Repeated delivery is deduplicated by stable event ID.
- Corrections / voids do not create a new celebration for the same underlying event ID.
- Shop-day rollover drops yesterday's event state and queued celebration work.
- Open displays transition to the dead-link state after capability revocation.
- Two independent displays can use the same capability simultaneously.

Relevant tests:

```text
src/lib/producer/live-leaderboard-events.test.ts
src/lib/producer/live-leaderboard-celebrations.test.ts
browser-tests/live-leaderboard-release.spec.mjs
browser-tests/live-leaderboard-celebration.spec.mjs
```

### Celebration and sound

- Fullscreen deal celebration uses the same Live surface as Preview.
- Celebrations remain sequential for approximately 5 seconds each.
- Burst queue is uncapped.
- Optional carrier behavior covered.
- Visual celebration remains functional if Web Audio throws, audio is locked, muted, or browser storage is blocked.
- One OK / click unlock path is protected against duplicate/concurrent audio activation.
- Sound preference persists per display through `localStorage` when storage is available.
- Long producer / carrier content fits 1280×720 without page overflow.

Relevant tests:

```text
browser-tests/live-leaderboard-celebration.spec.mjs
src/lib/producer/live-leaderboard-celebrations.test.ts
```

### Casting software path

- Cast controls are available in the Live sheet and on the Preview / TV surface.
- Casting cannot start before the selected scope has a usable capability URL.
- Scope switching cannot reuse the previous scope's URL.
- Presentation-capable browser path passes the exact capability URL to the display picker.
- Detectable connection close exposes reconnect guidance.
- Connected session exposes Stop casting.
- Wrong-TV flow requires stopping then choosing another display.
- Browser without an in-page picker receives accurate Chrome / Android instructions.
- AirPlay UI accurately uses iPhone / iPad Screen Mirroring guidance instead of pretending a web page can open the system mirroring picker.
- Cast failure / no-device states retain Copy link.
- Browser link remains first-class fallback.

Relevant test:

```text
browser-tests/live-leaderboard-casting.spec.mjs
```

## Adjacent regression boundary

The normal Leaderboard, Tracker, Scorecards, Issued Premium, and Gateway pipelines are outside the Live feature and must remain unchanged. The Live work intentionally does not alter their routes or scoring pipelines. A running-app producer smoke now verifies the normal Leaderboard, Daily Tracker, Scorecards, and Issued Premium pages still load without an application error. Final release validation also includes the repository-wide unit suite, lint/typecheck, and production build.

Known unrelated local work that must remain outside Live commits:

```text
gateway-runner/providers/gateway.mjs
gateway-runner/providers/gateway.test.mjs
```

## Product decisions still requiring explicit confirmation

The PRD marks these as open product decisions. The current implementation is documented below, but implementation choice is **not** treated as product approval.

1. **Freshness threshold**
   - Implemented / tested target: under 5 seconds under normal connectivity.
   - Automated measured runs: 2400–2419 ms.
   - Product owner must confirm this acceptance threshold.

2. **Team membership after link creation**
   - Current implementation: dynamic. An existing Team link follows the current recruiting/downline tree at snapshot time.
   - Product owner must confirm dynamic membership vs creation-time snapshot membership.

3. **Deals missed while temporarily offline**
   - Current implementation: replay unseen same-day deals once after reconnect; never replay historical initial data or yesterday's deals.
   - Product owner must confirm this policy.

## Open release blockers

- [ ] Real iPhone / iPad AirPlay acceptance on supported hardware.
- [ ] Real Android / Chrome Chromecast or supported Cast acceptance on supported hardware.
- [ ] Verify TV audio behavior on the actual promised cast targets; visual-only + optional phone audio is acceptable where the platform cannot route web audio to TV.
- [ ] Product owner confirmation of the three open decisions above.
- [ ] Product owner review of the running feature and explicit release approval.

## Latest automated verification run — 2026-09-10

```text
Live browser acceptance: 9/9 passed
Controlled freshness observations: 2400–2419 ms
Adjacent producer-surface smoke: passed
Repository unit suite: 99 files / 883 tests passed
npm run check: passed (0 errors, 58 pre-existing warnings)
npm run build: passed
```

During the #25 audit, Organization Live was also corrected to exclude inactive people consistently with the Live acceptance rules. A direct scoped-computation regression suite now covers no-downline Team behavior, inactive/excluded Organization visibility, one-row-per-person aggregation, and ranking tie-breaks.

## Release rule

Browser automation, unit tests, a production build, or screenshots **must not** be used to mark the hardware or product-owner blockers above as passed. If a promised real-device workflow fails, keep #24 / #25 open and record the failure before release.
