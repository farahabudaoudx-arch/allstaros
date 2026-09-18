# Whitelabel OS Assembly Line — Ticket 10

## Domain Provider Sandbox and Automatic Subdomains

**Status:** Provider abstraction + local sandbox implemented; real Cloudflare test-zone proof pending credentials/zone.

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

## Implementation evidence — 18/09/2026

- Implemented a standalone DNS provider contract with:
  - `ensureSubdomain()`
  - `getRecordState()`
  - `deleteSubdomain()`
  - `verifyPropagation()`
- Implemented two adapters:
  - deterministic local sandbox provider for offline/retry testing;
  - Cloudflare DNS provider using the official zone DNS Records API.
- DNS provider identifiers are now independent from Vercel/Supabase:
  - `provider_key`
  - `zone_ref`
  - `record_ref`
  - `hostname`
  - `target`
  are persisted in the new Control Plane table `public.whitelabel_domain_binding`.
- Added Control Plane migration `20260918001000_domain_provider.sql` and applied it successfully to the isolated Docker `allstar-control-plane` database only.
- Cloudflare records are created as unproxied CNAME records with an explicit build ownership comment:
  `allstar-control-plane:build=<build-id>`.
- Retry behavior:
  - same build + same record => adopt without mutation;
  - same build + changed target => update the owned record;
  - different build + same hostname => hard conflict, no overwrite.
- Cleanup is idempotent.
- Propagation verification resolves the live CNAME chain and compares it with the expected target.
- Deterministic sandbox hostnames use `client-<build-prefix>.<test-zone>`.

### Validation

- Domain/Vercel/schema focused tests: **14/14 PASS**.
- TypeScript: **PASS**.
- ESLint: **PASS**.
- Default Next.js 16 Turbopack production build: **PASS**.
- Docker migration application: **PASS**.
- No legacy local-pilot Docker stack was stopped, reset, or modified.

### Provider strategy

Cloudflare is the first production-capable DNS adapter. Cloudflare's Registrar Sandbox is not suitable for this ticket because sandbox registrations do not create DNS zones. The real provider proof should therefore use a dedicated Cloudflare test zone with a least-privilege token scoped to that zone with DNS Write permission.

### Remaining real-provider gate

To complete Ticket 10 end to end, provide or authorize:

1. a dedicated Cloudflare test zone with no customer traffic;
2. its zone ID;
3. a token scoped only to that zone with DNS Write permission.

Then run:

1. deterministic subdomain creation through the Cloudflare API;
2. Vercel project-domain attachment;
3. propagation/domain verification;
4. runtime identity check through the new subdomain;
5. DNS + Vercel disposable-resource cleanup.
