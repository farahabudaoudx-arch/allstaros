# Whitelabel OS Assembly Line — Ticket 5

## Verification, Secure Handoff, and Review/Defect Windows

**Commit:** `01845c9` (`01845c9c73208c3633dd449476ca0921040b7042`) — `feat(whitelabel): add verification and handoff`  
**Control-plane migration:** `supabase/migrations/20260914005000_whitelabel_verification_handoff.sql`

## الهدف

منع اعتبار installation "منتهية" لمجرد أن deployment نجح.

Ticket 5 يضيف مرحلة رسمية بعد provisioning:

1. Verification حقيقي للنسخة الحية.
2. Verification للـ standard features والإضافات المطلوبة عند launch.
3. تجهيز handoff artifacts بدون credentials.
4. تسليم رسمي يبدأ منه review/defect windows.

## ما تم تنفيذه

### 1. Durable verification runs

تم إنشاء:

- `whitelabel_verification_run`
- `whitelabel_verification_item`

كل verification run مربوط بـ:

- build.
- provisioning run.
- exact source SHA.
- schema release.
- deployment URL.
- verification kind/status.

وبالتالي verification أصبحت record دائم وليست checkbox مؤقتة في الواجهة.

### 2. Automated checks

تمت إضافة checks آلية أساسية قبل handoff:

#### `deployed-source`

يتأكد أن handoff مربوط بـ provisioning run ناجح وGit SHA محددة.

#### `live-version`

يقرأ من customer-facing URL:

`/api/version`

ويقارن:

- deployed Git SHA.
- `INSTALLATION_SCHEMA_RELEASE`.

بالقيم المعتمدة في verification run.

#### `provider-access`

يتأكد أن required providers ما زالت تملك provider-API evidence وsecure credential references صالحة.

### 3. `/api/version` schema evidence

أصبح endpoint يرجع:

```json
{
  "sha": "...",
  "schemaRelease": "..."
}
```

والـ provisioning يزرع `INSTALLATION_SCHEMA_RELEASE` داخل customer Vercel environment.

هذا يمنع handoff لنسخة source صحيحة لكن schema قديمة، أو العكس.

### 4. Refresh automated verification

إذا provider check أو live-version check فشل بسبب حالة مؤقتة، يمكن للـ admin إعادة تشغيل automated checks بدون حذف manual evidence أو بدء verification run جديد بلا داعٍ.

هذا يعطي failure/resume behavior واضح.

### 5. Manual base verification checklist

أضفنا checklist فعلية للوظائف الأساسية، ومنها:

- initial admin invite/sign-in/password reset.
- recruiting workflow.
- downline workflow.
- client entry.
- sales/reporting.
- upload isolation.
- email identity/destination.
- Report-a-Bug routing.
- scheduled-job authorization.
- branding surfaces.

كل check required يحتاج نتيجة فعلية قبل passing.

### 6. Purchased additions: launch vs post-handoff

أضيف إلى additions:

`delivery_phase`

القيم:

- `launch`
- `post_handoff`

إذا الإضافة `launch`:

- تصبح required verification item.
- لا يمكن handoff قبل نجاحها.

إذا `post_handoff`:

- تسجل كـ deferred بشكل صريح.
- لا تمنع إطلاق الـ OS.

وهذا يمنع خلط work متفق عليه لاحقًا مع launch blockers.

### 7. Maintenance verification

إذا العميل اختار maintenance:

- يظهر verification item خاص بالـ maintenance onboarding/shared-webinar privacy.
- لا يعتبر مكتملًا إلا إذا تم توثيق تنفيذه فعليًا.

إذا maintenance غير مختارة:

- يصبح `not_applicable`.

### 8. Cross-build DB fencing

تم تشديد العلاقات على مستوى قاعدة البيانات نفسها باستخدام composite build/run relationships لمنع:

- verification item من Build A أن يرتبط بـ run من Build B.
- handoff من Build A أن يشير إلى provisioning/verification من Build B.
- artifact من Build A أن يسجل تحت handoff عميل آخر.
- addition verification من الإشارة إلى addition لعميل آخر.

### 9. Verification immutability بعد handoff

بعد canonical handoff لا يمكن تعديل verification evidence التي بُني عليها التسليم وكأن التاريخ لم يحدث.

هذا يحافظ على auditability.

### 10. Handoff lifecycle: Prepare → Deliver

تم فصل إنشاء handoff record عن لحظة التسليم الفعلية.

#### Preparing

بعد passing verification يتم إنشاء canonical handoff بحالة `preparing`.

في هذه المرحلة يمكن:

- توليد الوثائق.
- بناء source package.
- مراجعة artifacts.

لكن **review/defect windows لا تبدأ بعد**.

#### Delivered

لا يتحول handoff إلى delivered إلا بعد اكتمال artifacts المطلوبة.

عندها فقط يتم تثبيت:

- `handoff_at`
- review deadline.
- defect deadline.

### 11. 5-business-day review window

عند التسليم الفعلي يبدأ review period مدته:

**5 business days**

والحساب يتجاوز السبت والأحد.

### 12. 90-day defect-fix window

يتم تثبيت defect deadline عند:

**90 calendar days من handoff الفعلي**.

### 13. Windows immutable

إعادة توليد PDF أو manifest لاحقًا لا تعيد ضبط:

- handoff date.
- review deadline.
- defect deadline.

هذه القيم تصبح canonical وغير قابلة لإعادة التشغيل من خلال document regeneration.

### 14. Maintenance price snapshot

إذا maintenance مختارة، يسجل handoff:

**$197/month** (`19700` cents)

إذا declined تبقى القيمة null.

إنهاء maintenance مستقبلًا لا يعني أن customer OS يتوقف؛ maintenance تخص managed support/updates وليس حق العميل في تشغيل الـ OS المسلم له.

### 15. Handoff PDF

تم إنشاء PDF server-side يحتوي معلومات آمنة مثل:

- customer/product identity.
- OS URL.
- Vercel/Supabase project references.
- initial admin email.
- exact source SHA.
- schema release.
- handoff/review/defect dates عند التسليم.
- maintenance decision.
- operating notes.

ولا يحتوي على passwords أو tokens أو provider credentials.

### 16. Safe manifest

يتم توليد JSON manifest آمن لنفس الـ handoff، مع secret-like validation قبل التخزين.

### 17. Private handoff artifact storage

تم إنشاء private bucket:

`whitelabel-handoff-artifacts`

ويتم تسجيل كل artifact مع:

- kind.
- revision.
- storage path.
- SHA-256.
- byte size.
- content type.
- safe metadata.

التحميل من admin UI يتم عبر short-lived signed URLs.

### 18. Source package من exact Git SHA

تم إنشاء:

`scripts/build-whitelabel-source-package.mjs`

وهو يبني source ZIP من Git commit محددة، وليس من dirty working tree.

الـ package تشمل customer app source وcustomer DB material/ops instructions، وتستبعد control-plane/internal material.

### 19. Source package security policy

يتم استبعاد أشياء مثل:

- `.git`
- `.next`
- `node_modules`
- `.vercel`
- `.agents`
- `.gitnexus`
- `.env*`
- `AGENTS.md`
- Assembly Line admin/control-plane source.
- control-plane actions.
- control-plane migrations.
- Gateway migrations.

كما يتم secret scanning للـ package قبل اعتبارها صالحة.

### 20. Source package لا يرفع من Vercel runtime

تم اتخاذ قرار متعمد بأن source ZIP الكبير لا يمر عبر web action في Vercel.

يتم بناؤه offline/local من exact approved SHA، ويمكن للسكريبت تسجيله في private handoff storage باستخدام control-plane service role.

هذا يقلل:

- body-size/runtime limits.
- memory pressure.
- accidental packaging من working tree غير موثوقة.

### 21. Artifact completeness gate

لا يبدأ handoff الرسمي إلا إذا وُجدت artifacts المطلوبة:

- generated handoff PDF.
- generated manifest.
- source package.

ويجب أن تكون metadata الخاصة بالـ source package مطابقة لـ:

- handoff source SHA.
- schema release.
- `secretScan = passed`.
- `controlPlaneExcluded = true`.

### 22. Customer domain هو handoff URL

الـ handoff يستخدم:

`https://<customer-domain>`

وليس generic Vercel deployment URL كعنوان OS الرسمي.

### 23. Independent operation notes

الـ handoff documents توضح أن customer installation تملك Vercel/Supabase الخاصة بها وتستمر بالعمل حتى لو Assembly Line console نفسها أصبحت غير متاحة.

## أهم الملفات

- `supabase/migrations/20260914005000_whitelabel_verification_handoff.sql`
- `src/lib/whitelabel/verification.ts`
- `src/lib/whitelabel/verification/admin.ts`
- `src/lib/actions/admin/os-verification.ts`
- `src/app/admin/os-builds/[id]/verification/page.tsx`
- `src/app/admin/os-builds/[id]/handoff/page.tsx`
- `src/lib/whitelabel/handoff-pdf.tsx`
- `src/lib/whitelabel/source-package.ts`
- `scripts/build-whitelabel-source-package.mjs`
- `src/app/api/version/route.ts`

## اختبارات القبول

تم اختبار:

- launch vs post-handoff additions.
- required verification gating.
- automated version evidence.
- provider evidence.
- business-day calculation.
- cross-build SQL fencing.
- immutable windows.
- maintenance $197 snapshot.
- private artifacts.
- source package exclusions.
- secret scan behavior.
- admin action guard/contracts.
- Ticket 5 migration not entering clean customer migration list.

من ملفات الاختبار الأساسية:

- `src/lib/whitelabel/verification.test.ts`
- `src/lib/whitelabel/verification-handoff-sql.test.ts`
- `src/lib/whitelabel/source-package.test.ts`
- `src/lib/actions/admin/os-verification.test.ts`
- `src/lib/whitelabel/provisioning/clean-schema.test.ts`

## نتيجة الاختبار المشترك Tickets 1–5

بعد إنهاء Ticket 5 تم تشغيل integration/regression gate كامل للتذاكر الخمس معًا:

- **30 test files** خاصة بالـ Whitelabel/installation scope.
- **133/133 tests passed**.
- TypeScript: PASS.
- ESLint: 0 errors.
- Webpack production build: PASS.
- static generation: **104/104**.
- source-package smoke من HEAD النهائي: PASS.

Full-repository suite أعطت 1043 tests PASS و3 failures قديمة خارج Whitelabel في Gateway SQL text assertions، إضافة إلى environment issue خاص بـ `jsdom` في Underwriting test environment.

لم يظهر أي failure تابع لـ Tickets 1–5.

## النتيجة

بعد Ticket 5 أصبحت لدينا سلسلة كاملة حتى handoff:

**Intake → Installation Config → Clean Provisioning → Content/Provider Isolation → Verification → Secure Handoff**

وبالتالي Tickets 1–5 تشكل الآن مسار Assembly Line متكامل حتى لحظة تسليم customer installation.

## ما لم يتم في هذا الـ Ticket

- لا يوجد production migration apply ضمن تسليم هذا الفرع.
- لا يوجد customer live provisioning حقيقي تم تشغيله كاختبار end-to-end، لأن ذلك يتطلب حسابات ومشاريع فعلية وتطبيق migrations/deployment.
- installed-version/update-history/maintenance-entitlement/rollout/recovery lifecycle هو نطاق Ticket 6.

