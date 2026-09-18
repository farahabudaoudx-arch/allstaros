# Whitelabel OS Assembly Line — Ticket 9

## Real Vercel Integration

**Status:** Planned

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
