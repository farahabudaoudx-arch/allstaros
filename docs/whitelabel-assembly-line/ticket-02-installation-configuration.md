# Whitelabel OS Assembly Line — Ticket 2

## Installation Configuration and Branding Abstraction

**Commit:** `7b34e12` — `feat(whitelabel): add installation configuration`
**Customer migration:** `supabase/migrations/20260914002000_installation_config.sql`

## الهدف

إزالة hardcodes التي تجعل التطبيق يتصرف وكأنه All Star فقط، وتحويل الإعدادات المتغيرة بين العملاء إلى **installation configuration** مع الحفاظ على سلوك All Star الحالي كـ default.

المبدأ الأساسي:

> نفس الكودbase، لكن كل installation تقرأ اسمها، ألوانها، روابطها، support settings، licensing settings، والسياسات التشغيلية الخاصة بها من configuration محلية.

## ما تم تنفيذه

### 1. `installation_config`

تم إنشاء configuration محلية للـ customer installation تحتوي على:

- organization name.
- short name.
- product name.
- metadata description.
- timezone.
- primary/accent brand colors.
- logo URL.
- favicon URL.
- support email.
- reply-to email.
- licensing provider name/code/URLs.
- graduation policy count/window.
- stall thresholds.

وتم تصميمها كسجل singleton على مستوى installation نفسها، لأن كل Supabase project يمثل customer installation مستقلة.

### 2. `installation_carrier_link`

تم نقل carrier/resource links إلى جدول local configuration بدل الاعتماد الكامل على روابط All Star الثابتة.

يمكن لكل installation تحديد:

- company key.
- display name.
- portal URL.
- sort order.
- هل يظهر الرابط في Resources أم لا.

### 3. Runtime config abstraction

تم إنشاء طبقة runtime مركزية:

`src/lib/installation/config.ts`

ومنها:

- `getInstallationConfig()`
- `getInstallationBrand()`
- `getInstallationCarrierLinks()`

هذا يمنع كل component من الوصول مباشرة للجداول أو إعادة تنفيذ fallback logic بشكل مختلف.

### 4. المحافظة على All Star الحالي

تم تعريف defaults واضحة لـ All Star.

إذا لم يكن Ticket 2 migration مطبقًا بعد، أو لم تتوفر configuration، يرجع runtime إلى:

- `ALL_STAR_INSTALLATION_DEFAULTS`
- `ALL_STAR_CARRIER_LINKS`

وهذا كان مهمًا حتى لا يؤدي إدخال Whitelabel abstraction إلى كسر installation الحالية.

### 5. Branding surfaces

تم ربط branding abstraction بالأماكن الرئيسية بدل hardcodes، ومنها حسب الحاجة:

- root metadata.
- favicon/logo surfaces.
- sidebar/chrome branding.
- email identity/brand.
- installation-facing names.

### 6. Support and email identity

أصبح support/reply-to جزءًا من installation configuration بدل أن يكون destination ثابتًا خاصًا بـ All Star.

وبذلك تستطيع كل installation أن تملك:

- support inbox مستقل.
- reply-to مستقل.
- sender identity مستقل.

### 7. Host/routing configuration

تم تعديل نقاط تعتمد على host/domain بحيث تستوعب customer installations بدون hardcoded All Star assumptions، مع fallback يبقي installation الأصلية تعمل.

### 8. Licensing configuration

تم إخراج القيم التالية من hardcode المباشر:

- licensing provider.
- licensing code.
- login URL.
- requirements URL.
- application URL.

وبذلك نفس onboarding/licensing flows تستطيع العمل على أكثر من installation.

### 9. Graduation and stall policy

القيم التشغيلية التي تختلف من عميل لآخر أصبحت configuration:

- `graduation_policy_count`
- `graduation_window_days`
- `stall_persisted_lapse_days`
- `stall_exam_unscheduled_days`
- `stall_no_checkin_days`
- `stall_checkin_lapsed_days`

### 10. Commission calculator بقي خارج هذا abstraction

تم الحفاظ على القرار بأن Commission Calculator ليس setting عاديًا يتم تبديله من نفس جدول installation configuration؛ بقي scope مستقل حتى لا نخلط business-specific commission logic مع branding/onboarding configuration.

## أهم الملفات

- `supabase/migrations/20260914002000_installation_config.sql`
- `src/lib/installation/config.ts`
- `src/lib/installation/defaults.ts`
- `src/lib/installation/types.ts`
- `src/lib/installation/runtime.ts`
- `src/lib/installation/routing.ts`
- `src/lib/installation/email-brand.ts`
- `src/lib/installation/licensing.ts`
- `src/lib/carrier-portals.ts`
- الملفات التي أصبحت تستخدم installation brand/config بدل hardcodes المباشرة.

## اختبارات القبول

تم اختبار:

- fallback إلى All Star defaults عند غياب config.
- قراءة installation config عند وجودها.
- branding resolution.
- routing/host behavior.
- email branding.
- licensing config.
- carrier links.
- SQL contract للمigration.

من ملفات الاختبار الأساسية:

- `src/lib/installation/config.test.ts`
- `src/lib/installation/defaults.test.ts`
- `src/lib/installation/runtime.test.ts`
- `src/lib/installation/routing.test.ts`
- `src/lib/installation/email-brand.test.ts`
- `src/lib/installation/licensing.test.ts`
- `src/lib/installation/installation-sql.test.ts`
- `src/lib/emails/installation-brand.test.ts`

## النتيجة

بعد Ticket 2 أصبح التطبيق **installation-aware** بدل أن تكون هوية All Star موزعة كـ hardcodes عبر النظام.

الأهم أن التغيير backward-compatible: All Star الحالية تحتفظ بسلوكها الافتراضي، بينما customer installations تستطيع استخدام نفس codebase بإعداداتها الخاصة.

## ما لم يتم في هذا الـ Ticket

- لم يتم إنشاء Supabase/Vercel customer projects؛ هذا Ticket 3.
- لم يتم عزل training/video/AI content؛ هذا Ticket 4.
- لم يتم handoff/verification lifecycle؛ هذا Ticket 5.
- migration لم يتم تطبيقها على production أثناء تنفيذ الـ Whitelabel branch.
