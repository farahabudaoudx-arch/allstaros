# Launch Prep — Running List

Pre-launch necessities for the ~100-user company rollout (batch drop, captive team).
Decisions and rationale live here so nothing slips. Status legend: 🔲 todo · 🟡 in progress · ✅ done · ⏭️ deferred

---

## ✅ Decided — doing these

### 1. Error tracking (Sentry) 🔲
**Why:** A hundred users land in the same window on someone else's recommendation. If something breaks, it likely breaks for everyone at once — and you won't be in the room. Need a ping with the exact error, not silence.
**Scope:** Sentry free tier, wired into the app. Couple hours.

### 2. Lightweight product analytics (PostHog) 🔲
**Why:** Confirm the captive team is actually getting *through* — signup, underwriting wizard completion, carrier-link clicks. Tells you onboarding worked vs. everyone bouncing silently.
**Scope:** PostHog free tier, core funnel events only. Keep it minimal.

### 3. Critical-path hardening 🔲
**Why:** Error tracking tells you *when* something breaks; it doesn't stop it. With 100 real people arriving at once, the core flow needs a hard pass first.
**Scope:** Walk signup → underwriting wizard → carrier links → anything that writes to the shared Supabase backend. Shake out day-one embarrassments.

---

### 4. Static analysis gate (lint + typecheck) 🔲
**Why:** Most of the code is AI-generated; a lint/typecheck gate before ship catches a whole class of dumb breakage automatically. Near-free.
**Scope:** Make lint + typecheck a required pass before anything goes out.

### 5. Security pass — ELEVATED for our domain 🔲
**Why:** Personal/insurance info (PII), invite-only auth, and a Supabase backend **shared with the Agency app** — a mistake here leaks across *two* apps. This is not optional.
**Scope:** Focused review of access rules (RLS) on shared tables + confirm no secrets exposed in client/bundle.
**TOOL TO USE:** Claude Code's built-in `/security-review` command (Automated Security Reviews) — first-party, available now, just token cost (NOT the Enterprise-only "Claude Security" product). Scans for injection, **auth bypass / privilege escalation** (the big one for our shared-backend + multi-role setup), SSRF, crypto/deserialization issues, and self-verifies findings to cut false alarms. Optional companion: the GitHub Action that auto-reviews every change before ship — pairs with #10 (preview-first deploy). Run `/security-review` as the concrete execution of this item.

### 6. Rollback plan (Vercel instant rollback) 🔲
**Why:** A bug hits all 100 at once. Want a known "undo," not a panic. Vercel rollback is ~one click.
**Scope:** Confirm the rollback flow + know where the button is *before* day one.

### 7. Targeted tests on highest-stakes logic 🔲
**Why:** Not chasing coverage — just protecting the spots where a *silent wrong answer* hurts.
**Scope:** A few tests on underwriting knockouts + carrier matching, and the Supabase seam where All Star OS and Agency meet.

### 8. Usage cap / rate limit on the AI features 🔲
**Why:** Three AI chats let users type freely, and they call paid services (Anthropic + OpenAI). With 100 users arriving at once, one heavy user — or a bug — could hammer them and run up a surprise bill or degrade the service for everyone. No rate limiting found in the code.
**Scope:** Per-user usage cap / rate limit on the Sidekick, Portal Help, and Underwriting AI endpoints.

### 9. Keep a record of AI conversations 🔲
**Why:** If someone coaxes a wrong or off-compliance answer out of the AI (e.g. tricks it into recommending term life or giving regulatory advice), you want to be able to see what was asked and answered. Matters more in insurance than most fields.
**Scope:** Lightweight logging of AI prompts + responses for after-the-fact review.

### 10. Deploy habit: preview first, then promote 🔲
**Why:** With 100 people on the live site, don't push changes straight to production. Vercel already builds a free private *preview* of every change before it goes live — use it. Click through the preview, confirm it works, *then* promote to the real site. Pairs with #6 (rollback) as the safety pair for shipping changes after launch.
**Scope:** Make "test on the Vercel preview → promote" the standard flow. No build needed — it's process, the preview already exists.

### 11. Database query cleanup (real issues found in audit) 🔲
**Why:** Audited the code against the "5 DB mistakes" list. Won't crash at 100 users, but tables grow with the business (recruits, clients), and the worst offenders sit on pages everyone loads. Cheap to fix now, painful later. Connection pooling = non-issue (Supabase handles it). SELECT * = trivial, skip.
**Do now (cheap, ~15 min):**
- Add a row cap/limit + pagination to the **dashboard recruits query** — `src/app/dashboard/page.tsx` (~line 20). This page loads on EVERY login and currently fetches all recruits unbounded.
- Add missing index `(person_id, created_at)` on `clients` — new migration. Table is constantly sorted by date; only `updated_at` is indexed today.
**Do soon (more thought):**
- Bound the **leaderboard** query (`src/lib/producer/metrics.ts` ~line 508) — fetches ALL clients org-wide; needs a date window or aggregation.
- Cap the **team roster** (`src/app/api/producer/team/route.ts`) and **admin recruits** (`src/app/admin/people/recruits/page.tsx`) queries.
**Skip for now:** Discord upline N+1 walk (`src/lib/actions/discord.ts`, ≤10 queries/sale, fine at this scale); `select('*')` on single recruit row (`src/lib/actions/messages.ts`, trivial).

---

## ⏭️ Explicitly skipping (for now)

These solve scale / multi-team / multi-service problems we don't have as one app + one person:
- Datadog, Grafana, OpenTelemetry — observability for teams at scale
- Warehouse + reverse ETL — data infra for when analytics outgrows PostHog
- AI support agent — you'll be support for the first hundred (correct)
- Weekly growth dashboards — premature
- **Full staging environment + slow/canary rollouts + infrastructure-as-code** — the CI/CD video itself calls these overkill for a solo builder. Our infra is managed (Vercel + Supabase), so there's no homemade infrastructure to script. The lightweight version of "practice copy before live" is already covered by Vercel previews — see #10. Revisit staging/IaC only once a much larger, deeply-dependent user base makes it worth it.
- **Heavyweight AI guardrails library (e.g. NeMo Guardrails)** — evaluated, skip *the library*. CORRECTION: we DO have three free-form AI chats (Sidekick, Portal Help Assistant, Underwriting Wizard) — earlier note wrongly said we didn't. But the "$50k theft" fear still doesn't map: all three are text-in/text-out with NO tools, NO database writes, NO access to money or other users' data — the AI has no keys to steal with. The real (smaller) risk is a user tricking the AI into a wrong/off-compliance answer (e.g. recommending term life). Existing built-in rules + input limits + hallucination filters are "good enough" for launch. The library would only earn its place if we later give the AI real actions (touch data/money). See new items #8 and #9 for the parts that ARE worth doing.

---

## 📥 Inbox — to triage as they come in

_(Nick is feeding in more potential necessities; capture here, then sort into "doing" or "skipping")_
