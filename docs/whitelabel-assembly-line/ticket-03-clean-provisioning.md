# Whitelabel OS Assembly Line — Ticket 3

## Resumable Clean Provisioning

**Commit:** `c77dcee` (`c77dceea2d5b6ef8545fc83353247106e74d0146`) — `feat(whitelabel): add resumable clean provisioning`  
**Control-plane migration:** `supabase/migrations/20260914003000_whitelabel_provisioning.sql`

## الهدف

تحويل الـ Whitelabel Build الجاهز من Ticket 1 إلى **installation مستقلة فعليًا** على Vercel + Supabase، بدون نسخ قاعدة بيانات All Star الحية، وبعملية قابلة للتوقف والاستكمال بأمان.

المبادئ الأساسية:

- customer-owned Vercel project.
- customer-owned Supabase project.
- clean schema، لا production data clone.
- exact Git SHA.
- resumable/idempotent steps.
- failure state واضح.
- لا credentials داخل browser أو ordinary control-plane fields.

## ما تم تنفيذه

### 1. Durable provisioning runs

تم إنشاء lifecycle دائم للـ provisioning بدل تنفيذ سلسلة أوامر غير قابلة للتتبع.

لدينا:

- `whitelabel_provisioning_run`
- `whitelabel_provisioning_step`

كل run مرتبط بـ build واحد، وكل step له status مستقل، timestamps، attempts/evidence حسب الحاجة.

### 2. Provisioning plan ثابت

الـ flow الحالي مكوّن من 9 خطوات:

1. `validate_intake`
2. `verify_provider_access`
3. `apply_clean_schema`
4. `configure_installation`
5. `configure_vercel_environment`
6. `deploy_source`
7. `configure_domain`
8. `create_initial_admin`
9. `smoke_check`

في الكود يتم ترتيبها ومتابعة أول خطوة لم تنجح بعد باستخدام provisioning plan موحد.

### 3. Readiness re-check قبل التنفيذ

بدء provisioning لا يثق بحالة قديمة في الـ UI؛ يتم إعادة تقييم intake/readiness قبل تنفيذ العمل.

إذا نقصت معلومات أو provider access لم يعد صالحًا، الـ run لا يكمل بشكل أعمى.

### 4. Provider access re-verification

قبل إنشاء الموارد أو استخدام المشاريع يتم التحقق من access عبر provider APIs، خصوصًا:

- Vercel.
- Supabase.
- email provider.
- لاحقًا AI/video ضمن Ticket 4.

### 5. Clean customer schema

تم إنشاء allowlist صريحة في:

`src/lib/whitelabel/provisioning/clean-schema.ts`

هذه القائمة تحدد **المigrations المسموح تطبيقها على customer DB**.

تم استبعاد:

- Assembly Line control-plane migrations.
- sample/demo seed migrations.
- Gateway migrations.

وهذا يمنع أن customer installation تحمل internal control-plane tables أو Gateway-specific infrastructure بالخطأ.

### 6. لا يتم clone لـ All Star production DB

المسار الصحيح هو:

1. تطبيق approved schema lineage.
2. تسجيل migration markers.
3. تشغيل clean-customer data cleanup.
4. التحقق من أن الجداول الحساسة لا تحتوي على All Star inherited data.
5. إضافة configuration/content الخاص بالعميل فقط.

### 7. Migration idempotency

كل migration يتم تغليفها بmarker في `installation_schema_migration`.

وبالتالي إذا توقفت العملية ثم عادت:

- لا يعاد تطبيق migration مكتملة بلا داعٍ.
- نستطيع معرفة ما تم فعليًا.
- الاستكمال يتم من النقطة الصحيحة.

### 8. Customer data cleanup assertion

تمت إضافة checks للتأكد من أن installation الجديدة لا تحتوي inherited business data مثل:

- people.
- recruits.
- clients.
- training content.
- training schedule.
- notification destinations.
- carrier links.
- tracker entries.
- policy submissions.

### 9. Installation config population

بعد schema setup يتم كتابة إعدادات Ticket 2 إلى customer Supabase نفسها:

- branding.
- support/reply-to.
- licensing.
- timezone.
- graduation/stall settings.
- carrier links.

### 10. Vercel environment configuration

تم تجهيز deployment environment الخاصة بكل installation بشكل مستقل، بما يشمل customer-specific non-secret config وsecret references المطلوبة.

ومن Ticket 5 أصبح provisioning يزرع أيضًا:

`INSTALLATION_SCHEMA_RELEASE`

حتى يستطيع `/api/version` إثبات أن النسخة الحية تعمل على schema release الصحيحة.

### 11. Exact source deployment

الـ run مربوط بـ Git source SHA صريح.

لا نعتمد على "latest branch state" كمرجع handoff؛ deployment والـ verification اللاحق يعرفان exact SHA التي تم تثبيتها.

### 12. Domain setup

بعد deployment يتم ربط customer domain الخاص بالـ build بدل إبقاء العميل على generic deployment URL.

### 13. Initial admin creation

الـ provisioning ينشئ initial customer admin ضمن customer Supabase، ولا يعيد استخدام All Star users.

### 14. Smoke check

آخر خطوة تتأكد من أن الـ deployment متاح ويستجيب قبل اعتبار الـ run ناجحًا.

Ticket 5 أضاف فوق ذلك تحققًا أقوى من `/api/version` للـ SHA + schema release.

### 15. Resume / retry behavior

الـ orchestrator يقرأ حالة الخطوات السابقة ويكمل أول خطوة لم تنجح بدل إعادة كل العملية من الصفر.

هذا يسمح بالتعامل مع حالات مثل:

- provider outage.
- domain pending.
- deployment failure.
- missing owner action.
- transient API failure.

بدون خلط artifacts أو بناء installation ثانية بالخطأ.

## أهم الملفات

- `supabase/migrations/20260914003000_whitelabel_provisioning.sql`
- `src/lib/whitelabel/provisioning/plan.ts`
- `src/lib/whitelabel/provisioning/types.ts`
- `src/lib/whitelabel/provisioning/orchestrator.ts`
- `src/lib/whitelabel/provisioning/admin.ts`
- `src/lib/whitelabel/provisioning/clean-schema.ts`
- `src/lib/whitelabel/provisioning/supabase-management.ts`
- `src/lib/whitelabel/provisioning/vercel-management.ts`
- `src/lib/actions/admin/os-provisioning.ts`
- `src/components/admin/os-builds/ProvisioningPanel.tsx`

## اختبارات القبول

تم اختبار:

- provisioning SQL lifecycle.
- plan ordering.
- clean migration allowlist.
- منع control-plane/Gateway migrations من customer schema.
- clean customer data assertions.
- content/service configuration integration.
- resume behavior على مستوى orchestration contracts.

من ملفات الاختبار الأساسية:

- `src/lib/whitelabel/provisioning/provisioning-sql.test.ts`
- `src/lib/whitelabel/provisioning/plan.test.ts`
- `src/lib/whitelabel/provisioning/clean-schema.test.ts`
- `src/lib/whitelabel/provisioning/content-services.test.ts`

## النتيجة

بعد Ticket 3 أصبح لدينا **Provisioning Engine حقيقي ومتعقب وقابل للاستكمال** يستطيع تحويل build جاهز إلى customer-owned installation نظيفة ومستقلة باستخدام exact source version.

## ما لم يتم في هذا الـ Ticket

- لم يتم تطبيق migration على قاعدة حقيقية أثناء تسليم الـ branch.
- لم يتم deploy فعلي لعميل حقيقي ضمن الاختبارات الحالية.
- content/video/AI isolation أُكمل في Ticket 4.
- verification/handoff الرسمي أُكمل في Ticket 5.
