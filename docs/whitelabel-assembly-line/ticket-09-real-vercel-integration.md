# Whitelabel OS Assembly Line — Ticket 9

## Real Vercel Integration

**Status:** Implementation complete for direct-source Vercel lifecycle; developer-2 provider QA pending.

## الهدف

إثبات أن الـControl Plane يستطيع تنفيذ provisioning حقيقي على Vercel باستخدام موارد sandbox/disposable، بدل الاعتماد على Local Pilot simulation فقط.

هذا Ticket مقصود به **Vercel lifecycle فقط**. إنشاء Supabase project تلقائيًا غير موجود حاليًا أيضًا، لكنه خارج نطاق هذا Ticket ويظل create/adopt يدويًا أو Ticket مستقل لاحقًا ما لم يتم توسيع النطاق صراحةً.

## الوضع الحالي

الكود الحالي يحتوي بالفعل على primitives مثل:

- Vercel project access verification.
- environment upsert.
- Git SHA deployment.
- deployment polling.
- project-domain attach/verify.

لكن Phase 2 يحتاج **end-to-end real provider proof** مع lifecycle كامل وأدلة قابلة للمراجعة.

## المطلوب

### 1. Disposable Vercel target

- استخدام Vercel team/account مخصص للتجربة أو resources قابلة للحذف.
- عدم لمس customer production project.
- project naming deterministic ومربوط بـbuild ID أو slug.

### 2. Project lifecycle

الـadapter يجب أن يدعم أو يثبت بوضوح:

- resolve/create project.
- Git source association أو exact-SHA deployment path.
- environment configuration.
- deployment creation.
- READY/ERROR polling.
- domain attachment hook.
- cleanup/archive/delete للموارد التجريبية.

### 3. Idempotency and retries

إعادة نفس provisioning run لا تنشئ projects/deployments غير منضبطة أو تغير مشروعًا آخر.

كل external resource يُحفظ له stable provider reference ويستخدم في resume/retry.

### 4. Evidence

كل خطوة تسجل safe evidence بدون secrets:

- project ID/ref.
- deployment ID.
- source SHA.
- deployment URL.
- ready state.
- timestamps.

### 5. Failure drills

اختبار على الأقل:

- invalid token/access.
- missing repo access.
- failed deployment.
- retry بعد failure.
- pre-existing project.

## Acceptance Criteria

- Control Plane ينفذ real Vercel API calls على resource تجريبي معزول.
- exact source SHA يصل إلى READY deployment.
- env configuration مثبتة بدون تسريب secrets.
- retry لا يكرر الموارد بلا داعٍ.
- cleanup path مثبت.
- لا Preview/Production DB migration مطلوبة لإكمال هذا Ticket.
- يوجد run evidence واضح يمكن عرضه للعميل أو للمراجع الداخلي.
- نجاح Ticket 09 لا يُوصف على أنه full autonomous customer provisioning ما دام Supabase project creation خارج النطاق.

## Implementation evidence — 18/09/2026

- Standalone Control Plane commit: `6ba7576f8c7b3e71f9554ea3cd82869fb043efa1` (`feat: automate vercel project lifecycle`).
- Commit Author/Committer: `Farahabudaoud-arch <Farahabudaoudx@gmail.com>`.
- Vercel provider verification now supports verified team/account access without requiring a pre-existing project.
- The customer Vercel project is optional at intake. Provisioning resolves an explicitly supplied project, otherwise resolves a deterministic project name and creates it if absent.
- The stable returned Vercel project ID is persisted back to the service connection and reused by environment/deployment/domain steps and retries.
- Focused Vercel lifecycle unit coverage proves:
  - existing deterministic project is adopted without creation;
  - missing deterministic project creates exactly once;
  - an explicitly supplied missing project ref fails rather than silently creating a replacement.
- TypeScript: **PASS**.
- ESLint: **PASS**.
- Focused standalone tests: **9/9 PASS**.
- Default Next.js 16 Turbopack production build: **PASS**.

### Real Vercel provider proof

Vercel account/team:

- team: `Ahmad's projects`
- team ID: `team_84PB1EgUPC5KtyeCPKmf92vH`

Disposable lifecycle proof:

- Created real project `allstar-ticket09-lifecycle-20260918`.
- Provider returned project ID `prj_7vNIUtiL5Kc5W9DJNcLgbKJKJy2a`.
- Re-read the same project by deterministic name and received the same stable ID (adopt/idempotency proof).
- Applied a harmless real environment-variable upsert through the Vercel API.
- Deleted the disposable project through the Vercel API.
- Confirmed the project subsequently returned 404 (cleanup proof).
- No customer/production Vercel project was modified.

### Exact-SHA direct-source proof

The Git-linked path was intentionally bypassed after Vercel rejected repository linking because the account had no GitHub Login Connection. Ticket 09 permits either Git source association **or an exact-SHA deployment path**, so the Control Plane now uses the latter by default.

Provider proof:

- Product source commit:
  `98842f7991e1cb77c1821024746d7cad4e6565a5`.
- Disposable project:
  `allstar-ticket09-direct-20260918`.
- The project was created without a Git integration.
- The Product source snapshot was uploaded directly to Vercel.
- Vercel recorded the exact Product SHA and direct-source metadata.
- The proof deployment reached **READY**.
- The account used for proof is a Hobby plan and the Product contains cron schedules that Hobby rejects. The successful provider proof therefore used an explicit `proof-no-crons` deployment profile that changes only deployment-time Vercel cron configuration.
- `proof-no-crons` is marked `sourceByteExact=false` and is forbidden from canonical handoff, managed update, or recovery.
- The normal/default `full` profile is byte-exact.

### Control Plane direct-source implementation

The standalone Control Plane now:

1. downloads the GitHub Product archive at an exact 40-character SHA;
2. excludes secret environment files from the deployment set;
3. hashes source files with SHA-1 to match the Vercel file API;
4. creates the Vercel deployment manifest;
5. handles `missing_files` by uploading only requested digests through `/v2/files`;
6. creates the deployment through `/v13/deployments`;
7. reconciles retries by deterministic lifecycle identity + source SHA + profile + Product repository provenance before creating a new deployment;
8. sets `INSTALLATION_SOURCE_SHA`, `INSTALLATION_SCHEMA_RELEASE`, and a lifecycle-specific `NEXT_DEPLOYMENT_ID`;
9. uses the same direct-source adapter for initial provisioning, managed update, and recovery.

Git-linked deployment remains optional only when explicitly enabled. A Vercel GitHub Login Connection is no longer required for the default remote provisioning path.

### Final implementation validation before developer-2 QA

- Standalone TypeScript: **PASS**.
- Full standalone Vitest suite: **38/38 PASS**.
- ESLint: **PASS**.
- Default Next.js 16 Turbopack production build: **PASS**.
- Production dependency audit: **0 vulnerabilities**.
- Retry reconciliation has dedicated tests.
- Managed update + recovery direct-source behavior has restored regression coverage.
- Canonical handoff has an explicit guard against non-byte-exact proof deployments.

Developer-2 should repeat the disposable-provider run from the standalone Control Plane adapter and verify runtime `/api/version` from a network path that can reach the Vercel deployment. This is QA/handoff verification, not an architectural blocker.

### Disposable resource cleanup proof

After the direct-source READY proof:

- inspected `allstar-ticket09-direct-20260918` and confirmed project ID `prj_KLEWpBemSztibnX2FA1lIxb6RqWT`;
- deleted that exact disposable project through Vercel CLI;
- Vercel reported successful permanent project removal, including its disposable deployments;
- a follow-up project listing returned **No projects found** for the test scope;
- the local `.vercel` link/proof directory in the Product worktree was removed afterward.

No customer or production Vercel project was deleted or modified by this cleanup.
