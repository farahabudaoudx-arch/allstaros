# Whitelabel OS Assembly Line — Ticket 7

## Branch and Database Isolation

**Status:** Implemented and validated on `feat/whitelabel-phase2-isolation`; not promoted to `dev` or `main`.

## الهدف

تثبيت الفصل بين Product Baseline والـWhitelabel بحيث يستطيع `dev` استقبال وتوزيع Leaderboard وScorecards وباقي الميزات العامة بدون إدخال Whitelabel معها، مع منع أي White Label migration من الوصول إلى DEV Preview DB قبل قرار الدمج الرسمي.

## المطلوب

### 1. Branch topology واضح

- `dev` = الميزات العامة للمنتج فقط.
- `feat/whitelabel-assembly-line` = `dev` + Whitelabel layer.
- قبل أي sync، تسجيل وحماية exact local White Label head الحالي وكل commits غير المرفوعة؛ الـworktree الحالي متقدم على `origin/feat/whitelabel-assembly-line` بعدة commits خاصة بالـlocal pilot/recording ولا يجوز فقدها أثناء إعادة المزامنة.
- تحديث Whitelabel branch من أحدث `origin/dev` بطريقة لا تُدخل أي Whitelabel commit إلى `dev`.
- توثيق أن الـWhitelabel branch يبقى قابلًا لإعادة المزامنة دوريًا من `dev` إلى أن يأتي قرار merge الرسمي.

### 2. Local-only Whitelabel database

- تشغيل الـWhitelabel development/pilot على Local Supabase/DB فقط.
- إعداد `.env`/scripts منفصلة تمنع الـWhitelabel workflow من استخدام DEV Preview project بالخطأ.
- إضافة hard guard في scripts ذات الخطر العالي: إذا ظهر Preview/Production project ref أثناء local-only mode تفشل العملية قبل أي SQL mutation.
- تعريف environment roles صريحة مثل `control-plane-local`, `customer-local`, `dev-preview`, `production`؛ ويجب أن تعتمد mutation guards على هوية البيئة/project ref المعلنة، لا على URL heuristics فقط.

### 3. Migration freeze

- إبقاء ملفات migrations tracked داخل المشروع.
- عدم تطبيق أي من Whitelabel migrations على DEV Preview أو Production ضمن هذا Ticket.
- توثيق ownership لكل migration: Control Plane أم Customer/Product runtime.
- تحويل migration ownership إلى manifest machine-tested بدل الاعتماد على documentation فقط.
- معالجة التناقض الحالي: وثائق Ticket 3 تقول إن Gateway migrations مستبعدة من customer clean schema، بينما `src/lib/whitelabel/provisioning/clean-schema.ts` يضم حاليًا عدة Gateway migrations. يجب تصنيفها صراحةً كـcustomer-supported أو dev-only ثم جعل الكود والوثائق والاختبارات متطابقة.

### 4. Product isolation verification

إثبات أن `dev` يظل قادرًا على تشغيل واختبار الميزات العامة، خصوصًا:

- Leaderboard / Live Leaderboard.
- Scorecards.
- Client fixes الموجودة على Product Baseline.

بدون الحاجة إلى Whitelabel tables أو Control Plane runtime.

## Acceptance Criteria

- Whitelabel branch synchronized مع أحدث `origin/dev` بدون تسريب Whitelabel إلى `dev`.
- كل local-only commits الحالية محفوظة ومثبتة قبل/بعد sync ولا يحدث history loss صامت.
- تشغيل Whitelabel محليًا لا يحتاج DEV Preview DB.
- محاولة تشغيل Whitelabel migration ضد Preview/Production أثناء local-only mode تتوقف fail-closed.
- White Label migrations تبقى ملفات فقط على remote DBs.
- customer migration manifest له test يمنع دخول control-plane/dev-only migrations بالخطأ ويكشف أي اختلاف بين documentation والallowlist الفعلية.
- Product smoke tests على `dev` لا تعتمد على Whitelabel schema.
- يوجد document مختصر يوضح branch + DB ownership للمهندس التالي.

## Implementation evidence — 18/09/2026

- Preserved and pushed the seven previously local White Label commits before starting Phase 2.
- Created the clean isolation branch `feat/whitelabel-phase2-isolation` from the preserved White Label head.
- Merged current `origin/dev` into the isolation branch only; no White Label commit was merged into `dev` or `main`.
- Added explicit local project roles: `control-plane-local` and `customer-local`.
- Local pilot registry now rejects non-loopback Supabase API/DB endpoints.
- `WHITELABEL_LOCAL_ONLY=1` blocks remote Supabase/Vercel mutations fail-closed.
- Explicit protected Preview/Production project refs are rejected before provider mutation.
- Customer provisioning adapters reject the local control-plane project even when a caller supplies its ref.
- Direct local pilot provisioning/verification scripts now verify that their service-role URL is the registered `local-control` project.
- Gateway product migrations are explicitly classified as customer runtime migrations, including `20260914000100_gateway_report_pull_artifacts.sql`.
- Control-plane migrations and demo seeds are explicitly separated from the customer migration lineage.
- Ticket 3 documentation was corrected to match the actual supported product policy: Gateway runtime schema is customer schema, not control-plane schema.

### Validation

- Focused Vitest suite: **28/28 PASS**.
- Product regression (Live Leaderboard + Scorecards): **572/572 PASS** across 46 test files.
- Gateway regression on the isolation branch: **128/129 PASS** across 21 test files.
- The single Gateway failure is the existing CRLF-sensitive assertion in `src/lib/gateway/report-artifact-sql.test.ts` expecting an LF-only substring in `20260914000100_gateway_report_pull_artifacts.sql`.
- The same Gateway test fails identically on a clean detached `origin/dev` worktree at `e0b4818`, confirming it is a pre-existing dev baseline issue rather than a Ticket 07 regression.
- TypeScript: **PASS**.
- No Preview DB migration performed.
- No Production DB migration performed.
- No Vercel/customer deployment performed as part of Ticket 07.

## خارج النطاق

- لا merge إلى `main`.
- لا تطبيق migrations على Preview.
- لا Vercel production deployment.
- لا تغيير على customer installations الحالية.
