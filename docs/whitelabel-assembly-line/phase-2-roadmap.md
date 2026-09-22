# Whitelabel OS Assembly Line — Phase 2 Roadmap

> **Developer note — numbering:** This document's technical Ticket 07–12 numbering is not the same as the client/user Roadmap Task 01–13 numbering. For the authoritative developer explanation and status of Roadmap Tasks 01–08, including why each task exists, evidence/commits, verification steps, and done criteria, see [`roadmap-tasks-01-08-developer-handoff.md`](./roadmap-tasks-01-08-developer-handoff.md).

## القرار المعتمد

هذه المرحلة تثبت فصل **Product Baseline** عن **White Label** حتى لا يصبح حصول العميل على Leaderboard أو Scorecards أو أي feature عامة مشروطًا بأخذ Whitelabel معها.

القرارات الحالية:

1. `dev` هو Product Integration Branch ويحتوي الميزات العامة مثل Leaderboard وScorecards وباقي إصلاحات المنتج.
2. `feat/whitelabel-assembly-line` يبقى branch منفصل مبني فوق `dev`، ويحتوي طبقة الـWhitelabel فقط فوق الـProduct Baseline.
3. الـWhitelabel يعمل حاليًا على **Local DB فقط**. لا يتم تطبيق Whitelabel migrations على DEV Preview DB في هذه المرحلة.
4. DEV Preview DB يبقى مخصصًا لـ`dev` وحده حتى قرار الدمج الرسمي.
5. نبقى بهذا الوضع إلى أن يصبح `main` مطابقًا للـProduct Baseline الموجود على `dev` ويأخذ العميل التعديلات العامة.
6. بعد ذلك فقط يُسأل العميل صراحةً إن كان يريد إدخال Whitelabel إلى `dev`.
7. إذا وافق العميل: ندمج Whitelabel إلى `dev` أولًا، ثم نطبّق migrations المناسبة على Preview DB كتجربة أولية، ثم نجري full acceptance/regression.
8. إذا نجح الـPreview pilot، نفتح PR من `dev` إلى `main`.
9. بعد اعتماد Whitelabel في `main` تصبح هي الأساس للنسخ الجديدة، إلا إذا طلب عميل بشكل صريح أن تبقى نسخته على baseline أقدم/مجمّد.
10. الـControl Plane سيكون **Repo مستقل** وVercel project مستقل، وليس جزءًا تشغيليًا من customer app repo.
11. الأولوية الحالية هي إثبات integration حقيقية مع Vercel، ثم simulation حقيقية قدر الإمكان لإنشاء subdomains تلقائيًا عبر Domain/DNS Provider sandbox أو test zone معزولة.

## Snapshot — 18/09/2026

وقت كتابة هذه الخطة:

- `origin/dev`: `e0b4818`.
- `origin/main`: `0fc70dd`.
- `origin/dev` متقدم على `origin/main` بعدد كبير من commits؛ لذلك شرط "main مطابق لـdev" **غير متحقق حاليًا**.
- `feat/whitelabel-assembly-line`: `d27a8b3`.
- الـWhitelabel branch لديه 15 commits خاصة به فوق الـshared baseline، ويفتقد commit واحد موجود على `origin/dev`.
- الـWhitelabel worktree متقدم محليًا على `origin/feat/whitelabel-assembly-line` بـ7 commits؛ أي sync مع `dev` يجب أن يحافظ عليها أولًا.
- Whitelabel migrations موجودة كملفات، لكن لم يتم اعتماد تطبيقها على Preview/Production DB ضمن الخطة الحالية.

## Migration ownership

قبل أي Preview pilot يجب فصل ownership بوضوح:

### Control-plane DB only

- `20260914001000_whitelabel_intake.sql`
- `20260914003000_whitelabel_provisioning.sql`
- `20260914005000_whitelabel_verification_handoff.sql`
- `20260915001000_whitelabel_updates_independent_operation.sql`

هذه لا يجب أن تدخل Customer/AllStar runtime database بعد فصل الـControl Plane.

### Customer/Product installation DB

- `20260914002000_installation_config.sql`
- `20260914004000_whitelabel_content_services.sql`

هذه هي المرشحة للـPreview pilot لاحقًا بعد approval، مع مراجعة lineage النهائية قبل التطبيق.

## Tickets

1. **Ticket 07 — Branch and Database Isolation**
   تثبيت حدود `dev`/Whitelabel، local-only DB للـWhitelabel، وحماية Preview DB من أي migration غير مقصودة.
2. **Ticket 08 — Standalone Control Plane**
   استخراج الـAssembly Line control plane إلى repo وVercel project مستقلين مع DB مستقلة.
3. **Ticket 09 — Real Vercel Integration**
   نقل provisioning من local simulation إلى Vercel API حقيقية على sandbox/disposable resources.
4. **Ticket 10 — Domain Provider Sandbox and Automatic Subdomains**
   بناء provider abstraction وتجربة auto-subdomain creation على sandbox أو isolated test zone.
5. **Ticket 11 — Preview Migration Pilot**
   Gate مشروط: لا يبدأ إلا بعد أن يصبح `main` مطابقًا لـ`dev` وبعد موافقة العميل على دمج Whitelabel في `dev`.
6. **Ticket 12 — Main Promotion and Version Baseline**
   بعد نجاح الـPreview pilot: full regression ثم PR إلى `main` واعتماد baseline الجديدة للنسخ المستقبلية.

## التوقيت

المحادثة لم تحدد hard deadline لإنهاء كل المرحلة. الاتفاق العملي كان: **ننجز اليوم أكبر قدر ممكن ونقيّم أين وصلنا**.

لذلك هدف 18/09/2026 يكون:

- إنجاز Ticket 07 بالكامل.
- دفع Ticket 08 إلى repo/project boundary واضحة وقابلة للتشغيل.
- تنفيذ أكبر قدر ممكن من Ticket 09 وإثبات Vercel integration حقيقية إذا كانت credentials متاحة.
- بدء Ticket 10 والوصول إلى provider/sandbox decision أو working POC إن أمكن.

أما Tickets 11–12 فهما **gated** بحدثين خارجيين: اكتمال `main <- dev` وموافقة العميل الصريحة على Whitelabel. لا نعتبرهما متأخرين قبل تحقق هذين الشرطين.

## Guardrails

- لا White Label migration على DEV Preview DB قبل Ticket 11.
- لا White Label migration على Production DB ضمن Tickets 07–10.
- لا merge من Whitelabel مباشرة إلى `main`.
- لا نجبر أي client installation حالية على White Label بدون قرار صريح.
- لا تستخدم customer domain حقيقي في domain automation tests؛ استخدم sandbox/test zone معزولة.
- كل Vercel/DNS provisioning يجب أن يكون idempotent، قابلًا لإعادة المحاولة، وله cleanup/rollback واضح.
- لا تخلط Control Plane schema مع Customer/Product schema بعد Ticket 08.

## Definition of Phase 2 Done

المرحلة تعتبر مكتملة عندما:

- Product baseline يصل إلى `main` بدون White Label dependency.
- Control Plane يعمل كخدمة مستقلة.
- Vercel provisioning مثبت end-to-end على موارد تجريبية حقيقية.
- Automatic subdomain flow مثبت على sandbox/test zone.
- العميل وافق على Whitelabel integration.
- Customer-facing migrations مرت على Preview DB بنجاح مع regression tests.
- تم اعتماد Whitelabel baseline في `main` أو تم توثيق قرار واضح بعدم دمجها.
