# Whitelabel OS Assembly Line — Ticket 11

## Preview Migration Pilot

**Status:** Gated / Not Ready to Start

## Start Gate

هذا Ticket **لا يبدأ** إلا بعد تحقق الشرطين:

1. `main` أصبح مطابقًا للـProduct Baseline على `dev` وأخذ العميل Leaderboard/Scorecards وباقي التعديلات العامة.
2. العميل أعطى موافقة صريحة على دمج Whitelabel إلى `dev`.

## الهدف

إدخال Whitelabel runtime إلى `dev` بشكل منضبط، ثم استخدام DEV Preview DB كأول remote migration pilot قبل التفكير بـ`main` أو production.

## المطلوب

### 1. Merge Whitelabel into dev

- تحديث Whitelabel من latest `dev` أولًا.
- مراجعة diff للتأكد أن ما يدخل إلى `dev` هو Whitelabel runtime المقصود فقط.
- Control Plane يبقى في repo المستقل من Ticket 08.

### 2. Migration manifest review

قبل لمس Preview DB:

- منع control-plane-only migrations من Product Preview DB.
- اعتماد customer/runtime migrations المطلوبة فقط.
- مراجعة ordering/idempotency/rollback-or-forward-fix plan.

المرشحان الحاليان للـProduct/Customer runtime:

- `20260914002000_installation_config.sql`
- `20260914004000_whitelabel_content_services.sql`

### 3. Preview DB pilot

- تسجيل schema baseline قبل التطبيق.
- تطبيق migration lineage المعتمدة على Preview فقط.
- التحقق من migration markers/schema objects.
- لا production DB mutation.

### 4. Regression

تشغيل full acceptance على الأقل للآتي:

- authentication/session flows.
- Leaderboard + Live Leaderboard.
- Scorecards.
- Underwriting/client fixes الموجودة في baseline.
- installation branding/config fallback لـAllStar.
- content/service bindings.
- existing users/data remain intact.

### 5. Exit decision

إذا فشل pilot:

- لا PR إلى `main`.
- توثيق failure وforward-fix/rollback action.

إذا نجح:

- freeze exact source SHA + schema release.
- الانتقال إلى Ticket 12.

## Acceptance Criteria

- موافقة العميل موثقة قبل البدء.
- لا control-plane table في Product Preview DB.
- runtime migrations تمر بنجاح على Preview.
- AllStar default behavior يبقى صحيحًا.
- regression suite تمر بدون Whitelabel-caused failures.
- exact source/schema identity موثقة للـpromotion.

