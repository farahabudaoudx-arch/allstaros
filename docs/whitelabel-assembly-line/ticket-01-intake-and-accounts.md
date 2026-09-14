# Whitelabel OS Assembly Line — Ticket 1

## Intake, Accounts, Scope, and Readiness

**Commit:** `f780369` — `feat: add whitelabel assembly line intake`
**Control-plane migration:** `supabase/migrations/20260914001000_whitelabel_intake.sql`

## الهدف

بناء نقطة البداية للـ Whitelabel Assembly Line بحيث نستطيع إنشاء سجل مستقل لكل عميل، حفظ معلوماته، إعادة فتحه لاحقًا، معرفة الخدمات والحسابات المطلوبة، تسجيل الإضافات المدفوعة، ومنع بدء التنفيذ قبل اكتمال المعلومات الأساسية.

هذا الـ Ticket هو **control plane فقط**. بياناته تخص لوحة إدارة الـ Assembly Line ولا يتم نسخها إلى قاعدة بيانات العميل.

## ما تم تنفيذه

### 1. سجل مستقل لكل Whitelabel Build

تم إنشاء نموذج بيانات دائم للعميل يحتوي على معلومات مثل:

- اسم الوكالة/الشركة.
- اسم المنتج والاسم المختصر.
- جهة الاتصال الرئيسية.
- حساب الـ admin الأولي.
- الدومين.
- المنطقة الزمنية.
- حالة الدفع.
- تأكيد الـ standard scope.
- قرار الـ maintenance.
- بيانات الهوية البصرية.
- بيانات support / reply-to / sender identity.
- معلومات licensing الأساسية.
- إعدادات graduation وstall thresholds التي أصبحت لاحقًا جزءًا من installation config.

الهدف كان أن تكون عملية الإنشاء قابلة للحفظ وإعادة الفتح بدل الاعتماد على checklist خارجية أو معلومات موزعة في المحادثات.

### 2. Service Connections

تم تعريف الخدمات التي تحتاجها كل installation بشكل صريح:

- `vercel`
- `supabase`
- `email`
- `video`
- `ai`

لكل خدمة أصبح لدينا حالة مستقلة مثل:

- `missing`
- `provided`
- `needs_owner_action`
- `verified`
- `failed`
- `not_required`

كما تم حفظ references آمنة مثل:

- account reference.
- project reference.
- login email.
- billing/usage URL.
- provider name.
- next required action.

### 3. Provider API verification بدل checkbox شكلي

تم تشديد الـ readiness بحيث Vercel وSupabase والخدمات المطلوبة لا تعتبر جاهزة لمجرد كتابة اسم الحساب.

الحالة `verified` تعتمد على evidence فعلي مثل:

- `verification_method = provider_api`
- `account_ref`
- `project_ref` عند الحاجة.
- `last_checked_at`
- secure credential reference.

هذا يمنع أن يظهر build كجاهز بينما الوصول الحقيقي للحساب غير مثبت.

### 4. تخزين credentials عبر Supabase Vault

الـ credentials لا تحفظ داخل حقول الـ Whitelabel العادية ولا ترسل للمتصفح.

تم اعتماد Vault-backed references بحيث يحتفظ الـ control plane بـ `credential_secret_id` فقط بدل API key أو token نفسه.

تم توسيع secret-pattern validation لرفض قيم تشبه:

- bearer tokens.
- API keys.
- JWTs.
- GitHub tokens.
- Supabase tokens.
- private keys.
- passwords/tokens المكتوبة داخل free-text fields.

### 5. Branding intake

تم دعم الهوية البصرية من مرحلة intake نفسها:

- primary color.
- accent color.
- logo.
- favicon.

وتم جعل paths الخاصة بالـ logo/favicon **build-scoped** لمنع Build من قراءة asset تابع لعميل آخر.

### 6. Purchased Additions

تم إنشاء سجل مستقل للإضافات التي يشتريها العميل خارج الـ standard OS، مثل:

- custom feature.
- provider replacement.
- data import.
- bulk upload.
- custom AI.
- public website.
- SMS.
- other.

لكل addition:

- اسم.
- نوع.
- delivery requirements.
- timeline notes.
- status.

لاحقًا في Ticket 5 أضفنا أيضًا `delivery_phase` لتحديد هل الإضافة مطلوبة قبل launch أو يمكن تأجيلها لما بعد handoff.

### 7. Carrier links

تم تجهيز نموذج carrier links على مستوى الـ build حتى لا تكون روابط الشركات جزءًا ثابتًا من All Star فقط.

### 8. Readiness engine

تم إنشاء `getBuildReadiness(...)` لفحص أن الـ build يحتوي على الحد الأدنى المطلوب قبل provisioning.

من أمثلة ما يفحصه:

- primary contact.
- initial admin.
- domain.
- branding.
- support/reply-to/email sender.
- licensing information.
- standard scope confirmation.
- payment = paid.
- required provider records موجودة.
- provider access verified فعليًا.
- purchased additions فيها delivery requirements.

النتيجة تكون:

```ts
{
  ready: boolean,
  missing: ReadinessIssue[]
}
```

وبذلك يستطيع الـ admin معرفة **ما الذي يمنع التنفيذ بالضبط** بدل status عام فقط.

### 9. Admin-only access

صفحات وأفعال OS Builds محمية بواسطة admin guard، ولا توجد واجهة customer-facing لإدارة الـ Assembly Line نفسه.

### 10. Cross-build isolation

الـ queries والأصول والخدمات والإضافات مرتبطة بـ `build_id` لمنع خلط عميل بآخر.

كما تم إصلاح delete/not-found behavior بحيث حذف أو طلب resource غير موجود لا يؤدي إلى سلوك ملتبس بين builds.

## أهم الملفات

- `src/app/admin/os-builds/`
- `src/components/admin/os-builds/`
- `src/lib/actions/admin/os-builds.ts`
- `src/lib/whitelabel/admin.ts`
- `src/lib/whitelabel/catalog.ts`
- `src/lib/whitelabel/readiness.ts`
- `src/lib/whitelabel/types.ts`
- `src/lib/whitelabel/validation.ts`
- `src/lib/whitelabel/provider-verification.ts`
- `supabase/migrations/20260914001000_whitelabel_intake.sql`

## اختبارات القبول

تم تغطية هذا الجزء باختبارات تشمل:

- create/save/reopen.
- readiness and missing-info behavior.
- provider verification evidence.
- secret rejection.
- cross-build asset/reference isolation.
- intake SQL contract.
- admin action behavior.

من ملفات الاختبار الأساسية:

- `src/lib/actions/admin/os-builds.test.ts`
- `src/lib/whitelabel/intake-sql.test.ts`
- `src/lib/whitelabel/readiness.test.ts`
- `src/lib/whitelabel/validation.test.ts`
- `src/lib/whitelabel/provider-verification.test.ts`

## النتيجة

بعد Ticket 1 أصبح لدينا **سجل موحد وموثوق لكل customer build** مع scope، accounts، branding، purchased additions، provider evidence، readiness، وحماية secrets. وهو الأساس الذي تعتمد عليه Tickets 2–5.

## ما لم يتم في هذا الـ Ticket

- لم يتم provision لبيئة عميل فعلية.
- لم يتم نسخ All Star production DB.
- لم يتم تطبيق migration على production ضمن تنفيذ هذا المشروع.
- لم يتم بناء update/maintenance lifecycle؛ هذا ضمن Ticket 6.
