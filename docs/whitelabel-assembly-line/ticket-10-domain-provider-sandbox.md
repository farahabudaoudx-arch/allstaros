# Whitelabel OS Assembly Line — Ticket 10

## Domain Provider Sandbox and Automatic Subdomains

**Status:** Planned

## الهدف

محاكاة provisioning حقيقية لإنشاء subdomain تلقائيًا ثم ربطه بالـVercel deployment، باستخدام DNS/domain provider sandbox إن كان المزود يدعم ذلك، أو test zone منفصلة ومعزولة إذا لم يوجد sandbox رسمي مناسب.

## المطلوب

### 1. Provider capability spike

تقييم provider واحد على الأقل يدعم API مناسبة للـDNS automation، وتوثيق:

- هل لديه sandbox/OTE/test environment رسمي.
- طريقة auth والحد الأدنى من permissions.
- create/update/delete DNS record.
- propagation/status verification.
- rate limits وأي قيود تمنع الاختبار الآلي.

إذا لم يوجد sandbox رسمي مناسب، نستخدم dedicated test zone لا تحمل أي customer traffic.

### 2. Domain provider abstraction

تعريف interface مستقلة عن Vercel، مثل:

- `ensureSubdomain()`
- `getRecordState()`
- `deleteSubdomain()`
- `verifyPropagation()`

مع adapter أول لمزود الاختبار المختار.

كل provider يحتفظ بهويته وrefs الخاصة به بشكل مستقل؛ لا يعاد استخدام نفس `projectRef/accountRef` لتمثيل Vercel وSupabase وDNS provider في الـsandbox لأن ذلك يخفي أخطاء wiring حقيقية بين المزودين.

### 3. End-to-end flow

الـsimulation المطلوبة:

1. إنشاء build تجريبي.
2. تحديد subdomain deterministic مثل `client-<build>.test-zone.example`.
3. إنشاء DNS record تلقائيًا.
4. ربط domain بالـVercel project.
5. انتظار verification/propagation.
6. فتح deployment عبر الـsubdomain والتحقق من runtime identity.
7. cleanup كامل للـDNS record وVercel test resource عند انتهاء التجربة.

### 4. Safety

- لا customer production domains.
- least-privilege token خاص بالـtest zone.
- domain ownership scoped للـbuild.
- يمنع overwrite لسجل DNS موجود لا يملكه نفس build.
- cleanup idempotent.

### 5. Recovery cases

اختبار:

- record موجود مسبقًا لنفس build.
- record conflict مع owner مختلف.
- DNS provider timeout.
- Vercel domain verification delayed.
- retry بعد partial success.

## Acceptance Criteria

- Provider/test-zone strategy موثقة.
- Subdomain تجريبي ينشأ آليًا عبر API.
- Vercel يقبل الـdomain ويرتبط بالdeployment الصحيح.
- propagation/verification state تظهر في Control Plane.
- retry آمن ولا يعمل duplicate/conflicting records.
- cleanup مثبت ولا يترك DNS/Vercel test resources orphaned.
