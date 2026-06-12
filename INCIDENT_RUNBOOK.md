# 🚨 Incident Runbook — All Star OS

Keep this short and skimmable. It's for a stressful moment when something broke for the 100 users at once. Pull it up, follow it, breathe.

---

## 1. Something is broken in production — roll it back (the calm "undo")

**Vercel Instant Rollback** points your live domain back to the last good build. It's instant (no rebuild). Do this FIRST when a bad deploy is hurting users — diagnose afterward.

### Fastest path (dashboard)
1. Open the project in Vercel → **project overview page**.
2. On the **Production Deployment tile**, click **`Instant Rollback`**.
3. Pick the deployment to roll back to:
   - **Hobby plan:** only the immediately previous production deployment.
   - **Pro/Enterprise:** click **`Choose another deployment`** to pick any earlier known-good one.
4. Click **`Continue`** → verify the domains/info → click **`Confirm Rollback`**.
5. Done — it's live immediately.

> Alternate route: **Deployments** tab → filter by `main` → click the **⋮** on a known-good row → **`Instant Rollback`**.

### ⚠️ The gotcha that will confuse you afterward
After a rollback, **Vercel turns OFF auto-deploy of the production branch.** New pushes to `main` will **NOT go live** until you undo the rollback. This is by design (so a fix-push doesn't blow away your safe rollback before you're ready).

**To resume normal deploys:** project overview → **`Undo Rollback`** on the production tile → select the deployment to promote → **`Confirm`**. (CLI equivalent: `vercel promote <deployment-url>`.)

### Things rollback does NOT change
- **Environment variables stay as currently set** — rollback reverts the *build/code*, not your env vars. (So a bug caused purely by a bad env-var change is fixed in Settings → Environment Variables, not by rollback.)
- **Cron jobs** revert to the rolled-back deployment's state (we have one: the daily stall-compute job).
- **Custom aliases** are not carried over unless they were on that previous production deployment.

### Eligibility
Only deployments that were previously live on the production domain can be rolled back to. Preview deployments cannot.

---

## 2. Find out WHAT broke

- **Sentry** (error tracking — once `NEXT_PUBLIC_SENTRY_DSN` is set): your first stop. Shows the actual error + stack the moment it hit a user. Look for a spike in the Issues feed.
- **Vercel → Deployments → [the deployment] → Runtime Logs:** server-side errors and request logs.
- **Supabase → Logs:** database/auth errors (shared with the Agency app — confirm which app a query came from).

---

## 3. Prevent the next one (habits, not heroics)
- **Preview before promote** (roadmap §10): click through the Vercel preview of a change before promoting to production.
- The **build gate** (roadmap §4) blocks any deploy with a lint *error* or type error.
- Rollback is cheap — use it without hesitation. Diagnosing a calm, rolled-back site beats debugging a live outage.
