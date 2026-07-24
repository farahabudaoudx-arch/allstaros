# Plan: Downline Tree View

**Branch**: feat/downline-tree-view
**Status**: Active

## Goal

Give a builder a **List / Tree toggle** on `/producer/downline` so they can see their whole recruiting structure as an indented, collapsible org tree instead of a flat roster. The tree doubles as a performance heatmap (IP per person + rolled-up team IP), keeps click-to-manage exactly as the list has it today, and stays readable at any org size, on desktop and phone.

## Design decisions (locked via grill-me)

- **Placement**: a List / Tree toggle on `/producer/downline` (same route). Tree's richer data (IP from the Team/leaderboard source) **lazy-loads on first flip**; the list stays cheap.
- **Population**: producers + builders only — the exact same set the list already returns (pure recruits stay in the Recruiting Pipeline). The toggle must never make anyone appear/vanish.
- **Root**: a regular builder is the root of their own view (their total-org IP on their row). The owner's god-mode view is one real tree rooted at **Wylie Hawkins** (the person with `upline_id = null`) — no synthetic node, no forest.
- **Shape**: indented outline tree, chevron expand/collapse, vertical scroll. No graph library.
- **Default expansion**: fully expanded; if the subtree is **100+ people**, land collapsed to direct reports. Expand all / Collapse all always available. Expand/collapse is pure client-side show/hide (no extra fetches).
- **Sibling order**: by **team IP, descending** — heaviest legs on top under every parent. Pending/never-produced sink to the bottom.
- **Row content**: `[chevron] [initials] Name · Role — {IP}`. IP = **month-to-date issued premium**. Parent rows show `You $X · Team $Y`; **leaves show own IP only** (no team line). Team IP = **self + all descendants**. Collapsed rows show a **headcount badge** ("14 below"), hidden once expanded. Keep the existing Direct/Indirect and Invite-Sent/Active pills.
- **Interaction**: tapping a row opens the person's page exactly as the list does today (`/producer/downline/{id}`, indirect people open view-only). The chevron is a separate hit-target for expand/collapse only.
- **Search**: filters to matches **plus their ancestor chain**, auto-expanded; clearing restores the tree. Reuses the existing name/email search text.
- **Mobile**: one responsive tree — small indent (12–16px/level), **team IP only** per row; own-IP and pills revealed on the opened row.
- **Pending invites**: appear as leaf nodes with the "Invite Sent" pill, no IP, sorted to the bottom of their sibling group.
- **Empty state**: toggle still works; tree shows just the root row with a "No one in your downline yet" line.
- **Loading**: a skeleton while the tree's richer data fetches on first flip.

## How this codebase is tested (read before writing slices)

- `npm test` runs **vitest** (`vitest run`). Existing tests cover **pure logic only** (`src/lib/**`). There is **no component or browser test harness**.
- Therefore: **new tree-shaping / rollup / sort / filter helpers get vitest unit tests (RED-GREEN first) and mutation testing.** **UI slices are verified in the live browser preview** (real builder account via `/auth/dev`), since JSX has no unit harness here.
- This is a modified Next.js: new routes need a dev-server restart. This plan adds **no new route** (toggle on the existing page), so no restart is required, but read the relevant guide in `node_modules/next/dist/docs/` before touching any data-fetch/server code.
- Data source note: the current downline page uses the **cheap roster query** (`person`, no numbers). The tree needs **per-person IP** for the whole subtree from the Team/leaderboard source (`/api/producer/team` / `computeLeaderboard`), which is already RLS-scoped to the caller's subtree. The tree is built on the Team data, then rollups are summed in JS.

## Acceptance Criteria

- [ ] A builder on `/producer/downline` sees a **List / Tree** toggle; List is the current roster unchanged.
- [ ] Switching to Tree lazy-loads the tree data (skeleton while loading) and renders an indented outline: the builder as root, directs nested beneath, deeper levels below that.
- [ ] The tree contains **exactly the same people** as the list (producers + builders; pending invites included as leaves; no pure recruits).
- [ ] The owner's Tree view is a single tree rooted at **Wylie Hawkins**.
- [ ] Each parent row shows `You ${own IP} · Team ${team IP}` (MTD issued premium); each leaf shows only own IP; team IP = self + all descendants.
- [ ] Siblings under every parent are ordered by **team IP descending**; pending/zero-IP people sort last.
- [ ] Collapsed rows show a **"N below" headcount badge**; expanding a row hides its badge and reveals its children.
- [ ] Default is **fully expanded**, but a subtree of **100+ people lands collapsed to direct reports**; **Expand all / Collapse all** controls work either way.
- [ ] **Tapping a row** opens `/producer/downline/{id}` (indirect people open the existing view-only page); **the chevron only expands/collapses** and never navigates.
- [ ] **Search** filters to matching people plus their ancestor chain, auto-expanded; clearing the box restores the prior tree state.
- [ ] On a phone, the tree is usable: small indent, **team IP only** per row, own-IP/pills revealed on the opened row; no horizontal scroll of the tree.
- [ ] Existing **Direct/Indirect** and **Invite-Sent/Active** pills still render.
- [ ] A builder with no downline sees just their root row and a "No one in your downline yet" line.

## Slices

Every logic slice follows RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR (see `tdd`, `testing`, `mutation-testing`, `refactoring`). UI slices swap MUTATE/KILL for live-preview verification as noted above. No production logic without a failing test first.

### Slice 1: Pure tree-builder from the flat scoped roster (no UI)

**Value**: A tested function turns the flat, RLS-scoped `person` list into a nested tree rooted correctly (self for a builder; the `upline_id = null` person for the owner).
**Path**: New pure helper in `src/lib/downline/` (e.g. `buildDownlineTree(people, rootId)`) that maps `upline_id` into parent→children nodes, picks the root (caller for a builder, the top-of-org / no-upline person for the owner), and returns an ordered node tree. No numbers yet.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Acceptance criteria**: Given a flat list with `upline_id` links, returns a single tree from the right root; orphans whose parent isn't in the set attach sensibly (documented rule); no infinite loop on a cycle. **Present and confirm before coding.**
**RED**: Unit-test structure (depth, parent/child membership), root selection (builder vs owner), orphan handling, cycle guard.
**GREEN**: Minimal builder.
**MUTATE / KILL**: Kill survivors (root mis-selection, dropped children, cycle guard removed).
**REFACTOR**: Only if it clarifies.
**Done when**: Tests green + mutants killed, human approves commit.

### Slice 2: IP rollup + sibling ordering + headcount (pure)

**Value**: Every node carries own IP, team IP (self + descendants), a descendant count, and siblings are ordered by team IP desc.
**Path**: Pure helpers that fold a per-person MTD IP map onto the Slice-1 tree: compute `teamIp` bottom-up, attach `ownIp`/`teamIp`/`descendantCount`, sort each sibling group by `teamIp` desc with pending/zero last (stable tiebreak by name).
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Acceptance criteria**: `teamIp` at any node equals that node's own IP plus every descendant's own IP; leaf `teamIp === ownIp`; counts correct; sort is IP-desc with zeros/pending last. **Present and confirm before coding.**
**RED**: Unit-test rollups on a hand-built tree (multi-level sums, leaf equality), counts, and sort order incl. ties and zero handling.
**GREEN**: Minimal rollup + sort.
**MUTATE / KILL**: Kill survivors (self excluded from rollup, sort direction flipped, zero-bucket placement, off-by-one count).
**REFACTOR**: If valuable.
**Done when**: Tests green + mutants killed, human approves commit.

### Slice 3: List/Tree toggle + walking-skeleton tree render (lazy data)

**Value**: A builder can flip List ⇄ Tree; Tree lazy-loads its data and renders the nested rows with names, roles, and IP.
**Path**: Add a toggle to `/producer/downline` (persist choice in `localStorage`, matching the AnalyticsView pattern). Tree mode fetches the Team/leaderboard-scoped data on first switch (skeleton while loading), feeds Slices 1–2, and renders an indented outline: `[chevron][initials] Name · Role — You $X · Team $Y`, leaves show own IP only. Directs/Indirect + Invite-Sent/Active pills kept. Lazily mount collapsed children so hidden rows cost nothing.
**Required implementation skills**: `tdd`, `testing`, `refactoring` (+ UI).
**Acceptance criteria**: Toggle switches views and is remembered; Tree shows the builder as root with correctly nested, IP-labelled rows equal to the list's population; skeleton shows during load. **Present and confirm before coding.**
**RED / verification**: Unit-test any `initialView(storedValue)` resolver. Verify render + lazy fetch in live preview as a builder via `/auth/dev`.
**GREEN**: Toggle + tree render wired to the helpers.
**MUTATE / KILL**: Mutation-test the view resolver.
**REFACTOR**: Extract the row as a presentational component for reuse.
**Done when**: Verified in preview + resolver tests green, human approves commit.

### Slice 4: Expand/collapse + default-expansion rule + Expand/Collapse all + headcount badge

**Value**: The tree folds and unfolds; it lands sensibly whether the org is small or huge.
**Path**: Chevron toggles a node's expanded state (client-only show/hide). Default fully expanded; if total subtree size ≥ **100**, initialize collapsed to direct reports. Add **Expand all / Collapse all**. Collapsed rows show a **"N below"** badge (from Slice 2 counts), hidden when expanded. Persist per-node expanded state within the session so it doesn't reset on re-render.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring` (+ UI).
**Acceptance criteria**: Chevron folds/unfolds only (never navigates); <100 lands fully expanded, ≥100 lands collapsed-to-directs; Expand/Collapse all work; badge shows only while collapsed. **Present and confirm before coding.**
**RED**: Unit-test the pure `defaultExpansion(totalCount, threshold)` decision (99 → all, 100 → directs-only) and any expand-state reducer.
**GREEN**: Wire expansion state + controls + badge.
**MUTATE / KILL**: Kill survivors (threshold boundary `>=` vs `>`, badge-on-expanded leak).
**REFACTOR**: If valuable.
**Done when**: Decision tests green + verified in preview across a small and a 100+ org, human approves commit.

### Slice 5: Click-to-open (row vs chevron) matching today's behavior

**Value**: Tapping a person opens their page exactly like the list, with the chevron as a separate, non-navigating target.
**Path**: Row body is a `<Link>` to `/producer/downline/{id}` (indirect people open the existing view-only page — no behavior change from today); chevron `stopPropagation`s and only toggles. Ensure fat-finger safety: distinct, adequately sized hit areas on mobile.
**Required implementation skills**: `refactoring` (+ UI).
**Acceptance criteria**: Row tap navigates to the correct person (direct and indirect); chevron tap never navigates; both comfortably tappable on a phone. **Present and confirm before coding.**
**Verification**: Live preview — open a direct and an indirect person; toggle chevrons without navigating; check mobile hit-targets.
**Done when**: Verified in preview, human approves commit.

### Slice 6: Search — filter to matches + ancestor chain

**Value**: Searching locates a person and shows exactly where they sit in the org.
**Path**: Reuse the existing name/email search text. A pure helper takes the tree + query and returns the visible set = matching nodes plus all their ancestors, force-expanded; empty query → prior tree state restored (don't lose the user's manual expand/collapse).
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring` (+ UI).
**Acceptance criteria**: A deep match shows itself + its full parent chain, auto-expanded, others hidden; clearing restores the pre-search expansion state; matching is name+email substring like today. **Present and confirm before coding.**
**RED**: Unit-test the filter helper (match keeps ancestors; non-matching siblings hidden; multiple matches union their chains; empty query passthrough).
**GREEN**: Wire search into the tree.
**MUTATE / KILL**: Kill survivors (ancestors dropped, siblings leaked, case sensitivity).
**REFACTOR**: If valuable.
**Done when**: Filter tests green + verified in preview, human approves commit.

### Slice 7: Mobile responsive pass + empty/loading polish

**Value**: The tree is genuinely usable on a phone and degrades cleanly at the edges.
**Path**: Responsive rules — small per-level indent, **team IP only** per row on narrow screens, own-IP/pills revealed on the opened row; no horizontal scroll of the tree. Finalize the **empty state** ("No one in your downline yet") and the **loading skeleton**.
**Required implementation skills**: `refactoring` (+ UI).
**Acceptance criteria**: At 375px the tree reads cleanly with team IP per row and no horizontal scroll; empty and loading states render as specified. **Present and confirm before coding.**
**Verification**: Live preview at mobile + desktop widths (resize), including a no-downline account and the first-flip loading state.
**Done when**: Verified in preview at both widths, human approves commit.

## Pre-PR Quality Gate

Before each PR:
1. Mutation testing on every new pure helper (tree builder, rollup, sort, expansion decision, search filter) (`mutation-testing`).
2. Refactoring assessment (`refactoring`).
3. `npm test`, typecheck, and lint pass.
4. Live-preview walk-through of the Tree view as a **builder** (and, if reachable, the **owner** rooted at Wylie Hawkins): toggle, expand/collapse, search, click-through, mobile width.

## Open follow-ups (not this plan)

- **Graphical boxes-and-lines org chart** (pan/zoom canvas) as a v2 "big picture" mode — deliberately deferred; needs a graph library.
- **Peek / slide-over** on row tap (act on a person without leaving the tree) — nicer than navigating away, but its own build.
- **Timeframe toggle** on the tree (QTD/YTD/All-time IP) — MTD-only for now.
- **Metric switch** (IP ⇄ AP ⇄ dials) per row — single metric (IP) for now.
- **Recruits in the tree** — would require adding recruits to the list too, to keep the toggle consistent.

---
*Delete this file when the plan is complete. If `plans/` is empty, delete the directory.*
