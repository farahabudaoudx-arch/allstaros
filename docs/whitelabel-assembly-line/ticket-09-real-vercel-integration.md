# Whitelabel OS Assembly Line — Ticket 9

## Real Vercel Integration

**Status:** In progress — real project lifecycle/environment/cleanup proven; exact-SHA deployment blocked on Vercel GitHub Login Connection.

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

### Current blocker for exact-SHA deployment

The real Git-linked project creation request for `farahabudaoudx-arch/allstaros` was rejected by Vercel with:

`Failed to link farahabudaoudx-arch/allstaros. You need to add a Login Connection to your GitHub account first.`

Therefore the remaining Ticket 09 gate is to connect GitHub as a Vercel Login Connection with access to the Product repository. Once connected:

1. create the disposable Git-linked project;
2. configure sandbox environment values;
3. create deployment pinned to exact Product SHA `249e47bf6ca5553c24edb420def3fd8294114426`;
4. poll to READY/ERROR and capture safe evidence;
5. exercise domain attach/verification hook if a sandbox domain is available;
6. delete the disposable project.

Ticket 09 remains **not complete** until the exact-SHA deployment reaches the acceptance gate.
