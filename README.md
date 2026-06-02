# All Star OS — v1

A standalone recruiting pipeline for life-insurance organizations. Carries a
recruit from passed interview → licensing → onboarding → 28-day bootcamp →
graduated. Builders watch their downline; the system flags stalls; humans
remove.

Stack: Next.js (App Router) · Supabase (Postgres + Auth + RLS) · Tailwind ·
Vercel · Anthropic Claude (in-portal help assistant).

## Local development

1. **Supabase project.** Create one at supabase.com. Copy the project URL,
   anon key, and service-role key into `.env.local`.
2. **Google OAuth.** In the Supabase dashboard go to
   *Authentication → Providers → Google* and follow the setup instructions —
   you'll create OAuth credentials in Google Cloud and paste them in. Add
   `http://localhost:3000/auth/callback` and your eventual production
   callback URL to the authorized redirect URIs.
3. **Schema.** Apply every file in [supabase/migrations](supabase/migrations) in
   lexical order. The simplest path is to paste each file into the Supabase
   SQL editor and run it. Then run [supabase/seed/seed.sql](supabase/seed/seed.sql)
   to populate a three-level test hierarchy.
4. **Verify RLS.** Run the verification block at the bottom of `seed.sql`
   interactively as the postgres superuser. The visibility rule must hold —
   see Section 3.3 of the build plan.
5. **Anthropic key.** Add `ANTHROPIC_API_KEY` to `.env.local` so the in-portal
   assistant can answer questions.
6. **Run it.**
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000.

## Project layout

```
src/
  app/
    auth/             Google sign-in + callback + sign-out
    portal/           Recruit view (linear journey)
    dashboard/        Builder view (roster, recruit detail, flagged, reference)
    api/cron/         Vercel Cron — periodic stall recomputation
  lib/
    auth.ts           Person/session helpers
    db/types.ts       Shared enums and types
    supabase/         Browser/server/proxy clients
    actions/          Server actions (recruits, pipeline, portal, messages, flagging)
    ai/assistant.ts   Claude prompt + call
    pipeline/labels.ts UI labels for phases and steps
supabase/
  migrations/         Postgres migrations (apply in order)
  seed/seed.sql       Three-level seed for RLS verification
```

## Hard rules (non-negotiables from the build plan)

- **Visibility rule lives in Postgres.** Every pipeline table has a `SELECT`
  policy that funnels through `can_view(person_id)` — a recursive descent
  through `upline_id`. UI scoping is convenience; RLS is the guarantee.
- **Phase transitions are guarded.** Phase/`phase_step` are revoked from
  client `UPDATE` permissions and only the `SECURITY DEFINER` functions in
  [20260525000500_phase_state_machine.sql](supabase/migrations/20260525000500_phase_state_machine.sql)
  can change them.
- **Flag and remove are separate.** `compute_stalls()` flags. A builder
  invokes `remove_recruit()` — never automatic. Rows are retained.
- **Study materials in licensing stay locked** until `exam_date` is recorded.
- **Removed recruits are retained**, never deleted.

## Deploying to Vercel

1. Push the repo to GitHub.
2. Import into Vercel.
3. Set environment variables (Project → Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` — server only
   - `ANTHROPIC_API_KEY` — server only
   - `CRON_SECRET` — server only, optional but recommended (Vercel sets the
     Authorization header for cron requests automatically)
4. Add the production callback URL to Supabase Auth and Google OAuth:
   `https://<your-domain>/auth/callback`.
5. Deploy. The Vercel Cron in [vercel.json](vercel.json) runs daily at 08:00
   UTC to refresh stall flags.

## Verifying the definition of done (Section 0.1)

- A builder signs in with Google, sees their downline, watches every recruit
  in the pipeline.
- A recruit signs in with Google and walks Licensing → Onboarding → Bootcamp,
  one gated step at a time.
- Daily check-ins are captured by the recruit and visible to the builder
  (roster + recruit detail).
- Stalled recruits are flagged automatically; the builder can remove. Removed
  rows are retained.
- The visibility rule holds on every read — verified by the seed block, not
  assumed.

## Known-open by design

- **Post-removal workflow.** Stubbed. Re-instatement, appeals, reassignment
  are not modeled — the business hasn't decided yet.
- **External org-chart import.** Out of scope for v1.

End of build plan v1 — 25 May 2026.
