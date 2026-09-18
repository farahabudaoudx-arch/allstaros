# Whitelabel OS Assembly Line — Ticket 8

## Standalone Control Plane

**Status:** Standalone repo extraction implemented and pushed; independent hosted Vercel/Supabase environment still pending.

## القرار

الـControl Plane سيكون **Repo مستقل** وVercel project مستقل. Customer/Product app يجب أن يستمر بالعمل حتى لو الـControl Plane متوقف بالكامل.

## الهدف

فصل Assembly Line orchestration عن AllStar/customer runtime حتى تكون حدود الملكية، الـDB، credentials، deployment، والتحديثات واضحة وآمنة.

## المطلوب

### 1. تحديد boundary نهائي

ينتقل إلى Control Plane repo:

- Build intake وإدارة accounts/provider references.
- Provider verification.
- Provisioning orchestration.
- Verification/handoff orchestration.
- Managed releases / updates / recovery / rejoin.
- Admin UI الخاصة بـOS Builds وOS Updates.
- Control-plane-only migrations.

يبقى في Product/Whitelabel runtime:

- Installation branding/config runtime.
- Customer-local service bindings/content behavior.
- Customer-facing migrations.
- `/api/version` أو equivalent runtime identity endpoint المطلوب للتحقق.

### 2. Migration split

Control Plane DB فقط:

- `20260914001000_whitelabel_intake.sql`
- `20260914003000_whitelabel_provisioning.sql`
- `20260914005000_whitelabel_verification_handoff.sql`
- `20260915001000_whitelabel_updates_independent_operation.sql`

Customer/Product DB:

- `20260914002000_installation_config.sql`
- `20260914004000_whitelabel_content_services.sql`

### 3. Operator/auth identity boundary

الاستخراج الحالي لا يمكن أن يكون نقل ملفات فقط، لأن بعض Control Plane tables تربط actor columns بـ`public.person` وبعض admin actions تعتمد على `requireAdmin()` من تطبيق AllStar.

المطلوب:

- إزالة اعتماد Control Plane DB على Product `public.person`.
- اعتماد operator identity مستقلة للـControl Plane، سواء internal operator table أو external auth subject ثابت وواضح.
- نقل authorization guards إلى الـControl Plane نفسه.
- الحفاظ على actor/audit attribution بدون FK عابر بين قاعدتي البيانات.
- منع أي customer/product session من اكتساب صلاحيات Control Plane تلقائيًا.

### 4. Independent Vercel project

- إنشاء Vercel project خاص بالـControl Plane.
- env/secrets مستقلة عن AllStar/customer runtime.
- لا customer secret يظهر في browser payload أو logs.
- deployment lifecycle للـControl Plane مستقل عن customer deployments.

### 5. Contract بين النظامين

تعريف versioned contract صغير وواضح بدل shared mutable runtime state، ويغطي على الأقل:

- source SHA.
- schema release.
- installation identity.
- deployment URL.
- provider project references.
- verification result/evidence.

### 6. Source-package isolation invariant

المسار الحالي يستبعد Control Plane code والمigrations من customer source package. يجب الحفاظ على هذا السلوك كـhard invariant بعد الاستخراج، مع test يفشل إذا عاد أي Control Plane path أو migration إلى customer artifact.

### 7. Failure independence

إثبات أن إيقاف Control Plane لا يوقف:

- customer sign-in.
- Leaderboard/Scorecards.
- customer content/data access.
- installation runtime configuration.

## Acceptance Criteria

- Control Plane repo مستقل وقابل للبناء والتشغيل منفردًا.
- Control Plane له Vercel project مستقل.
- Control-plane migrations ليست ضمن Customer migration manifest.
- Control Plane auth/operator identity لا تعتمد على Product `public.person` أو `requireAdmin()` runtime.
- Customer source package يستبعد Control Plane code/schema باختبار صريح.
- Product app لا يستورد Control Plane code في runtime path.
- توقف Control Plane لا يعطل customer app.
- توجد migration/data ownership matrix محدثة.

## Implementation evidence — 18/09/2026

- Created private standalone repository: `yahiaal/allstar-control-plane`.
- Initial standalone commit: `2e41720c2fbcf4ccd8187c3a44b2d350b19af2c0` (`feat: bootstrap standalone control plane`).
- Commit Author/Committer is `Farahabudaoud-arch <Farahabudaoudx@gmail.com>`.
- Extracted OS Builds / OS Updates routes, actions, UI, provisioning, verification, handoff, managed updates, recovery, and provider orchestration.
- Added standalone Supabase Auth + `control_plane_operator` authorization boundary.
- Replaced Product `public.person` actor FKs in Control Plane migrations with `public.control_plane_operator`.
- Added independent Control Plane audit table and local `public.set_updated_at()` foundation helper.
- Standalone Control Plane repo ships only its foundation + the four Control Plane migrations; customer installation/content migrations stay in the Product repo.
- Added exact Product source adapter. `VERCEL_GIT_COMMIT_SHA` from the Control Plane is explicitly forbidden as a customer Product SHA fallback.
- Product repo now publishes `config/whitelabel-customer-migrations.json` at exact Product commits.
- Provisioning, handoff verification, managed release snapshots, compatibility evidence, and source-package creation resolve their schema/migrations from the exact Product SHA.
- Added standalone source-package builder that downloads the exact Product commit from GitHub, excludes Control Plane paths/migrations, runs a secret scan, writes a manifest, and can register the resulting package in private Control Plane handoff storage.
- Real source-package proof succeeded against Product SHA `249e47bf6ca5553c24edb420def3fd8294114426`: 881 packaged files, schema `20260914004000_whitelabel_content_services`, secret/control-plane filtering passed.

### Validation

- ESLint: **PASS**.
- TypeScript: **PASS**.
- Standalone Control Plane tests: **6/6 PASS**.
- Default Next.js 16 Turbopack production build: **PASS**.
- Production dependency audit: **0 vulnerabilities** with `npm audit --omit=dev`.
- No Control Plane migration applied to AllStar Preview/Production.
- No customer production provisioning performed.

### Remaining before Ticket 8 is fully closed

- Create/configure the dedicated hosted Supabase project for Control Plane state/auth/storage/Vault.
- Apply only this standalone repo's Control Plane migrations there.
- Create the first authorized Control Plane operator.
- Create/configure the independent Vercel project and secrets.
- Deploy the standalone Control Plane and run hosted auth/OS Builds/OS Updates smoke tests.

## خارج النطاق

- لا تطبيق Control Plane migrations على AllStar Preview DB.
- لا merge إلى `main`.
- لا customer production provisioning.
