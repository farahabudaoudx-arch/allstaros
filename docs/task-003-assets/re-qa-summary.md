# Ticket #003 Browser Re-QA

Date: 2026-09-03
Target: real dev Supabase published snapshots through the admin snapshot UI.

## Result
PASS. The two previously reported UI defects are resolved.

## Snapshots
- Maya Chen Producer: `96340979-24e4-4f2d-9eac-b86fc05ceffb`
- Maya Chen Builder: `94efc129-ada9-4005-83d6-3aae296aae25`
- James Lee missing-data Producer: `94c34f9c-27b0-4e32-bea3-adbb780d7fef`

## 390x844 export-control vs heading measurements
All intersection areas are exactly `0 px²`.

| Card | Section | Vertical clearance |
| --- | --- | ---: |
| Maya Producer | Scored Metrics | 24.796875 px |
| Maya Producer | Unscored Metrics | 20 px |
| Maya Producer | Your Scorecard | 20 px |
| Maya Builder | Scored Metrics | 24.796875 px |
| Maya Builder | Unscored Metrics | 20 px |
| Maya Builder | Your Scorecard | 20 px |

## James desktop missing-data measurements
Four exact `Unavailable` values were rendered.

- Each value: `scrollWidth = clientWidth = 173 px`
- Each containing card: `scrollWidth = clientWidth = 213 px`
- Left overrun: `0 px`
- Right overrun: `0 px`
- Pairwise value collisions: `0`

## Global overflow / runtime
- Producer desktop 1440x1000: document/body horizontal overflow `0 px`
- Producer mobile 390x844: document/body horizontal overflow `0 px`
- Builder desktop 1440x1000: document/body horizontal overflow `0 px`
- Builder mobile 390x844: document/body horizontal overflow `0 px`
- James desktop 1440x1000: document/body horizontal overflow `0 px`
- James mobile 390x844: document/body horizontal overflow `0 px`
- `document.fonts.status`: `loaded` on every measured page
- Browser console errors: `0`
- Browser page errors: `0`

## Actual PNG downloads
| Artifact | Bytes | Pixel dimensions |
| --- | ---: | ---: |
| Maya Producer Your Scorecard 9:16 | 1,604,486 | 2160x3840 |
| Maya Producer Your Scorecard 16:9 | 1,132,410 | 3840x2160 |
| Maya Builder Your Scorecard 9:16 | 1,623,362 | 2160x3840 |
| Maya Builder Your Scorecard 16:9 | 1,152,387 | 3840x2160 |
| James Unscored Metrics 9:16 | 327,861 | 2160x3840 |
| James Unscored Metrics 16:9 | 263,894 | 3840x2160 |

All six downloaded PNGs were visually inspected. Maya Producer/Builder baseball-card layouts render cleanly in both aspect ratios, and James `Unavailable` values are fully visible in both export formats.

## Evidence files
Detailed machine measurements are in `re-qa-evidence.json`. Full-page screenshots and all regenerated PNGs use the `re-qa-` prefix in this directory.
