# Whitelabel OS Assembly Line — Ticket 4

## Customer Content and Service Provider Isolation

**Commit:** `1247f2c` (`1247f2c2bbbbbb49223fe117f6006877390ab76a`) — `feat(whitelabel): isolate content and service providers`  
**Customer migration:** `supabase/migrations/20260914004000_whitelabel_content_services.sql`

## الهدف

إزالة آخر الاعتمادات التي قد تجعل customer installation تقرأ محتوى All Star أو تعتمد على provider configuration مشتركة.

التركيز كان على:

- training content.
- video hosting.
- standard AI coach.
- provider replacement boundaries.
- optional integration failures.
- scheduled job auth.

## ما تم تنفيذه

### 1. Customer-local training content

تم جعل training libraries تقرأ من جدول `training_content` داخل **Supabase الخاصة بالعميل**.

المكتبات التي أصبحت ضمن هذا النموذج تشمل:

- Recruit Launch Pad.
- Previous Live Trainings.
- Bootcamp.
- Accelerator.
- Uplevel.
- Agent Vlogs / All Star TV surface.
- Live Sales Calls.
- Case Studies.

### 2. إزالة All Star content fallback

هذا من أهم قرارات Ticket 4.

إذا مكتبة العميل فارغة، تبقى فارغة.

لا نعود تلقائيًا إلى catalog أو training content خاص بـ All Star، لأن ذلك سيخرق isolation ويعرض محتوى غير مشتَرى أو غير مملوك للعميل.

في `resolveProgram(...)` مثلًا، يتم بناء البرنامج من customer DB rows فقط.

### 3. Content admin CRUD

تمت إضافة إدارة customer training content من الـ admin بدل الحاجة لتعديل source code لإضافة فيديو أو مادة تدريبية.

بذلك يمكن تحديث المكتبات المحلية للعميل دون إعادة إدخال All Star content كـ fallback.

### 4. Customer-local service bindings

تم إنشاء abstraction لـ non-secret provider selection عبر:

`installation_service_binding`

وتقرأها طبقة:

`src/lib/services/bindings.ts`

هذه الطبقة تحمل معلومات آمنة مثل:

- service kind.
- provider key.
- status.
- account reference.
- non-secret configuration.
- last checked time.

ولا تحفظ API secrets نفسها.

### 5. Video service registry

تم وضع video access خلف service abstraction بدل استدعاء Bunny بشكل مباشر في كل feature.

الـ registry يدعم حالات واضحة:

- `ready`
- `unconfigured`
- `unsupported`
- `error`

إذا provider غير موجود أو فشل، تعرض feature حالة مناسبة بدون إسقاط باقي الـ OS.

### 6. Bunny adapter

الـ standard video provider الحالي يمكن أن يكون Bunny، لكن أصبح الوصول إليه عبر installation-specific binding/configuration.

هذا يضع boundary واضحة لإضافة provider replacement مدفوع مستقبلًا بدل خلط provider-specific code مع كل training page.

### 7. Optional integration failure isolation

إذا video service غير configured أو provider adapter غير موجود:

- لا تنهار بقية installation.
- ترجع feature message واضحة.
- unrelated OS functionality تبقى متاحة.

وهذا جزء مهم من جعل customer installations مستقلة وقابلة للصيانة.

### 8. Standard AI coach installation config

تم فصل standard AI coach عن assumption أن All Star provider/config هو المصدر الوحيد.

AI generation أصبح يمر عبر installation service/provider boundary بحيث:

- standard provider يمكن ضبطه للـ installation.
- credentials تبقى server-side.
- provider configuration لا تتسرب للعميل الآخر.
- custom AI يبقى purchased replacement وليس toggle عشوائي يغير standard behavior.

### 9. Custom AI / provider replacement boundary

تم الحفاظ على الفرق بين:

- standard included AI/video functionality.
- purchased custom provider replacement.

إذا provider مختلف تم اختياره بدون وجود adapter مدعوم، النظام لا يتظاهر أنه يعمل؛ يعطي `unsupported`/failure واضح ويترك بقية النظام سليمة.

### 10. Provider verification

أضيف provider API verification لـ AI/video configuration المستخدمة في الـ build، مع secure credential references بدل raw secrets.

### 11. Provisioning integration

Ticket 3 provisioning أصبح يزرع customer-local content/service configuration أثناء بناء installation.

أي binding مطلوب يتم إنشاؤه داخل customer project وليس عبر الرجوع إلى control-plane runtime بعد الإطلاق.

### 12. Scheduled job authentication

تم تدقيق وتقوية cron auth بحيث scheduled jobs لا تعتمد على open endpoint أو fallback permissive.

Missing/invalid authorization يفشل fail-closed، وهو أيضًا جزء من verification checklist في Ticket 5.

### 13. Independent-operation principle

بعد provisioning، customer installation لا تحتاج Assembly Line console لكي تقرأ training content أو تعرف AI/video provider الخاص بها.

هذه المعلومات موجودة داخل customer environment نفسها، وهو شرط أساسي للاستقلال بعد handoff.

## أهم الملفات

- `supabase/migrations/20260914004000_whitelabel_content_services.sql`
- `src/lib/producer/training-content.ts`
- `src/app/admin/content/training/`
- `src/lib/services/bindings.ts`
- `src/lib/services/video/registry.ts`
- `src/lib/services/ai/generation.ts`
- `src/lib/whitelabel/content-service-verification.ts`
- `src/lib/whitelabel/provisioning/content-services.test.ts`
- cron auth/runtime files التي أصبحت تعتمد fail-closed behavior.

## اختبارات القبول

تم اختبار:

- customer training content resolution.
- عدم وجود All Star fallback عند library فارغة.
- video registry behavior.
- AI/service binding behavior.
- provider verification.
- content/service SQL contract.
- provisioning integration.
- cron authentication contracts.

من ملفات الاختبار الأساسية:

- `src/lib/producer/training-content.test.ts`
- `src/lib/services/video/registry.test.ts`
- `src/lib/kb/coach.test.ts`
- `src/lib/whitelabel/content-service-verification.test.ts`
- `src/lib/whitelabel/content-services-sql.test.ts`
- `src/lib/whitelabel/provisioning/content-services.test.ts`
- `src/lib/cron-auth.test.ts`
- `src/app/api/cron/team-digest/auth-contract.test.ts`

## النتيجة

بعد Ticket 4 أصبح المحتوى والـ AI/video provider state **جزءًا من customer installation نفسها**، بدون الاعتماد على All Star content fallback أو shared provider state.

## ما لم يتم في هذا الـ Ticket

- custom provider adapters غير المشتراة لم يتم اختراعها تلقائيًا؛ يوجد boundary واضح لها فقط.
- shared maintenance/webinar lifecycle ليس ضمن Ticket 4؛ تم التحقق منه فقط كمتطلب في Ticket 5 عند اختيار maintenance.
- لم يتم deploy أو migration apply لعميل production أثناء تطوير الـ branch.

