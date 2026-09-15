# Whitelabel OS Assembly Line — Ticket 6

## Updates and Independent Operation

**Status:** Implemented at code/test level.

**Control-plane migration:** `supabase/migrations/20260915001000_whitelabel_updates_independent_operation.sql`

**Important:** the migration has **not** been applied to any database and no Vercel/customer deployment was performed as part of this ticket. Live Pilot / Ship acceptance still remains after Ticket 6.

---

## الهدف

Ticket 6 هو آخر implementation ticket في خطة Whitelabel OS Assembly Line ذات الست تذاكر. هدفه إدارة ما يحدث **بعد handoff** بدون تحويل customer OS إلى نظام يعتمد على Assembly Line حتى يعمل.

الشغل يغطي:

- معرفة النسخة المثبتة لكل customer installation.
- إدارة maintenance lifecycle.
- إدارة purchased/custom feature entitlements.
- إنشاء managed releases ثابتة ومحددة بالـ source SHA والـ migration lineage.
- notice + scheduling لكل rollout.
- incremental managed updates بدون clean reset.
- إيقاف release عند أول customer failure.
- post-update verification قبل اعتماد النسخة الجديدة.
- recovery يحافظ على newer customer records.
- الانتقال إلى independent operation.
- compatibility verification قبل العودة إلى managed updates.
- بقاء customer OS عاملة حتى لو Assembly Line نفسها غير متاحة.

---

## 1. Durable post-handoff installation lifecycle

أضفنا durable control-plane model يبدأ فقط من **Ticket 5 canonical delivered handoff**.

الـ bootstrap ينشئ:

- `whitelabel_installation`
- initial `whitelabel_installation_version`
- maintenance state/event من handoff decision
- base Standard OS entitlement
- purchased addition entitlements

النسخة الأولى في version ledger تستخدم exact:

- source SHA
- schema release
- deployment URL
- handoff identity

ولا يتم تغيير Ticket 5 handoff أو review/defect windows.

### Immutable version history

`whitelabel_installation_version` هو append-only ledger.

كل version تسجل origin واضح:

- `handoff`
- `update`
- `recovery`

والـ `current_version_id` لا يتحرك إلى managed update جديدة إلا بعد passed post-update verification.

---

## 2. Maintenance lifecycle

أضفنا حالة تشغيلية مستقلة عن immutable handoff snapshot:

- `active`
- `paused`
- `ended`
- `declined`

وكل transition يدخل في append-only `whitelabel_maintenance_event` history.

أضفنا guards تمنع تغيير maintenance أثناء update/recovery صار فعليًا قيد التنفيذ، حتى لا نترك customer installation بنصف migration أو نصف deploy.

إذا maintenance توقفت قبل بدء mutation:

- queued/notified rollout يتم إلغاؤها بأمان.
- OS نفسها لا تتوقف.
- customer content/data تبقى موجودة.

---

## 3. Purchased additions and entitlement sync

أضفنا:

- `whitelabel_installation_entitlement`
- `whitelabel_rollout_entitlement`

الـ entitlement ledger يحتوي base OS + paid additions.

Post-handoff additions يتم مزامنتها من Assembly Line عن طريق:

`sync_whitelabel_installation_entitlements`

والـ admin UI فيه زر:

**Sync purchased additions**

كمان `scheduleUpdateForAdmin()` يعمل entitlement sync تلقائي قبل إنشاء rollout، لذلك إضافة كانت `pending_delivery` ثم أصبحت `ready` لا تظل تمنع managed updates للأبد.

مهم: entitlement أصبحت `active` لا يتم إسقاطها تلقائيًا بسبب تغيير intake status لاحقًا؛ revocation يحتاج lifecycle decision صريح بدل accidental downgrade.

---

## 4. Immutable managed releases

أضفنا release model منفصل عن customer rollout:

- `whitelabel_release`
- `whitelabel_release_migration`

كل release تثبت:

- exact 40-character source SHA
- exact schema release
- ordered customer migration lineage
- full pinned migration SQL body
- SHA-256 لكل migration

بعد خروج release من `draft` لا يمكن تغيير identity أو migration body/history.

### Safe incremental migrations

Managed release ترفض destructive patterns في standard update path، ومنها:

- `TRUNCATE`
- `DELETE FROM`
- `DROP TABLE`
- `DROP COLUMN`
- table/column rename
- unsafe column type rewrites

Ticket 6 لا يستخدم:

`CLEAN_CUSTOMER_DATA_SQL`

ولا يعيد تشغيل provisioning orchestrator كـ update engine.

---

## 5. Managed rollout scheduling

كل installation لها rollout مستقلة مرتبطة بالـ release.

الـ rollout تسجل:

- release
- installation
- from-version
- notification time
- scheduled maintenance time
- status
- failure/recovery state

الجدولة تتطلب:

- installation في `managed` mode
- maintenance = `active`
- entitlement state صالح
- current version موجودة
- release = `ready` أو already `running`
- عدم وجود update/recovery متعارضة على نفس installation

Customer notice يتم تسجيلها وقت schedule، والـ scheduled time يمنع mutation قبل موعدها.

---

## 6. Sequential release safety

أضفنا DB constraint يمنع أكثر من installation واحدة من الدخول في mutating state لنفس release في نفس الوقت.

المقصود:

- Customer A يبدأ update.
- Customer B/C يظلون queued/notified.
- إذا A فشل، release تدخل `paused`.
- B/C لا يبدأ عليهم mutation.

وفي application gate أيضًا يتم فحص release status والـ mutating rollout slot قبل preflight.

هذا يمنع race condition كان ممكن تجعل customer ثانية تبدأ while release الأولى ما خلصت.

---

## 7. Resumable update engine

أنشأنا update engine مستقل تحت:

`src/lib/whitelabel/updates/`

الـ durable stages هي:

1. `preflight`
2. `apply_migrations`
3. `set_schema_environment`
4. `deploy_source`
5. `poll_deployment`
6. `verify_live`
7. `start_post_update_verification`
8. `awaiting_verification`

### Preflight

قبل أي mutation نتحقق من:

- exact current live source SHA
- exact current schema release
- customer migration markers
- Vercel/Supabase access
- managed operation mode
- active maintenance
- entitlement compatibility
- notice/schedule
- release still ready/running
- no other customer currently mutating on the same release

إذا الموعد ما جاء بعد، العملية تبقى deferred ولا تتحول كذبًا إلى failure/recovery.

### Migration retry safety

كل migration يتم تطبيقها واحدة واحدة مع marker transactionally.

الـ retry يقرأ current markers ويكمل من أول missing pinned migration، بدل إعادة كل شيء.

---

## 8. Exact source deployment

بعد انتهاء DB migration plan:

- يتم تحديث `INSTALLATION_SCHEMA_RELEASE` في customer Vercel project.
- يتم deploy للـ exact pinned Git SHA.
- يتم polling للـ deployment حتى READY.
- يتم التحقق من `/api/version` على customer URL.

Raw provider credentials لا تدخل release/rollout/audit rows؛ يتم جلبها server-side فقط عن طريق secure credential RPC.

---

## 9. Post-update verification hard gate

Ticket 6 يوسع verification model بدون تغيير Ticket 5 handoff verification.

الـ verification kinds الآن لها exact origins:

- `handoff` → provisioning run only
- `post_update` → update attempt only
- `compatibility` → installation only

Post-update verification تتحقق من:

- exact live source SHA
- exact live schema release
- complete pinned migration markers

إذا verification لم تمر:

- target version لا تصبح current.
- attempt تصبح `recovery_required`.
- rollout تسجل failure.
- release تتوقف `paused`.

---

## 10. Recovery without erasing newer customer records

أضفنا:

- `whitelabel_recovery_point`
- `whitelabel_recovery_run`

Standard Ticket 6 recovery strategy هي **app-forward / forward-fix**:

- لا نعمل destructive database rewind.
- لا نعمل full snapshot restore يمسح rows أحدث.
- نترك DB على forward compatible schema الموجودة فعليًا.
- نعيد deploy للـ prior application source SHA.
- نضبط schema environment على actual forward schema.
- نتحقق من live source + schema.
- نسجل recovery version في immutable version ledger.

Recovery point في `forward_fix` mode تصبح `ready` بحدود DB موثقة بدون fake database snapshot.

أي release لا يمكن recovery منها مع الحفاظ على newer customer records تعتبر خارج standard managed-update contract وتحتاج migration/recovery design منفصل.

---

## 11. Independent operation

أضفنا explicit operation modes:

- `managed`
- `independent`
- `rejoining`

عند دخول independent mode:

- customer OS لا تتوقف.
- Vercel/Supabase/customer records تبقى عند العميل.
- queued/notified managed updates تلغى.
- active mutating update/recovery تمنع الانتقال حتى تنتهي بأمان.
- releases المستقبلية لا تستطيع overwrite installation المستقلة.
- event يدخل في append-only lifecycle history.

Supported content/settings edits وحدها لا تجعل customer independent؛ الانتقال explicit فقط.

---

## 12. Compatibility check and managed rejoin

العودة من independent إلى managed ليست flag flip.

الـ rejoin يتحقق من:

- current live source SHA
- current live schema release
- known migration markers فقط
- handed-off Vercel/Supabase project refs
- active maintenance

إذا drift غير معروف موجود، verification تصبح blocked ولا يعود managed update path.

أضفنا إمكانية:

- Retry compatibility check
- Return to independent إذا rejoin بقي blocked

وتم تعديل Ticket 5 active-verification index semantics حتى blocked operational compatibility run لا يمنع retry لاحق، مع الحفاظ على immutable handoff verification.

---

## 13. Release lifecycle controls

Global release page:

`/admin/os-updates`

تدعم:

- Create immutable release
- Mark ready
- Resume paused release
- Complete release
- Withdraw release
- migration count
- rollout totals/statuses

Resume/Complete ممنوعان إذا ما زال هناك installation عندها unresolved `recovery_required`.

Release تصبح `running` عند أول real update mutation، وليس بمجرد schedule.

---

## 14. Per-build Operations UI

المسار:

`/admin/os-builds/[id]/operations`

يعرض:

- current installed source/schema/version
- managed / independent / rejoining mode
- maintenance status
- maintenance + operation history
- purchased entitlements
- entitlement sync
- release scheduling
- notice/scheduled time
- active rollout
- current update stage
- failure details
- recovery action/status
- installed version history
- update/recovery history
- compatibility/rejoin controls

تم ربط Operations من:

- build detail page
- handoff page

ومن Operations يمكن الوصول إلى global Managed Releases page.

---

## 15. Control-plane isolation and security

Ticket 6 migration هي **CONTROL-PLANE ONLY**.

تم منع دخولها في customer clean schema/source package.

كل Ticket 6 lifecycle tables:

- RLS enabled
- direct `anon`/`authenticated` access revoked
- service-role-only server paths
- composite build/installation foreign keys لمنع cross-customer attachment

Admin Server Actions تعمل `requireAdmin()` قبل إنشاء privileged update port/client.

Credentials لا يتم حفظها في:

- release metadata
- rollout rows
- update attempts
- recovery history
- audit detail
- handoff/source package

---

## 16. Source-package hardening

تم تحديث customer source-package rules لاستبعاد Ticket 6 control plane بالكامل، بما فيه:

- `src/lib/whitelabel/**`
- `/admin/os-builds/**`
- `/admin/os-updates/**`
- `src/lib/actions/admin/os-updates.ts`
- Ticket 6 control-plane migration
- Gateway migrations

وتم تعديل `CUSTOMER_DATABASE_SETUP.md` داخل package ليشرح بوضوح:

- clean reset = first installation only
- managed updates = incremental migrations only
- لا clean/reset أثناء maintenance updates

---

## 17. أهم الملفات

### Database

- `supabase/migrations/20260915001000_whitelabel_updates_independent_operation.sql`

### Update engine

- `src/lib/whitelabel/updates/types.ts`
- `src/lib/whitelabel/updates/admin.ts`
- `src/lib/whitelabel/updates/release.ts`
- `src/lib/whitelabel/updates/orchestrator.ts`
- `src/lib/whitelabel/updates/recovery.ts`
- `src/lib/whitelabel/updates/verification.ts`
- `src/lib/whitelabel/updates/persistence.ts`

### Admin actions

- `src/lib/actions/admin/os-updates.ts`

### UI

- `src/app/admin/os-builds/[id]/operations/page.tsx`
- `src/app/admin/os-updates/page.tsx`

### Existing navigation/source package integration

- `src/app/admin/os-builds/[id]/page.tsx`
- `src/app/admin/os-builds/[id]/handoff/page.tsx`
- `src/lib/whitelabel/source-package.ts`
- `scripts/build-whitelabel-source-package.mjs`

### Focused tests

- `src/lib/whitelabel/updates/updates-sql.test.ts`
- `src/lib/whitelabel/updates/release.test.ts`
- `src/lib/whitelabel/updates/orchestrator.test.ts`
- `src/lib/whitelabel/updates/recovery.test.ts`
- `src/lib/whitelabel/updates/verification.test.ts`
- `src/lib/whitelabel/updates/admin.test.ts`
- `src/lib/whitelabel/updates/persistence.test.ts`
- `src/lib/actions/admin/os-updates.test.ts`
- `src/lib/whitelabel/source-package.test.ts`

---

## 18. Validation results

### Ticket 6 focused suite

- **9 test files passed**
- **38 tests passed**
- 0 Ticket 6 failures

### Tickets 1–6 integrated Whitelabel suite

- **38 test files passed**
- **167 tests passed**
- 0 Whitelabel failures

### TypeScript

`npm run typecheck`

- **PASS**

### ESLint

`npm run lint`

- **0 errors**
- **56 warnings**
- warnings are existing/unrelated baseline warnings outside Ticket 6

### Production build

`npx next build --webpack`

- **PASS**
- Next.js 16.3.4
- production compilation succeeded
- TypeScript build phase succeeded
- **105/105 static pages generated**
- Ticket 6 routes included:
  - `/admin/os-builds/[id]/operations`
  - `/admin/os-updates`

### Full repository regression

Full parallel repo run reported:

- **139 test files passed**
- **1075 tests passed**
- 5 reported failures

Two Underwriting failures were parallel-run timing/retry noise; isolated rerun:

- `src/lib/underwriting/llm.test.ts` → **3/3 PASS**

The remaining confirmed failures are the already-known Gateway SQL source-text/CRLF assertions:

- `src/lib/gateway/reminder-sql.test.ts` → 2 failures
- `src/lib/gateway/report-pull-sql.test.ts` → 1 failure

Gateway is explicitly outside Whitelabel scope and no Gateway file was changed.

The existing missing `jsdom` environment issue can also still appear in the full Vitest run from the shared parent `node_modules`; it is not caused by Ticket 6.

---

## 19. Not performed in Ticket 6

لم يتم:

- apply لأي migration
- إنشاء/تعديل production database
- Vercel deploy
- customer rollout حقيقي
- production provider mutation
- merge إلى `dev` أو `main`
- أي Gateway edit
- بناء Commission Calculator

---

## 20. Result

بهذا Ticket 6 أصبح **implemented at code/test level** وهو آخر development ticket في Whitelabel OS Assembly Line.

Tickets 1–6 الآن تغطي:

1. Intake and accounts
2. Branding and onboarding settings
3. Clean build and deployment
4. Content and services
5. Verification and handoff
6. Updates and independent operation

لكن المشروع لا يعتبر **Ship-complete** بعد.

المرحلة التالية هي **Pilot / Ship acceptance** على infrastructure تجريبية معزولة، وتشمل:

- nontechnical operator standard build
- second isolated installation
- failed-build retry/resume
- real update
- failed update/recovery proof
- maintenance ending
- independent operation
- compatibility/rejoin
- customer OS operation while setup console is unavailable
- final documented walkthrough and approval

بعد نجاح هذه المرحلة فقط يمكن اعتبار Whitelabel OS Assembly Line مكتملًا بالكامل حسب الـ original handoff scope.
