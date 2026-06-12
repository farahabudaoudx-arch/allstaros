# All Star OS — Pre-Launch Roadmap & Session Summary

**Date:** 2026-06-11
**Context:** ~100 users from a partner company are onboarding in roughly two weeks. This is a **batch drop** (everyone arrives at once, on the company's recommendation), not a slow trickle. This document consolidates everything discussed and decided in this session, what we're rolling out, and what still needs to be implemented.

> This file supersedes the earlier `LAUNCH_PREP.md` — everything from that list is folded in below.

---

## 0. The Operating Principle

The guiding rule for the whole launch: **build/verify what protects us when 100 real people show up at once, skip what only matters at large scale or for big teams.** Most of the "you need X" advice circulating online is drawn for teams operating at scale; we take the few layers that earn their keep at our size and deliberately skip the rest. Do each protective check **once, well, before the drop** — we are not building an always-on factory.

**A pattern we noticed reviewing the hype:** most "you need this tool" content follows the same recipe — *a real fear + a real-ish tool + a leap connecting them that doesn't actually hold + a follow/DM ask.* The **fear** is usually worth keeping; the **specific product** rarely is. Take the lesson, leave the panic.

---

## 1. Launch-Readiness Checklist (what we're rolling out)

Status legend: 🔲 todo · 🟡 in progress · ✅ done · ⏭️ deferred

### Tier A — Do before the drop (cheap, high-leverage)

**1. Error tracking (Sentry)** 🟢 (verified end-to-end — needs DSN set in Vercel for prod)
A "smoke alarm" for the app — instantly tells *you* when something breaks for a user instead of waiting for an angry email. Critical because if it breaks for one of the 100, it likely breaks for all of them at once. Sentry free tier; ~couple hours to wire up.
> **Done 2026-06-12:** `@sentry/nextjs@10` installed (officially supports Next 16). Wired via native instrumentation hooks — `src/instrumentation.ts` (server `register()` + `onRequestError`), `src/instrumentation-client.ts` (client init + `onRouterTransitionStart`), `src/sentry.server.config.ts`, `src/sentry.edge.config.ts`. **Deliberately skipped `withSentryConfig`** (the Turbopack/webpack build plugin) to keep the modified-Next build bulletproof — runtime error capture is the smoke alarm; source-map upload is an optional later add. **PII-safe:** `sendDefaultPii: false`, no Session Replay, errors-only (`tracesSampleRate: 0`) to conserve free-tier quota. **Dormant until `NEXT_PUBLIC_SENTRY_DSN` is set.** Verified: clean boot, dormant w/o DSN, init activates w/ DSN, typecheck + lint pass, no console/server errors.
> **Live test passed 2026-06-12:** with Nick's real DSN added locally, the client SDK initialized and a forced unhandled error transmitted to Sentry (`POST …ingest.us.sentry.io/…/envelope/ → 200`, project `4511554268692480`). Confirmed the manual wiring actually delivers events. Local `.env.local` restored to dormant afterward. (Bonus: a scary-looking dashboard re-fetch loop during the test was a dev-error-overlay artifact, not a real bug — a clean load makes only ~10 normal API calls.)
> **Nick to finish:** add the DSN to `NEXT_PUBLIC_SENTRY_DSN` in Vercel (Production + Preview) and redeploy — that's the only step left to make it live for the 100 users.

**2. Lightweight product analytics (PostHog)** 🟢 (verified live in prod)
See whether people are actually *getting through* — signup, underwriting wizard completion, carrier-link clicks — vs. silently bouncing. PostHog free tier, core funnel events only.
> **Done 2026-06-12:** `posthog-js` installed; init in `src/instrumentation-client.ts` (alongside Sentry). **Privacy-first for an insurance app:** autocapture OFF, session recording OFF, anonymous profiles only — we capture ONLY the explicit funnel events, never raw inputs or screen contents. `src/lib/analytics.ts` is the only touchpoint (`track()` / `capturePageview()` — no-op without a key). Funnel events wired: **pageviews** (`PostHogPageView` client component in the root layout, pathname-only to avoid ids in URLs), **`signup_completed`** (JoinWizard success), **`underwriting_wizard_completed`** (wizard results — counts/toolkit only, no medical text), **`carrier_link_clicked`** (carrier tile). Dormant + verified: with no key, zero PostHog network calls and the app runs clean; typecheck + lint clean. (Side find: the producer dashboard re-fetches every ~2s while idle — pre-existing re-render loop, spawned as its own task.)
> **Live + verified 2026-06-12:** Nick set `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` + `NEXT_PUBLIC_POSTHOG_HOST` in Vercel and deployed (note: code env-var name was aligned to `…PROJECT_TOKEN` to match what he set). Live test with the real token: PostHog `config.js` loaded for the project and events `POST …us.i.posthog.com/e/ → 200` (the `$pageview` landing). Session Replay turned ON per Nick's choice, **PII-masked** (`maskAllInputs` + `maskTextSelector: "*"`). Local `.env.local` restored to dormant. ✅ Done.

**3. Critical-path hardening (test drive before they arrive)** ✅
Error tracking tells you *when* something breaks; it doesn't stop it. Walk the exact paths the 100 users will: signup → underwriting wizard → carrier links → anything that writes to the shared Supabase backend. Shake out day-one embarrassments. *(This is the "does it actually work" pass — separate from the tidiness audit in §5.)*
> **Verified 2026-06-12:** signin/dashboard/portal render (200, no console errors); underwriting wizard ran a full Opus extraction with sharp clinical coding + carrier grid; all 11 carrier links resolve to real agent portals; Sidekick AI returned a coherent answer (200); Supabase read seam (tracker/leaderboard/team) all 200; live Supabase **write** (tracker upsert as Dev Builder) succeeded, persisted, read-back matched, row neutralized. Minor tidy-up noted: carrier links use `target="_blank"` without `rel="noopener"`.

**4. Static analysis gate (lint + typecheck)** ✅
A required lint/typecheck pass before anything ships. Near-free, catches a class of dumb breakage automatically.
> **Done 2026-06-12:** Discovered Next 16 **`next build` no longer runs ESLint** — lint had been invisible (35 errors hiding). Typecheck was already a hard gate via `next build` (and passes). Added `typecheck` + `check` npm scripts. Lint now **0 errors / 36 warnings**: fixed the trivial real ones (3 unused vars, 1 stale eslint-disable) and set the newer opinionated react-hooks/compiler rules + deliberate `any`s to *warn* (advisory, verified non-breaking — e.g. the 4 ref-during-render hits are all on the wizard that ran flawlessly in #3). Enforcement: `build` script is now `eslint && next build` (blocks Vercel deploys on any lint **error**), plus a `.github/workflows/check.yml` running `npm run check` on push/PR. Full prod build verified green (also confirms Sentry doesn't break the build). Post-launch: tighten warns back to errors + fix properly.

**5. Security pass — ELEVATED for our domain** ✅
> **Verified 2026-06-12:** no secrets leak to client bundle (only `NEXT_PUBLIC_*` exposed; service-role/Anthropic/OpenAI/Resend keys server-only, never imported into `"use client"`); RLS solid on all PII tables (owner-scoped writes via `auth_person_id()`, downline reads via `can_view()`, admin/audit tables gated); dev-login double-gated and safe in prod. Code-level gaps are tracked as #8 (rate limit) and #9 (logging). **Nick to do in dashboards:** leave `DEV_LOGIN_SECRET` unset (never set `DEV_LOGIN_ENABLED=true`) in prod; confirm seeded dev accounts absent from prod Supabase; consider Supabase auth rate-limiting.

**The single most important item.** We hold personal/insurance info (PII), invite-only auth, and a Supabase backend **shared with the Agency app** — a mistake here leaks across *two* apps.
- **Tool to use:** Claude Code's built-in `/security-review` (first-party, available now, just token cost — *not* the Enterprise-only "Claude Security" product). Scans for injection, **auth bypass / privilege escalation** (the big one for our multi-role + shared-backend setup), SSRF, crypto/deserialization; self-verifies findings to cut false alarms.
- Also confirm RLS (row-level access rules) on shared tables and that no secrets are exposed in the client bundle.
- Optional companion: the GitHub Action that auto-reviews every change before ship (pairs with #10).

**6. Rollback plan (Vercel instant rollback)** ✅ (documented — Nick to eyeball the dashboard once)
When a bug hits all 100 at once, you want a calm one-click "undo," not a scramble. Vercel rollback is ~one click — confirm the flow and know where the button is *before* day one.
> **Done 2026-06-12:** wrote `INCIDENT_RUNBOOK.md` with the exact current Vercel Instant Rollback flow (overview → Production Deployment tile → **Instant Rollback** → pick deployment → **Confirm Rollback**; instant, no rebuild). Captured the key gotcha: **after a rollback Vercel turns OFF auto-deploy** of the prod branch until you hit **Undo Rollback** — and that rollback reverts the build, not env vars. Also covers where to look (Sentry/Vercel runtime logs/Supabase logs). **Nick to do:** open the Vercel dashboard once and locate the Instant Rollback button so it's muscle memory before launch.

**7. Targeted tests on highest-stakes logic** 🔲
Not chasing coverage — protecting the spots where a *silent wrong answer* hurts: underwriting knockouts/carrier matching, and the Supabase seam where All Star OS and Agency meet.

**8. Usage cap / rate limit on the AI features** 🟢 (migration applied + enforcement tested; needs code deploy to go live)
> **Enforcement verified 2026-06-12:** migration applied to the shared Supabase; ran a live test against the real table — temporarily set the Sidekick daily cap to 3, fired 4 questions: calls 1-3 answered (200), call 4 returned **429 "You've reached today's limit… resets tomorrow"** and was blocked *before* any paid AI call. Cap restored to 120. **Last step: deploy the code** (still uncommitted on `dev`) for it to apply to real users.
Three AI chats let users type freely and they call paid APIs (Anthropic + OpenAI). With 100 users arriving at once, one heavy user — or a bug — could hammer them and run up a surprise bill or degrade service. No rate limiting exists today. Add a per-user cap on the Sidekick, Portal Help, and Underwriting endpoints. **Ideally enforce a per-producer dollar/token ceiling so cost stays predictable.**
> **Done 2026-06-12:** built a Supabase-backed usage ledger + limiter. New table `ai_usage_log` (migration `20260612000100_ai_usage_log.sql`) is the source of truth — counting rows works across Vercel's many serverless instances (in-memory counters can't). `src/lib/ai/usage.ts`: per-user **daily caps per tool** (sidekick 120 / underwriting_analyze 60 / underwriting_chat 60) + a **20-req/60-sec burst cap** across all tools, returning HTTP 429 + `Retry-After`. Wired into `/api/allstar-ai` (Sidekick + Portal Help, same endpoint), `/api/underwriting/analyze`, and `/api/underwriting/chat` (records both Opus calls). Each call also records token counts + **estimated cost** → turns §3's guess into real data and lays the foundation for #9. **Fail-open by design** (missing table / DB error ⇒ allow) so it can ship before the migration and never takes the assistant down — **verified**: with the table absent both endpoints still return 200 and log a graceful "ignored" error. Also fixed the stale `gpt-4o-mini` comment (§5 cleanup) in the analyze route. Typecheck + lint clean.
> **Nick to finish:** apply the migration (Supabase SQL editor → run `supabase/migrations/20260612000100_ai_usage_log.sql`, or `supabase db push`). Until then the cap is dormant (fail-open). After it's applied, we run a live enforcement test (temporarily lower a limit, fire requests, confirm the 429).

**9. Keep a record of AI conversations** 🟡 (code complete — needs migration applied to activate)
If someone coaxes a wrong or off-compliance answer out of the AI (e.g. tricks it into recommending term life, or giving regulatory advice), you want to see what was asked/answered. Matters more in insurance than most fields. Lightweight logging of prompts + responses. *(Also turns the cost estimate in §3 from a guess into real data.)*
> **Done 2026-06-12 (per Nick's decision):** log the **Sidekick only**; the **Underwriting Wizard is deliberately NOT logged** because its input is client medical notes (PII) we choose not to store (underwriting still records cost/usage metadata in #8, just no text). New table `ai_conversation_log` (migration `20260612000200_ai_conversation_log.sql`), **admin-read-only** for compliance review, kept separate from the usage ledger so the free-text can be purged on its own retention schedule. `src/lib/ai/conversation.ts` logs question + answer (and flags underwriting redirects) from `/api/allstar-ai`; best-effort, **fail-open** (missing table ⇒ chat still works) — verified. Typecheck + lint clean.
> **Migration applied 2026-06-12.** Table is live; Sidekick conversations will be logged as soon as the code deploys (still uncommitted on `dev`).

### Tier B — Do soon (a bit more thought, not day-one blockers)

**10. Deploy habit: preview first, then promote** 🔲
With 100 people on the live site, don't push changes straight to production. Vercel already builds a free private *preview* of every change — click through it, confirm it works, *then* promote. Process, not a build. Pairs with #6 (rollback).

**11. Database query cleanup (real issues found in audit)** 🔲
Won't crash at 100 users, but tables grow with the business and the worst offenders sit on pages everyone loads. Connection pooling is a **non-issue** (Supabase handles it). `SELECT *` is trivial — skip.
- **Do now (~15 min):** ✅ **Done 2026-06-12**
  - ✅ Capped the **dashboard recruits query** at 200 (`ROSTER_LIMIT`) with an honest "showing the 200 most recent" note when hit — `src/app/dashboard/page.tsx`. Renders 200, lint/typecheck clean.
  - ✅ Added missing index `(person_id, created_at desc)` on `clients` — migration `20260612000300_clients_person_created_idx.sql`. **Nick to apply** (with the other two new migrations).
- **Do soon:**
  - Bound the **leaderboard** query (`src/lib/producer/metrics.ts` ~line 508) — fetches ALL clients org-wide; needs a date window or aggregation.
  - Cap the **team roster** (`src/app/api/producer/team/route.ts`) and **admin recruits** (`src/app/admin/people/recruits/page.tsx`) queries.
- **Skip for now:** Discord upline N+1 walk (`src/lib/actions/discord.ts`, ≤10 queries/sale, fine at this scale); `select('*')` on single recruit row (`src/lib/actions/messages.ts`, trivial).

---

## 2. Explicitly Skipping (with reasoning)

These solve scale / multi-team / multi-service problems we don't have as one app + a small team. Logged so we don't re-litigate them.

- **Datadog, Grafana, OpenTelemetry** — observability for teams at scale.
- **Data warehouse + reverse ETL** — data infra for when analytics outgrows PostHog.
- **AI support agent** — you'll be support for the first hundred (correct).
- **Weekly growth dashboards** — premature.
- **Full staging environment + slow/canary rollouts + infrastructure-as-code** — even the source video calls these overkill for a solo builder; our infra is managed (Vercel + Supabase). The lightweight "practice copy before live" is already covered by Vercel previews (#10). Revisit only with a much larger, deeply-dependent user base.
- **Heavyweight AI guardrails library (e.g. NeMo Guardrails)** — we DO have three free-form AI chats, but all are text-in/text-out with **no tools, no DB writes, no access to money or other users' data** — the AI has no keys to steal with, so the "$50k theft" scenario doesn't map. Existing built-in rules + input limits + hallucination filters are "good enough" for launch. The real (smaller) risk — a user tricking the AI into a wrong/off-compliance answer — is mitigated by #8/#9. Revisit the library only if we ever give the AI real actions (touch data/money).

---

## 3. Hosting & Running Cost (estimate)

Hosting is pocket change; the AI usage is the only real variable.

| Component | Cost | Notes |
|---|---|---|
| Vercel (hosting) | ~$20/mo flat | whole app |
| Supabase (backend + DB + daily backups) | ~$25/mo flat | paid tier worth it for backups w/ PII |
| **Fixed infra subtotal** | **~$45/mo** | ~$0.45 per producer across 100 |
| AI — per typical producer | ~$3.50–$5/mo | coach/help chat ~$2 + underwriting ~$1.50 + pennies embeddings |
| AI — heavy producer | ~$10–15/mo | lives in the chatbots |

**Whole company (100 users), normal month: ~$350–450/mo, up to ~$650 heavy.** Almost all of it is AI, not hosting.

**Model pricing (confirmed):** Haiku 4.5 = $1 in / $5 out per million tokens; Sonnet 4.6 = $3 / $15; Opus 4.7 = $5 / $25.

> Don't run on free tiers to save the ~$25 — the paid Supabase tier is what gives daily backups, which matters with 100 people's PII. Items #8 (cap) and #9 (logging) turn this estimate into a real, enforced budget.

---

## 4. AI Model Strategy & Cost Optimization

**Current state of the three AI tools:**
1. **Sidekick** (producer/builder knowledge-base coach, `/allstar-ai`) → **Haiku 4.5** (already cheap — the floor).
2. **Recruit Help Assistant** (recruit portal "what's next", `/portal/help`) → **Haiku 4.5** (already cheap). *Distinct tool from Sidekick — different audience/page.*
3. **Underwriting Wizard** (`/underwriting`) → **Opus 4.7** (the only expensive one).

**Key insight:** two of three are already on the cheapest model. Only the underwriting wizard uses the pricey model, and that's the highest-stakes accuracy task (extract medical conditions from messy notes → match to the 287-condition carrier matrix). A wrong extraction = wrong carrier recommendation. Note: the carrier-matrix matching itself is **deterministic code**, not AI; the LLM only does the condition extraction, which already has a safety net (forced tool use + a post-filter that drops any condition not on the official list).

**Plan (in priority order):**

- ✅ **(a) Prompt caching — done 2026-06-12. Pure savings, zero quality change (verified).** Measured real token usage with the production prompts:
  - **Underwriting (Opus 4.7):** caching was already landing hits on the system prompt (~2.3k tokens), but the **~287-condition canonical list (~6k tokens) sat in the user message, uncached** — re-paid at full Opus price every call. **Fix:** moved the list into the cached system prefix (two breakpoints: instructions + per-toolkit list); only the client notes vary now. Verified: a repeat call now reads **8,587 tokens from cache (~0.1×)** and pays full price on just **29** (was re-writing ~6.8k at 1.25× every time). Extraction output **byte-identical** before/after. Because the wizard auto-runs analyze on every keystroke (many calls per note within the 5-min window), this saves ~$0.04/repeat-call on the most expensive path — recurring across 100 users.
  - **Sidekick / Portal Help (Haiku 4.5):** the existing cache marker is a **silent no-op** — the prompt is ~1,233 tokens, below Haiku's **4,096-token** minimum cacheable prefix, so `cache_creation`/`cache_read` are both 0. Extending caching here would require bloating the prompt past 4k for no real gain — Haiku is already the cheapest model ($1/$5). Left the (harmless) marker in place; documented as not-applicable.
  - **Key reference fact:** min cacheable prefix is **4,096 tokens on Opus 4.x / Haiku 4.5** (2,048 on Sonnet 4.6) — below that, `cache_control` silently does nothing. Confirm hits via `usage.cache_read_input_tokens > 0`.
- 🔲 **(b) Test a mid-tier model on the underwriting wizard — measure before deciding.** Run real client notes through Opus vs. Sonnet (and Haiku) using the **real production prompt/schema/post-filter**, compare extractions side-by-side, and only downgrade if accuracy holds. Do **not** swap blindly — this is the riskiest task. **This test is NOT YET RUN — to be done only on explicit go-ahead.**

> Decision principle: don't reflexively cheap out on the riskiest task to save a few hundred dollars. Cache for free now; treat any underwriting downgrade as an experiment that must prove equal accuracy first.

---

## 5. Code Health Audit (read-only, completed this session)

Ran a structural slop audit on ~28k lines of app code. **Verdict: NOT slop — clean, well-organized, disciplined.** Grade ≈ **A-minus.**

| Signal | Result | Read |
|---|---|---|
| Size/organization | 220 files, avg **127 lines/file**; only 1 file >1200 lines | 🟢 healthy, well-split |
| Duplication | **1.9%** (mostly admin-page boilerplate) | 🟢 low |
| Unused dependencies | **0 of 15** | 🟢 clean |
| Type discipline | only **12** `any` / 1 `@ts-ignore` in 28k lines | 🟢 excellent |
| Debug/TODO cruft | **0** TODO/FIXME, **0** stray console.logs | 🟢 disciplined |
| Dead code | **~930 lines across 11 unused files (~3%)** | 🟡 the one real finding |

**Limit of this audit:** it measured *tidiness* (duplication, dead weight, bloat, type discipline) — **not** correctness. Clean code can still have bugs; that's what #3 and a bug-focused `/code-review` are for. (User confirmed manual testing of features looked good — encouraging, but not a substitute for #3.)

### Cleanup backlog from the audit

**🔲 Split the one oversized file:** `src/components/producer/AnalyticsView.tsx` (1,452 lines). Not urgent — the only genuinely bloated file.

**🔲 Resolve ~11 dead-code files (~930 lines).** Each is either *unfinished* (build it/wire it) or *left-behind* (delete it). Decide per file:
| File | Lines | Likely |
|---|---|---|
| `src/components/BugReportModal.tsx` | 259 | orphaned component |
| `src/lib/emails/team-digest.ts` | 201 | email built, never wired |
| `src/components/TopBar.tsx` | 90 | leftover after refactor |
| `src/lib/emails/onboarding-started.ts` | 62 | email built, never wired |
| `src/lib/emails/bootcamp-started.ts` | 61 | email built, never wired |
| `src/lib/emails/graduation.ts` | 61 | email built, never wired |
| `src/lib/emails/new-recruit.ts` | 60 | email built, never wired |
| `src/components/producer/charts/Gauge.tsx` | 48 | orphaned component |
| `src/app/portal/_components/exam-fail-modal.tsx` | 45 | orphaned component |
| `src/app/producer/recruiting/CopyLink.tsx` | 33 | orphaned component |
| `src/proxy.ts` | 13 | possibly superseded middleware — verify before deleting |

> The cluster of unwired email templates suggests a notification feature that was built but never connected. Worth a decision: finish wiring (and they could power onboarding comms for the incoming 100) or remove.

**✅ Minor:** stale comment in `src/app/api/underwriting/analyze/route.ts` said the model is "gpt-4o-mini" — fixed to `Claude (Opus 4.7)` 2026-06-12 (while wiring #8).

---

## 6. Deferred Tasks & Notes

**🔲 Install two design skills (Impeccable + Taste-Skill).** Authorized by user, but the harness safety guardrail blocks Claude from installing externally-fetched executable code into the environment — by design, this must be run by Nick at the machine. Already have `emil-design-eng` installed. These are **polish, not launch-critical.** Full instructions saved in `NOTES_design-skills-install.md`. Quick version:
- **Impeccable** — `github.com/pbakaus/impeccable` (~35.8k stars; ships executable scripts) — layout/type/polish, brand + product modes.
- **Taste-Skill** (`design-taste-frontend`) — `github.com/leonxlnx/taste-skill` (text-only) — anti-slop; scoped to landing pages/marketing, NOT product UI.

---

## 7. Project Reference Facts

- **Code size:** ~27,900 lines of app code (TS/TSX in `src`), ~42k including styling/migrations/config/markdown. Plus a ~330KB underwriting data file (the carrier matrix) that sits outside the code count. **Normal-to-lean** for a real product with this feature set.
- **Underwriting carriers:** **FEX (final expense) = 11 carrier products** (across 7 actual insurance companies — American Amicable, Corebridge, and Transamerica each have multiple products); **SIUL (indexed UL) = 2 products** (Americo, Mutual of Omaha). Both run off the same **287-condition** table.
- **Stack:** modified Next.js, Supabase (shared with the Agency app), Vercel. Anthropic (Haiku 4.5 + Opus 4.7) + OpenAI embeddings for AI features. Invite-only email/password auth.

---

## 8. Consolidated Implementation Backlog (single actionable list)

**Before the drop (priority order):**
- [x] #5 Security pass — run `/security-review`, check RLS on shared tables, confirm no exposed secrets ← **most important** ✅ 2026-06-12
- [x] #3 Critical-path test drive (signup → wizard → carrier links → Supabase writes) ✅ 2026-06-12
- [x] #1 Wire up Sentry (error tracking) 🟡 wired 2026-06-12 — dormant until Nick sets `NEXT_PUBLIC_SENTRY_DSN` in Vercel
- [x] #4 Lint + typecheck gate ✅ 2026-06-12 — `npm run check`; `build` runs eslint; CI workflow added
- [x] #6 Confirm Vercel rollback flow ✅ 2026-06-12 — see `INCIDENT_RUNBOOK.md`; Nick to eyeball the dashboard once
- [x] #8 Per-user AI usage cap (ideally a $/token ceiling) ✅ 2026-06-12 — migration applied, enforcement live-tested (429 at limit); needs code deploy
- [x] #9 AI conversation logging ✅ 2026-06-12 (Sidekick only; UW excluded) — migration applied; logs once code deploys
- [x] #11 (do-now) Dashboard query row-cap + `clients (person_id, created_at)` index ✅ 2026-06-12 — index needs migration applied
- [x] #2 PostHog core funnel events ✅ 2026-06-12 — live in prod, verified (events 200 to PostHog)
- [ ] #7 Targeted tests on underwriting + Supabase seam
- [x] 4(a) Turn on / verify prompt caching on the AI tools ✅ 2026-06-12 — underwriting list now cached (8.5k tok/call from cache); Sidekick is too small to cache on Haiku (no-op, fine)

**Soon after:**
- [ ] #10 Adopt preview-first deploy habit
- [ ] #11 (do-soon) Bound leaderboard / team-roster / admin-recruits queries
- [ ] Cleanup: resolve 11 dead-code files; split `AnalyticsView.tsx`; fix stale gpt-4o-mini comment
- [ ] 4(b) Run the underwriting model-comparison test (Opus vs Sonnet vs Haiku) — **only on explicit go-ahead**

**Nick to run himself:**
- [ ] Install Impeccable + Taste-Skill design skills (see `NOTES_design-skills-install.md`)

**Data minimization (added 2026-06-12):**
- [x] Drop unused sensitive `clients` columns — `ssn`, bank (`routing_number`/`account_number`/`bank_name`), card (`cc_number`/`cc_expiry`/`cc_cvv`/`cc_name`), `payment_method`. Verified **zero** app references (never collected/written/shown — the client form has no such inputs); they were dead PII liability on the shared backend. Migration `20260612000400_drop_unused_client_pii.sql` (irreversible). **Nick to apply** with the other migrations. (Tightens the #5 security posture — the app's real client PII is now just name/DOB/address/phone/email/medical-notes.)

**Decisions still open:**
- [ ] Finish wiring the unwired email templates, or delete them? (Could power onboarding comms for the incoming 100.)
- [ ] Underwriting model: stay on Opus, or downgrade after the accuracy test passes?
