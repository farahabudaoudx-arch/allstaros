# Ticket #003 — Validate Refreshed Cards With Real Data And Shareable Downloads

**Status:** Partial — UI/export validation complete; real Gateway-data acceptance pending
**Branch:** `dev`
**Scope:** Scorecard Feature v2 / Ticket #003
**Validation date:** 2026-09-03

## Objective

Validate the refreshed Producer and Builder scorecards in the development environment, verify missing-data behavior, and prove that the shareable PNG export flow remains usable at the supported 9:16 and 16:9 formats. Browser QA was treated as a release gate, not optional evidence. The visual/export evidence below remains useful, but this review corrects the earlier claim that the development rows constituted known-source real Gateway acceptance data.

No production Gateway / Rent-a-Mac configuration, credentials, 2FA behavior, scrape schedules, or database records were changed.

## Implementation changes

### 1. Missing-value regression coverage

Updated:
- `src/components/scorecards/ProducerScorecardPreview.test.ts`
- `src/components/scorecards/BuilderScorecardPreview.test.ts`

The tests explicitly verify that missing Producer unscored metrics and missing/invalid Builder values render `Unavailable` rather than misleading numeric values, `NaN`, or `Infinity`.

### 2. Mobile export controls no longer overlap headings

Updated `src/components/scorecards/ScorecardExportControls.tsx`.

On small screens the export-control container now participates in normal document flow and returns to absolute positioning from the `sm` breakpoint upward. This removes the measured 390 px viewport overlap between the 9:16 / 16:9 buttons and `Scored Metrics`, `Unscored Metrics`, and `Your Scorecard` on both Producer and Builder cards.

### 3. Producer `Unavailable` values no longer overflow metric cards

Updated `src/components/scorecards/ProducerScorecardPreview.tsx`.

`MetricCards` gives the literal `Unavailable` a smaller responsive type treatment with `break-words` and tighter line-height while ordinary numeric values retain their existing styling. This fixes a measured desktop overflow where the value previously had a 226 px scroll width inside a 173 px text box.

## Development fixture validation

The June Maya Chen dataset is **seeded development data**, not independently sourced Gateway production/member data. `scripts/seed-scorecard-demo.mjs` creates Maya Chen and writes the same June 2026 IP, tracking, lead-spend, team-IP, and related rows used by these snapshots. The script also links its premium rows to development import-audit rows. Therefore the snapshots prove rendering/calculation consistency against the seeded database state, but they do **not** satisfy Ticket #003's real-data acceptance requirement.

### Maya Chen — Producer (seeded fixture)

Published snapshot: `96340979-24e4-4f2d-9eac-b86fc05ceffb`
Period: June 2026.

Five development WTD rows linked to the seeded fixture were found:

| Report date | Personal IP | Team IP | First Leg |
| --- | ---: | ---: | ---: |
| 2026-06-06 | $8,400 | $80,000 | 8% |
| 2026-06-16 | $8,400 | $80,000 | 8% |
| 2026-06-19 | $8,400 | $80,000 | 8% |
| 2026-06-22 | $8,400 | $80,000 | 8% |
| 2026-06-30 | $8,400 | $80,000 | 8% |

Raw Personal IP total: **$42,000**.

Published Producer scorecard:
- Personal IP: **$42,000 — 5★**
- Lead Spend: **$10,800 — 5★**
- Tracking: **25 days — 5★**
- Overall: **5.00 weighted**
- Activity totals: 1,000 dials, 100 leads, 300 contacts, 75 appointments, 50 presentations, 25 sales.

The published value matches the seeded source rows. This is a deterministic fixture-consistency check, not evidence that a real member Gateway file produced the values.

### Maya Chen — Builder / dual-role (seeded fixture)

Published snapshot: `94efc129-ada9-4005-83d6-3aae296aae25`.

Published values:
- Growth: **+33.3% — 5★**
- Active Directs: **8 — 5★**
- First Leg: **8% — 5★**
- Recruits Licensed: **14 — 5★**
- Avg IP / Active Writer: **$44,444 — 5★**
- Total Team IP: **$400,000**
- Final score: **25 / 25, 5.0 average**

Prior May Team IP was **$300,000** and June Team IP was **$400,000**, confirming the published **+33.3%** growth calculation.

### James Lee — development missing-history case

Published snapshot: `94c34f9c-27b0-4e32-bea3-adbb780d7fef`.

This development snapshot has missing activity history. The browser renders missing metrics as `Unavailable`. No known-source Gateway file is available in the permitted repository/materials to establish James as real Gateway-data acceptance evidence, so this section is retained only as missing-data UI evidence.

After the UI fix, all four visible `Unavailable` values measured:
- text `clientWidth = 173 px`
- text `scrollWidth = 173 px`
- parent `clientWidth = 213 px`
- parent `scrollWidth = 213 px`
- left/right overflow: **0 px**
- pair collisions: **0**

## Browser / UI / UX validation

Development published snapshots were opened through the local dev-authenticated admin flow.

Viewport tested: **390 × 844**.

Producer and Builder both had:
- document horizontal overflow: **0 px**
- body horizontal overflow: **0 px**
- fonts loaded
- no page errors
- no console errors

Export-control/heading intersection after the fix was exactly **0 px²** for all six checked sections:
- Producer Scored Metrics
- Producer Unscored Metrics
- Producer Your Scorecard
- Builder Scored Metrics
- Builder Unscored Metrics
- Builder Your Scorecard

Measured vertical clearance was approximately **24.8 px / 20 px / 20 px** across those section types.

Required section order remained:
1. How You're Scored
2. Scored Metrics
3. Unscored Metrics
4. Your Scorecard

The removed previous-period growth section did not reappear.

## Shareable PNG export validation

Actual browser-generated PNGs were downloaded and visually inspected after the UI fixes.

| Card / section | Format | Actual raster | Result |
| --- | --- | ---: | --- |
| Maya Producer — Your Scorecard | 9:16 | 2160 × 3840 | PASS |
| Maya Producer — Your Scorecard | 16:9 | 3840 × 2160 | PASS |
| Maya Builder — Your Scorecard | 9:16 | 2160 × 3840 | PASS |
| Maya Builder — Your Scorecard | 16:9 | 3840 × 2160 | PASS |
| James — Unscored Metrics | 9:16 | 2160 × 3840 | PASS |
| James — Unscored Metrics | 16:9 | 3840 × 2160 | PASS |

Final regenerated file sizes:
- Producer 9:16: **1,604,486 bytes**
- Producer 16:9: **1,132,410 bytes**
- Builder 9:16: **1,623,362 bytes**
- Builder 16:9: **1,152,387 bytes**
- James Unscored 9:16: **327,861 bytes**
- James Unscored 16:9: **263,894 bytes**

All were visually inspected as readable and unclipped. The 2× raster sizes are expected because `SCORECARD_EXPORT_PIXEL_RATIO = 2` over logical 1080×1920 and 1920×1080 share formats.

QA screenshots and generated PNG evidence were intentionally **not committed** per project-owner instruction.

## Automated validation

### Focused scorecard suite
`26 / 26` tests passed across Producer preview, Builder preview, scorecard export, and PNG export route tests.

### Full suite
`56 / 56` test files passed.
`608 / 608` tests passed.

### TypeScript
`npm run typecheck` — **PASS**

### ESLint
`npx eslint src` — **PASS with 0 errors**.

There are 58 existing warnings elsewhere in the product, primarily React hook/compiler advisories, `no-img-element`, and existing explicit `any` usage. None were introduced by Ticket #003.

A root-level `npx eslint .` configuration-path issue can fail because `react-hooks/set-state-in-effect` is applied where the plugin is not registered. This pre-existing lint configuration issue is outside Ticket #003; product-scoped lint is clean.

### Build
`npx next build` — **PASS**
- compiled successfully
- TypeScript completed
- page-data collection completed
- 96 / 96 static pages generated
- final optimization completed

### Security
Semgrep on:
- `ProducerScorecardPreview.tsx`
- `ScorecardExportControls.tsx`

Result: **0 findings, 0 scan errors**.

## Known observations / deferred decisions

1. **Active Directs rating band:** current scoring gives 5★ at 8+. Earlier meeting discussion suggested a higher number. No scoring rule was changed without an explicit business decision.
2. **Builder `?source=live` preview:** the helper uses stale hardcoded dev identity/period data. Real published snapshots were used for acceptance instead.
3. **Producer preview route:** remains fixture-based, so real-data acceptance was proven through the published snapshot path.
4. **Producer IP missing-row semantics:** `lifecycle.ts` currently uses `amountByDate.get(report.reportDate) ?? 0`. A missing row and a legitimate zero could be semantically different. This was not changed without direct Gateway evidence because doing so would alter scoring/data semantics beyond a validation ticket.
5. **Real-data acceptance remains open:** no Producer/Builder Gateway CSV/XLS/XLSX with independently established real-member provenance was found in the permitted repository/materials during the 2026-09-05 review. Seeded Supabase rows and screenshots must not be used to close that acceptance item.

## Git scope

Ticket #003 commit contains only:
- `src/components/scorecards/ProducerScorecardPreview.tsx`
- `src/components/scorecards/ScorecardExportControls.tsx`
- `src/components/scorecards/ProducerScorecardPreview.test.ts`
- `src/components/scorecards/BuilderScorecardPreview.test.ts`
- this report

Explicitly excluded:
- `docs/task-003-assets/**`
- `AGENTS.md`
- `CLAUDE.md`
- `.agents/**`
- `.serena/**`
- existing `docs/CODEBASE_*.md`

## Final result

**Ticket #003: PARTIAL**

The refreshed Producer and Builder UI, missing-data rendering, and shareable exports were validated in development, and the Maya calculations are internally consistent with the seeded fixture that generated them. **Real-data Producer/Builder acceptance is still pending** until known-source Gateway files for real members can be compared. No production Gateway or Rent-a-Mac behavior is claimed or validated by this document.
