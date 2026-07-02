# Plan: Discord Notifications and AP Leaderboards

Source spec: `/Users/genesis/Downloads/fable-discord-notifications-handoff.md`
Created: 2026-07-02. Style rule: NEVER use an em dash anywhere (code, comments, UI copy, SQL). Use periods, commas, or parens.

## Goal

Replace the single `person.discord_webhook_url` with a builder-facing Discord settings area:

1. Multiple webhook destinations per builder, each with a purpose (sales, daily / WTD / MTD / YTD leaderboards).
2. Team-scoped, submitted-AP-only leaderboards posted to Discord as edit-in-place messages.
3. Manual YTD AP baselines per producer (pre-app Discord totals).
4. A "Rebuild Discord Leaderboards" button.

Discord leaderboards use submitted AP only: `clients.annual_premium` where `sale_status = 'sale'`. Never issued premium, deposits, or IP.

## Product decisions locked for v1 (from the handoff's open questions)

- Timezone: all Discord leaderboards use `America/Chicago` (constant, not per-builder).
- Manual baselines apply to YTD only. Daily/WTD/MTD are app data only.
- No client PII in Discord messages (producer name, AP, carrier only).
- No custom HTTP destinations in this release. `provider` is `discord_webhook` only.

---

## Phase 0: Consolidated discovery (read this before every phase)

### Allowed APIs (verified to exist, with sources)

| API | Location | Notes |
|---|---|---|
| `getCurrentPerson(): Promise<Person \| null>` | `src/lib/auth.ts:37-50` | Resolves auth user to `person` row |
| `createClient()` | `src/lib/supabase/server.ts:5-28` | RLS-scoped authed client, must `await` |
| `createServiceRoleClient()` | `src/lib/supabase/server.ts:30-37` | RLS bypass, server only, not awaited |
| `isDiscordWebhook(url)` | `src/lib/actions/discord.ts:8-22` | Host/path safety rule. KEEP AS IS |
| `notifyNewClient(clientId)` | `src/lib/actions/discord.ts:55-99` | Current single-webhook notifier, to be refactored |
| `resolveWebhook(admin, startId)` | `src/lib/actions/discord.ts:24-47` | Upline walk, max 10 hops. Superseded by destinations |
| `saveClient(draft, clientId?)` | `src/app/producer/clients/_actions.ts:36-87` | Server action. INSERT path calls `notifyNewClient` best-effort (lines 79-83) |
| `computeLeaderboard(supabase, opts)` | `src/lib/producer/metrics.ts:495` | Org-wide. DO NOT call from Discord code (too heavy) |
| `dollarsToCents(v)` | `src/lib/producer/metrics.ts:42-45` | Internal today; export it in Phase 2 |
| `saleDay(c, tz)` | `src/lib/producer/metrics.ts:80-82` | `submit_date ?? date ?? created_at` fallback. Internal today; export it |
| `isSale(c)` | `src/lib/producer/metrics.ts:83-85` | Internal today; export it |
| `resolveRange(key, tz, ...)` | `src/lib/producer/metrics.ts:92-125` | RangeKeys: today/wtd/mtd/ytd. Monday week start. Internal today; export it |
| `zonedIsoDay(d, tz)`, `safeTz(tz)` | `src/lib/producer/time.ts` | Exported already |
| `isLeaderboardExcluded(id)` | `src/lib/producer/leaderboardExclusions.ts` | 9 hardcoded test/owner UUIDs. Apply to Discord leaderboards too |
| downline tree pattern | `src/app/api/cron/team-digest/route.ts:68-87` | `childrenOf` map plus `downlineOf(rootId)` DFS. COPY this pattern |

### Key data facts

- `clients.annual_premium` is `numeric` in DOLLARS. Convert with `dollarsToCents` for all math. Baselines are stored in CENTS, entered in dollars in the UI.
- `clients.sale_status` check constraint: `'in_progress' | 'missed' | 'sale'`. Only `'sale'` counts.
- `person` columns: `id, full_name, email, upline_id, is_builder, is_producer, is_owner, is_admin, is_super_admin, status ('active'|'removed'), discord_webhook_url`.
- `person_id` on clients defaults to `auth_person_id()`; producer attribution is by `clients.person_id`.
- Discord webhook message create with `?wait=true` returns the message JSON including `id`. Edit with `PATCH {webhook_url}/messages/{message_id}`. A 404 on edit means the message was deleted; recreate and store the new id.
- Every Discord payload must include `"allowed_mentions": { "parse": [] }`.

### Modified Next.js rules (this repo's Next 16.2.6, docs in `node_modules/next/dist/docs/`)

- Route handlers: `export async function GET(request: Request)` etc. in `route.ts`. Body via `await request.json()`.
- Dynamic params are a PROMISE: `{ params }: { params: Promise<{ id: string }> }` then `const { id } = await params`. Source: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` lines 84-97.
- `cookies()` / `headers()` are async.
- NEW ROUTES REQUIRE A DEV SERVER RESTART (known project gotcha).
- Server actions: file-level `'use server'`, must check auth inside each function.

### API route conventions (copy from `src/app/api/producer/profile/route.ts` and `src/app/api/producer/team/route.ts`)

```ts
const person = await getCurrentPerson();
if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
if (!person.is_builder) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
```

Responses are `{ ok: true, ... }` or `{ ok: false, error }`. Reads may use the authed client (RLS scopes person rows to self plus downline). Writes use `createServiceRoleClient()` pinned to authorized ids.

### UI conventions (copy from `src/components/producer/ProfileSettingsForm.tsx` and `BuilderSettingsForm.tsx`)

- Settings page `src/app/producer/settings/page.tsx` is SECTIONED, not tabbed: `<section className="mt-12">` with `<h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">` and `<p className="mt-2 max-w-2xl text-sm text-subtle">`.
- Builder-only sections wrap in `{person?.is_builder && (...)}` (page line 47).
- Forms: client components, fetch-based load/save with `loading, saving, error, saved` state. Field pattern: `<label className="block rounded-2xl border border-hairline bg-card p-5">`, input `className="mt-3 w-full bg-transparent text-lg font-medium text-ink outline-none placeholder:text-mute"`.
- Primary button: `rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-background transition hover:bg-accent-soft disabled:opacity-50`. Secondary: `rounded-full border border-hairline px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-mute`.
- Errors `<p className="text-sm text-neg">`, success `<span className="text-sm text-pos">Saved.</span>`, loading `<p className="mt-6 text-sm text-mute">Loading…</p>`.
- Design constraints (global): no pill badges with dots, no gradient text, no backdrop-blur, no glowing blobs. Plain type hierarchy.

### Anti-patterns to avoid (all phases)

- Do NOT invent Supabase client methods. Only `.from().select().eq().maybeSingle()`, `.insert().select().single()`, `.update().eq()`, `.upsert()`, `.delete().eq()` as seen in existing code.
- Do NOT call org-wide `computeLeaderboard` from Discord code.
- Do NOT treat `annual_premium` as cents.
- Do NOT let any Discord failure throw out of the sale save path.
- Do NOT return full webhook URLs from GET APIs after save (mask them).
- Do NOT use `params.id` without awaiting `params`.
- Do NOT use em dashes anywhere, including SQL comments and UI copy.

---

## Phase 1: Database migration

**File to create:** `supabase/migrations/20260702000100_discord_notifications.sql`

Newest existing migration is `20260701000100_npn_tracking.sql`, so this timestamp sorts correctly. Template for structure: `supabase/migrations/20260608000100_lead_purchases.sql` (comment header, `create table if not exists`, `updated_at` trigger via `set_updated_at()`, `alter table ... enable row level security`, `drop policy if exists` before `create policy`).

Create exactly the three tables from the handoff spec (section "Database Changes"), with these repo-convention adjustments:

1. `notification_destinations` as specced (owner_person_id fk to person on delete cascade, provider check `('discord_webhook')`, purpose check `('sale_submitted','leaderboard_daily','leaderboard_wtd','leaderboard_mtd','leaderboard_ytd')`, label, url, enabled, created_by, timestamps) plus:
   - `updated_at` trigger `notification_destinations_updated_at` using `set_updated_at()`.
   - Index `notification_destinations_owner_purpose_idx on (owner_person_id, purpose, enabled)`.
2. `discord_leaderboard_messages` as specced (destination_id fk on delete cascade, period_type check `('daily','wtd','mtd','ytd')`, period_start, period_end, message_id, thread_id, last_payload_hash, last_updated_at, unique `(destination_id, period_type, period_start, period_end)`).
3. `leaderboard_ap_baselines` as specced (person_id fk on delete cascade, year, baseline_through_date, submitted_ap_cents check >= 0, sales_count check >= 0, notes, entered_by, timestamps, unique `(person_id, year)`) plus `updated_at` trigger.
4. Performance index: `create index if not exists clients_person_sale_submit_idx on clients(person_id, sale_status, submit_date);`
5. Backfill (from handoff): insert into `notification_destinations` one `sale_submitted` row per person with a non-empty `discord_webhook_url`, label `'Sales'`, enabled true, `on conflict do nothing`.
6. RLS: enable RLS on all three tables. Policies: admin-only SELECT (`for select to authenticated using (is_admin())`, same style as `20260608010300_login_event.sql`). NO authenticated write policies. All app reads/writes go through service-role API routes (this is the handoff's "simplest safe implementation").
7. Keep `person.discord_webhook_url` (do not drop). New code prefers `notification_destinations`.

**Verification checklist**
- `ls supabase/migrations/` shows the new file sorting last.
- SQL is idempotent: re-running the file is safe (`if not exists`, `drop policy if exists`).
- Grep the file for `em dash` characters and for `provider in ('discord_webhook')`.
- Do NOT apply to the shared production Supabase yet. Application happens in Phase 5 with user confirmation (shared backend, live users).

---

## Phase 2: Server logic (leaderboard helper + discord refactor + sale flow wiring)

### 2a. Export existing metric helpers

**File:** `src/lib/producer/metrics.ts`. Add `export` to `dollarsToCents`, `saleDay`, `isSale`, `resolveRange` (no behavior changes). They are currently internal functions at lines 42-45, 80-82, 83-85, 92-125.

### 2b. New helper: `src/lib/producer/submitted-ap-leaderboard.ts`

```ts
export const DISCORD_LEADERBOARD_TZ = "America/Chicago";

export type SubmittedApLeaderboardRow = {
  person_id: string;
  full_name: string;
  submitted_ap_cents: number;
  sales_count: number;
};

export type DiscordPeriod = "daily" | "wtd" | "mtd" | "ytd";

export async function computeSubmittedApTeamLeaderboards(
  admin: SupabaseClient,
  opts: { ownerPersonId: string; periods: DiscordPeriod[]; tz?: string },
): Promise<Map<DiscordPeriod, { from: string; to: string; rows: SubmittedApLeaderboardRow[] }>>
```

Implementation requirements:
1. Fetch all person rows once with the service-role client: `select("id, full_name, upline_id, status")`. Build `childrenOf` map and `downlineOf(rootId)` DFS. COPY the pattern from `src/app/api/cron/team-digest/route.ts:68-87`.
2. `teamIds = new Set([ownerPersonId, ...downlineOf(ownerPersonId)])`, filtered to `status = 'active'` and `!isLeaderboardExcluded(id)`.
3. Resolve period ranges with the exported `resolveRange`: map `daily -> "today"`, `wtd -> "wtd"`, `mtd -> "mtd"`, `ytd -> "ytd"`, tz `America/Chicago`.
4. ONE clients query covering the widest range (YTD from). Select `person_id, annual_premium, sale_status, submit_date, date, created_at` with `.in("person_id", [...teamIds])` chunked if team > 100 ids (use chunks of 100 and merge). Filter `sale_status = 'sale'` in the query.
5. Bucket each client row into every requested period by comparing `saleDay(c, tz)` against each period's from/to strings (ISO date string compare is safe).
6. YTD baselines: fetch `leaderboard_ap_baselines` rows for `teamIds` where `year = current Chicago year`. For a producer WITH a baseline row: YTD = `baseline.submitted_ap_cents + sum(app sales where saleDay > baseline_through_date)`, sales count = `baseline.sales_count + count(same)`. Producers without a baseline: app data only. Baselines apply ONLY to the ytd period.
7. Include every team member with activity; drop all-zero rows except always include rows with baseline AP. (Simplest: build rows from the aggregate map, include baseline-only producers, filter out rows where both cents and count are 0.)
8. Sort: `submitted_ap_cents` desc, then `sales_count` desc, then `full_name` A-Z.

### 2c. Refactor `src/lib/actions/discord.ts`

Keep `isDiscordWebhook` untouched. Add:

1. `maskWebhookUrl(url: string): string` returns `discord.com/api/webhooks/...` plus last 4 chars, e.g. `discord.com/api/webhooks/…abcd`.
2. `resolveDiscordDestinations(admin, startPersonId, purposes)`: walk UP the upline chain from `startPersonId` (max 15 hops, same loop style as old `resolveWebhook` at lines 29-47) collecting ancestor ids INCLUDING the start person. Then one query: `from("notification_destinations").select("*").in("owner_person_id", chainIds).in("purpose", purposes).eq("enabled", true)`. Validate each `url` with `isDiscordWebhook` before use. Return destinations grouped by owner and purpose.
3. `postDiscord(url, payload)`: POST JSON with `allowed_mentions: { parse: [] }` merged in. `postDiscordAndGetMessageId(url, payload)`: same but append `?wait=true` (respect existing query strings) and return `json.id` or null. `editDiscordMessage(url, messageId, payload)`: PATCH `{url}/messages/{messageId}` (strip any query string from url first), return response status.
4. `sendSaleSubmittedMessage(destination, sale)`: format (keep no-PII posture, same data as today at lines 77-89):
   ```
   🎉 **{producer full_name}** just signed a new client! ${AP} AP · {carrier}
   ```
5. `formatLeaderboardMessage(period, throughDate, rows)`: plain content, per the handoff format:
   ```
   {Daily|Week-To-Date|Month-To-Date|YTD} Submitted AP Leaderboard
   Through July 2, 2026

   1. Austin Smith - $52,400 AP - 31 sales
   ```
   Dollar formatting: `(cents/100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })`. Cap at top 25 rows. If no rows: "No submitted sales yet for this period."
6. `createOrUpdateLeaderboardMessage(admin, destination, period, range, rows)`:
   - Compute a simple payload hash (content string length + a cheap string hash, or just the content itself compared later; store content hash in `last_payload_hash`).
   - Look up `discord_leaderboard_messages` by `(destination_id, period_type, period_start, period_end)`.
   - No row: POST with `?wait=true`, store `message_id` and hash (skip storing if no message id returned).
   - Row exists and hash unchanged: skip.
   - Row exists: PATCH edit. On 404, POST a new message and update the stored `message_id`.
7. `rebuildDiscordLeaderboards(ownerPersonId, periods)`: resolve that owner's OWN leaderboard destinations (query destinations where `owner_person_id = ownerPersonId` directly, not the upline walk), compute via `computeSubmittedApTeamLeaderboards`, then `createOrUpdateLeaderboardMessage` per destination/period. Group destinations by period purpose: `leaderboard_daily -> daily`, etc.
8. Rewrite `notifyNewClient(clientId)` (keep the export name and signature so `_actions.ts` keeps working):
   - Same guards as today (lines 56-72): current person, client exists, `sale_status === "sale"`.
   - `resolveDiscordDestinations` for ALL FIVE purposes up the chain.
   - Send the sale message to every enabled `sale_submitted` destination (including the legacy backfilled ones).
   - For each DISTINCT owner in the chain that has leaderboard destinations: compute their team leaderboards once (periods limited to purposes they actually have) and create/update messages.
   - Everything wrapped so no failure escapes (the caller already try/catches at `_actions.ts:79-83`, keep that too).

**Verification checklist**
- `npx tsc --noEmit` (or `npm run build`) passes.
- Grep: `allowed_mentions` appears in every Discord POST/PATCH payload builder.
- Grep: no remaining callers of the old `resolveWebhook` (delete it or leave unexported and unused; prefer delete).
- `notifyNewClient` still exported with the same signature; `src/app/producer/clients/_actions.ts` unchanged in this phase.
- No em dashes introduced.

---

## Phase 3: API routes

All new routes under `src/app/api/producer/discord/`. Copy auth/response conventions from `src/app/api/producer/profile/route.ts` (including its `errMessage` helper). All are builder-gated (`person.is_builder`) except where noted; admins (`person.is_admin || person.is_super_admin`) may also pass the gate. RESTART THE DEV SERVER after creating routes.

### 3a. `destinations/route.ts`

- `GET`: list current person's destinations (`owner_person_id = person.id`) via service role. Return each as `{ id, purpose, label, enabled, masked_url, created_at, updated_at }`. NEVER the full url.
- `POST`: body `{ purpose, label, url, enabled? }`. Validate purpose against the five allowed values and `isDiscordWebhook(url)` (400 on failure). Insert with `owner_person_id = person.id`, `created_by = person.id`, `provider = 'discord_webhook'`. Return the masked row.

### 3b. `destinations/[id]/route.ts`

- `PATCH`: body may contain `{ label, purpose, enabled, url }`. Load the row by id via service role, 404 if missing, 403 unless `owner_person_id === person.id` or caller is admin. Validate url if present. Update and return masked row.
- `DELETE`: same ownership check, then delete.
- Params are a Promise: `const { id } = await params;` with type `{ params: Promise<{ id: string }> }`.

### 3c. `destinations/[id]/test/route.ts`

- `POST`: ownership check as above, then send `{ content: "Test message from All Star OS", allowed_mentions: { parse: [] } }` to the stored url. Return `{ ok: true }` or the Discord status text as the error.

### 3d. `ap-baselines/route.ts`

- `GET`: return every editable producer for the caller. Use the AUTHED client roster query pattern from `src/app/api/producer/team/route.ts:24-34` (`from("person").select("id, full_name, is_builder, is_producer, status").eq("status","active").or("is_producer.eq.true,is_builder.eq.true")`, RLS scopes it to self plus downline). Merge with `leaderboard_ap_baselines` rows (service role) for the current Chicago year. Shape: `{ person_id, full_name, baseline: { id, submitted_ap_cents, sales_count, baseline_through_date, notes, updated_at } | null }`.
- `POST`: body `{ person_id, year?, baseline_through_date, submitted_ap_dollars, sales_count, notes? }`. Year defaults to current Chicago year. AUTHORIZATION: `person_id` must be visible to the caller via the authed client (`from("person").select("id").eq("id", person_id).maybeSingle()`; RLS returns null if not self/downline; admins see all). Convert dollars to cents with `Math.round(n * 100)`, reject negatives and invalid dates. `upsert` with `onConflict: "person_id,year"`, set `entered_by = person.id`. Return the saved row.

(A separate PATCH by id is unnecessary since upsert covers edits; skip `ap-baselines/[id]` unless trivial.)

### 3e. `rebuild/route.ts`

- `POST`: body `{ periods?: ["daily","wtd","mtd","ytd"] }`, default all four. Validate values. Call `rebuildDiscordLeaderboards(person.id, periods)`. Return `{ ok: true, updated: <count of messages touched> }` (have the lib function return a count).

**Verification checklist**
- Restart dev server, then `curl -s http://localhost:3000/api/producer/discord/destinations` returns 401 JSON (not HTML) when unauthenticated.
- Grep every `[id]/route.ts` for `await params`.
- Grep responses for `url` to confirm only `masked_url` is returned.
- `npm run build` passes.

---

## Phase 4: Builder settings UI

### 4a. New component `src/components/producer/DiscordSettingsSection.tsx` (client component)

One parent client component with three stacked sub-blocks (plain type hierarchy, no tabs), following the fetch-based form pattern from `ProfileSettingsForm.tsx` (`loading/saving/error/saved` state, same input/button classes from Phase 0):

1. **Webhook destinations.** List existing destinations: label, purpose (human names: Submitted Sales, Daily Leaderboard, Week-To-Date Leaderboard, Month-To-Date Leaderboard, Year-To-Date Leaderboard), masked URL in `font-mono text-mute`, enabled toggle (a plain button or checkbox, no pill chips), Test button, Delete button (confirm with a simple inline "Really delete?" second click). Add-destination form: label text input, purpose `<select>` styled like inputs, webhook URL input with placeholder `https://discord.com/api/webhooks/…`. After save the URL input clears and the list shows only the masked value. Replace = delete plus re-add, or PATCH with a new URL via an inline "Replace URL" input per row (keep it simple: a Replace button that reveals a URL input for that row).
2. **Manual YTD starting totals.** Table of every producer from `GET ap-baselines` with columns: Producer, Baseline AP (dollars input), Baseline Sales, Through Date (date input), Notes, Last Updated. Save per row (POST upsert). Explanatory copy: "Only for submitted AP tracked in Discord before this app. YTD adds this baseline to app sales after the through date." Enter dollars, store cents (the API converts).
3. **Rebuild leaderboards.** One primary button "Rebuild Discord Leaderboards" that POSTs to `rebuild` with all four periods, shows "Rebuilding…" while pending and "Updated N Discord messages." on success. Helper copy: "Run this after changing baselines."

### 4b. Wire into the settings page

**File:** `src/app/producer/settings/page.tsx`. Add a builder-gated section (same wrapper as Builder details at line 47) BELOW Builder details:

```tsx
{person?.is_builder && (
  <section className="mt-12">
    <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">Discord</h2>
    <p className="mt-2 max-w-2xl text-sm text-subtle">
      Post sales and team leaderboards to your Discord channels. Leaderboards track submitted AP for you and your full downline.
    </p>
    <DiscordSettingsSection />
  </section>
)}
```

### 4c. Retire the old single-webhook field

**File:** `src/components/producer/BuilderSettingsForm.tsx`. Remove the Discord webhook label/input block (around lines 145-160) and stop sending `discord_webhook_url` in its POST body. Leave `/api/producer/profile` tolerant of the field (no change needed there). The migration backfilled existing values into `notification_destinations`, so nothing is lost.

**Verification checklist**
- `npm run build` and lint pass (watch for unescaped apostrophes in JSX copy, use `&apos;` or rewrite).
- Preview: settings page renders the Discord section for a builder account and hides it for a plain producer. NOTE project gotcha: preview_eval cannot drive React clicks in this modified Next.js; verify via build, screenshots, and real-browser logs.
- No design-constraint violations: no pill/dot badges, no gradient text, no backdrop-blur.
- No em dashes in UI copy.

---

## Phase 5: Apply, verify, QA

1. **Apply the migration** to the shared Supabase project via the Supabase MCP `apply_migration` (or hand the SQL to Nick for the SQL editor). This is the PRODUCTION shared backend; confirm with the user before applying. After applying, verify with `list_tables` that the three tables exist and `execute_sql` that the backfill copied every non-empty `person.discord_webhook_url` into `notification_destinations`.
2. **Build gates:** `npm run build`, `npx tsc --noEmit`, lint.
3. **Anti-pattern greps:** no em dash characters in changed files; `allowed_mentions` present in all payloads; no route returning raw `url`; `await params` in dynamic routes; no `computeLeaderboard(` import in discord code.
4. **QA scenarios** (from the handoff, adapted):
   - Create a destination with an invalid URL: 400 with a clear message.
   - Create all five destination types with a real test webhook; hit Test on each.
   - Save a client with `sale_status = 'sale'` on a test producer: sale message posts to every enabled sales destination up the chain, and daily/WTD/MTD/YTD messages appear once each.
   - Save a second sale: leaderboard messages are EDITED (same message id), not re-posted.
   - Enter a YTD baseline for a producer (through yesterday), Rebuild: YTD shows baseline plus post-baseline app sales only; a sale dated before the through date is not double counted.
   - Delete the Discord leaderboard message in Discord, Rebuild: app re-creates it and stores the new id.
   - Two separate builders with their own destinations: leaderboards stay team-scoped, no cross-team leakage.
   - Discord unreachable (bad but well-formed URL): client save still succeeds.
5. **Deploy note:** open browser tabs run old code until hard refresh (project gotcha). After pushing, verify the prod deploy SHA and hard-refresh before judging results.

## Rollout mapping to the handoff

- Handoff Phase 1 = plan Phases 1 + 3a-3c + 4 (destinations parts).
- Handoff Phase 2 = plan Phase 2.
- Handoff Phase 3 = plan Phases 3d-3e + 4a block 2-3.
- Handoff Phase 4 (health status, retries, custom HTTP) = NOT in this plan, future work.
