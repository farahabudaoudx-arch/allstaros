# Whitelabel OS Assembly Line — Ticket 12

## Main Promotion and Version Baseline

**Status:** Gated / Depends on Ticket 11

## الهدف

بعد نجاح Preview migration pilot واختبارات القبول، نقل baseline المعتمدة من `dev` إلى `main` عبر PR واضح، ثم جعلها الأساس الافتراضي للنسخ الجديدة مع احترام أي client-specific freeze صريح.

## المطلوب

### 1. Promotion PR

- PR من `dev` إلى `main`.
- لا PR مباشر من Whitelabel feature branch إلى `main`.
- ربط PR بأدلة Ticket 11: source SHA، schema release، test results، Preview evidence.

### 2. Final regression gate

قبل merge:

- full automated tests.
- production build.
- browser smoke للflows الحرجة.
- Leaderboard/Scorecards verification.
- AllStar branding/default verification.
- Whitelabel installation config verification.

### 3. Version baseline policy

بعد merge:

- النسخ الجديدة تنطلق من `main` الجديدة بشكل افتراضي.
- العميل الحالي يأخذ هذا baseline حسب release/update policy المتفق عليها.
- إذا قال العميل صراحةً إن نسخة معينة يجب أن تبقى كما هي، تسجل كـpinned/frozen baseline ولا تُحدّث تلقائيًا.

### 4. Control Plane compatibility

- الـControl Plane المستقل يعرف exact supported product/schema releases.
- لا provisioning لنسخة غير معروفة/غير مدعومة.
- managed updates تستخدم immutable release identity.

### 5. Documentation and handoff

توثيق:

- branch policy.
- DB ownership.
- migration policy.
- version pin/freeze policy.
- how new client installations are created from the new baseline.

## Acceptance Criteria

- Ticket 11 passed بالكامل.
- PR `dev -> main` قابل للمراجعة وله evidence كاملة.
- لا Control Plane migration دخلت Product DB بالخطأ.
- baseline الجديدة موثقة بـsource SHA + schema release.
- default for new installations معروف وواضح.
- client-specific freeze behavior موثق ولا يعتمد على assumptions.

## Definition of Done

بعد merge واعتماد baseline:

- `main` هي canonical product + approved Whitelabel runtime baseline.
- Control Plane يبقى مستقلًا.
- كل customer installation جديدة تبدأ من baseline معروفة.
- الاستثناء الوحيد هو customer version تم تثبيتها عمدًا بطلب صريح.
