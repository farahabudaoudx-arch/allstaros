# White-Label Roadmap Tasks 01–08 — Developer Handoff

**Purpose:** Developer-facing reference for the **client/user roadmap tasks**, not the older technical Ticket 01–12 numbering.

**Last verified:** 22/09/2026

## Read this first

There are two numbering systems in this repository:

- **Roadmap Task 01–13** = the user/client execution roadmap.
- **Technical Ticket 01–12** = implementation documents under this directory.

They do **not** map 1:1. For example, Roadmap Task 03 ("Deploy White-Label Changes to All Star Preview") is operationally closest to Technical Ticket 11 ("Preview Migration Pilot"), not Technical Ticket 03.

Do not infer roadmap status from a technical ticket number. Use the status below.

## Authoritative status

| Roadmap task | Status |
| --- | --- |
| 01 — Establish a Stable AllStar Baseline Before White-Label Work | **CLOSED** |
| 02 — Prepare White-Label Preview Merge | **CLOSED** |
| 03 — Deploy White-Label Changes to All Star Preview | **GATED / NOT CLOSED** |
| 04 — Create Control Plane Environment | **CLOSED** |
| 05 — Add Provisioning Safety Guards | **CLOSED** |
| 06 — Create Disposable Test Customer | **CLOSED** |
| 07 — Validate Customer Core Features | **CLOSED** |
| 08 — Set Up Customer Domain Model | **CLOSED** |

Product branch evidence at handoff:

- `origin/dev` was verified at `6436d572d34fc11c2684d17fb6a1bb1e267aa48d`.
- The White-Label implementation/domain-documentation anchor before this handoff document is `f0d396abba6741ae96ac4f6cae6bb18d20f77c62` on `origin/feat/whitelabel-phase2-isolation`.
- Later handoff-only documentation commits may sit on top of that anchor; resolve the branch's live head with `git ls-remote origin refs/heads/feat/whitelabel-phase2-isolation` instead of treating this document as a self-referential branch pointer.
- White-Label work remains isolated from `dev`.

Roadmap Task 09 has **not** started. Roadmap Task 03 remains gated until explicit approval for the real Preview promotion.

---

# Task 01 — Establish a Stable AllStar Baseline Before White-Label Work

**Status:** CLOSED

## Why it exists

AllStar already had ongoing Product work before White Label was layered on top. Without a known-good Product baseline, a later regression could not be attributed confidently to existing AllStar work, a later Product change, or White-Label-specific code.

Task 01 was therefore a baseline/release-readiness task, **not a new feature**.

## Goal

Produce a known-good AllStar release candidate that can be used as the comparison point for all later White-Label work.

## What changed

- Current AllStar updates were brought together into a release candidate.
- The result was validated in isolated QA worktrees.
- No requirement was created to push this baseline directly to `main`.
- The baseline became the reference point from which later White-Label regressions could be identified.

## Evidence / commits

Primary baseline commit:

`4888d3e2cfc8097ee0f2da0de9f86472eb589f74 merge: prepare current All Star updates for release`

Recorded QA:

- Vitest: **992/992 PASS**
- TypeScript: **PASS**
- ESLint: **0 errors**
- production build: **PASS**

Known QA/reference worktrees include:

- `local/task01-allstar-rc`
- `local/task01-allstar-qa`
- `local/task01-allstar-qa2`
- `local/task01-allstar-qa3`

## How to verify

From a clean Product worktree:

    git show --stat 4888d3e
    git show --no-patch --format="%H %s" 4888d3e
    npm test
    npm run typecheck
    npm run lint
    npm run build

The exact historical test count belongs to the recorded baseline above; a later repository state may contain additional tests.

## Done criteria

Task 01 is done when there is a reproducible, tested AllStar Product reference commit that predates White-Label integration work and can be used for regression comparison.

---

# Task 02 — Prepare White-Label Preview Merge

**Status:** CLOSED

## Why it exists

White Label needed to be assembled on top of the verified Product baseline without prematurely mutating All Star Preview or mixing Control Plane schema into the Product database.

## Goal

Create a reviewable White-Label candidate that is ready for a later Preview promotion while preserving Product/Control-Plane isolation.

## What changed

- White-Label changes were synchronized into an isolated candidate.
- Product/customer migrations were kept separate from Control-Plane migrations.
- Preview DB mutation was intentionally deferred.
- The candidate was fully regression-tested before any real Preview promotion.

## Evidence / commits

Primary candidate commit:

`aa8c1ecb344a4449ae5ead0a7e2cbcac34f85d11 merge(dev): sync white-label preview candidate`

Recorded QA at Task 02 close:

- Vitest: **1019/1019 PASS**
- TypeScript: **PASS**
- ESLint: **0 errors**
- production build: **PASS**
- migration manifest checks: **PASS**

Later approved White-Label work continued on the isolated branch. The implementation/domain-documentation anchor immediately before this developer handoff file was added is:

`f0d396abba6741ae96ac4f6cae6bb18d20f77c62`

Do not treat that SHA as a permanent branch-head pointer; later handoff/documentation commits may sit on top of it.

## How to verify

    git show --stat aa8c1ec
    git log --oneline origin/dev..origin/feat/whitelabel-phase2-isolation
    git diff --name-status origin/dev...origin/feat/whitelabel-phase2-isolation

Then verify migration ownership against:

- `phase-2-roadmap.md`
- `ticket-07-branch-and-database-isolation.md`
- `ticket-11-preview-migration-pilot.md`

No Preview DB change is required to verify Task 02.

## Done criteria

Task 02 is done when the White-Label candidate is isolated, testable, migration ownership is explicit, and it can be promoted later without requiring Preview to be touched during preparation.

---

# Task 03 — Deploy White-Label Changes to All Star Preview

**Status:** GATED / NOT CLOSED

## Why it exists

Local validation and an isolated review branch do not prove that White Label works correctly in the actual All Star Preview environment. This task is the controlled promotion step.

## Goal

Promote the approved Product-side White-Label runtime into Preview, apply only the correct Product/customer schema lineage, deploy an exact source version, and prove that Preview still works end-to-end.

## What changed so far

No real Preview promotion has been performed as part of this roadmap task.

The implementation is prepared, but **Task 03 is missing the operation, not another feature**.

## Evidence / commits

There is intentionally no "Task 03 deployment commit" that proves completion. A Git commit alone cannot close this task.

The current isolated White-Label Product branch is:

`origin/feat/whitelabel-phase2-isolation`

Functional/domain-documentation anchor before the roadmap handoff document:

`f0d396abba6741ae96ac4f6cae6bb18d20f77c62`

Resolve the current review-branch head dynamically before promotion.

Technical execution detail is documented in:

`ticket-11-preview-migration-pilot.md`

## How to verify / execute when approved

Do **not** perform these steps until explicit approval is received.

1. Record the approval to promote White Label into Preview.
2. Promote/merge the approved Product changes through the accepted branch/QA flow.
3. Verify migration lineage before touching Preview.
4. Apply **Product/customer migrations only** to the DEV Preview DB.
5. Verify no Control Plane tables or migrations entered Preview.
6. Deploy an **exact Product SHA**.
7. Configure required Preview environment/settings.
8. Smoke-test auth/login, Admin/Builder/Producer behavior, Scorecards, Gateway, branding, email/runtime behavior, and `/api/version`.
9. Run the full regression suite after migrations.
10. Record source SHA, schema release, migration evidence, and rollback/forward-fix evidence.

## Done criteria / gate

Task 03 remains open until the real Preview operation above has succeeded.

It is **not** closed by local tests, a successful build, an isolated branch, documentation, a disposable customer test, or a commit being ready to merge.

---

# Task 04 — Create Control Plane Environment

**Status:** CLOSED

## Why it exists

Provisioning/operator state must not live inside the customer Product runtime. The system needs an administrative plane with its own identity, database, provider state, and lifecycle.

## Goal

Create a standalone Control Plane that can manage White-Label provisioning independently from the customer Product application.

## What changed

- A standalone Control Plane repository/runtime was bootstrapped.
- It received its own operator identity and Supabase/Docker database.
- Vercel project lifecycle/provisioning logic was moved into the Control Plane boundary.
- DNS/provider metadata belongs to the Control Plane rather than the customer Product DB.
- Product runtime no longer depends operationally on Control Plane availability.

## Evidence / commits

This task spans multiple Control Plane commits; it is **not one commit = one task**.

Recorded implementation sequence includes:

- `2e41720 feat: bootstrap standalone control plane`
- `6ba7576 feat: automate vercel project lifecycle`
- `18244dd feat: add dns sandbox provider layer`
- `61f5024 feat: ship direct-source vercel deployments`
- `fdc3b88 docs: finalize developer handoff evidence`
- `2a1cdc1 chore: harden local control plane qa`
- `dcece2b chore: finalize handoff qa helpers`

## How to verify

Verify that:

- the Control Plane can run against its dedicated local Docker/Supabase stack;
- Product does not contain Control Plane runtime routes/imports;
- Control Plane migrations are not part of the Product/customer migration manifest;
- Product/customer runtime remains usable if the Control Plane is unavailable.

The technical implementation reference is `ticket-08-standalone-control-plane.md`.

## Done criteria

Task 04 is done when the Control Plane exists and is technically separated from Product runtime/state.

**Important:** who ultimately owns/hosts the Control Plane repository/project is a later ownership/deployment decision. Closing Task 04 does not pre-decide Roadmap Task 09.

---

# Task 05 — Add Provisioning Safety Guards

**Status:** CLOSED

## Why it exists

Provisioning code can mutate Vercel, DNS, Supabase, and customer resources. A local test or wrong environment selection must fail closed rather than accidentally target Preview/Production.

## Goal

Make provisioning mutation-safe, repeatable, auditable, and resistant to accidental production/customer changes.

## What changed

- Protected environment/project checks were added.
- Mutation gates fail closed.
- Retry/idempotency protections were hardened.
- Provisioning/audit behavior was strengthened.
- Local QA cannot silently fall through to protected resources.

## Evidence / commits

Primary hardening commit:

`f33a2ca hardening: fail closed before customer mutations`

## How to verify

Exercise the safety tests with protected and disposable targets and verify:

- missing/ambiguous target identity blocks mutation;
- protected resources are rejected;
- retries reconcile instead of duplicating resources;
- cleanup only targets resources associated with the same build;
- local QA does not require Preview/Production mutation.

## Done criteria

Task 05 is done when unsafe/ambiguous mutation attempts fail before customer/provider changes and the disposable happy path remains repeatable.

---

# Task 06 — Create Disposable Test Customer

**Status:** CLOSED

## Why it exists

A White-Label assembly line cannot be trusted from unit tests alone. It needs a disposable customer installation where schema, configuration, branding, users, and runtime identity can be tested without risking All Star Preview or Production.

## Goal

Create an isolated customer environment that can be safely created, modified, validated, and discarded.

## What changed

Disposable customer:

`whitelabel-disposable-20260921`

Verified customer configuration:

- organization: `Northstar Pilot Agency`
- short name: `Northstar`
- product name: `Northstar OS`
- support email: `support@northstar-pilot.test`

Recorded runtime identity:

- Product source SHA: `aa8c1ecb344a4449ae5ead0a7e2cbcac34f85d11`
- schema release: `20260914004000_whitelabel_content_services`

Latest recorded database counts:

- `auth.users`: **7**
- `public.person`: **9**

## Evidence / commits

This task is primarily environment/provisioning evidence rather than a single implementation commit.

The Product source baseline used for the disposable customer was `aa8c1ecb344a4449ae5ead0a7e2cbcac34f85d11`.

## How to verify

Confirm that the disposable database/container is clearly distinct from Preview/Production, then verify:

- installation config values above;
- expected Product/customer migration lineage only;
- `/api/version` or equivalent runtime identity matches the pinned source/schema;
- disposable users/person data is present;
- no protected All Star resource was used.

## Done criteria

Task 06 is done when there is a working disposable customer installation that can be used for real customer-level acceptance without touching All Star Preview/Production.

---

# Task 07 — Validate Customer Core Features

**Status:** CLOSED

## Why it exists

Provisioning success is not sufficient if the resulting customer app has broken permissions, Scorecards, Gateway, branding, or email behavior.

## Goal

Prove that the disposable White-Label customer behaves like a real customer installation across its core user-facing flows.

## What changed

Validation covered:

- Admin flows;
- Builder vs Producer role isolation;
- Scorecards;
- Gateway disconnected flow;
- Northstar branding;
- local invite-email delivery;
- customer-specific From / Reply-To / application URL behavior.

To support safe local email acceptance, a development-only Mailpit transport was added. Production email remains Resend, and local transport is constrained to loopback usage.

## Evidence / commits

Product commit:

`4fa9548d8f0de45d79e7736c0f89cca6c024204f feat(whitelabel): support local Mailpit validation`

Recorded full regression:

- Vitest: **1021/1021 PASS**
- TypeScript: **PASS**
- ESLint: **0 errors**
- production build: **PASS**

## How to verify

Against the disposable customer:

1. sign in as the relevant Admin/Builder/Producer roles;
2. confirm capability isolation;
3. verify Scorecards;
4. verify Gateway disconnected behavior;
5. verify Northstar branding/config;
6. send a local invite and inspect Mailpit;
7. verify customer From / Reply-To / application URL values;
8. run:

       npm test
       npm run typecheck
       npm run lint
       npm run build

## Done criteria

Task 07 is done when core customer workflows work in the disposable installation and the full Product regression suite remains clean.

---

# Task 08 — Set Up Customer Domain Model

**Status:** CLOSED

## Why it exists

Before choosing long-term hosting/billing ownership, the system needs a stable contract for the customer's final URL, domain ownership, DNS provider, DNS zone, and verification lifecycle.

Without this contract, hosting decisions could incorrectly couple Product runtime to a specific registrar or DNS provider.

## Goal

Define and implement a provider-neutral customer-domain model, with Namecheap as the expected/default operational path, while keeping provider credentials and mutations out of Product runtime.

## What changed

The canonical customer OS URL remains `whitelabel_build.domain`.

The standalone Control Plane now models:

- domain ownership;
- registrar provider;
- DNS provider;
- DNS management mode;
- explicit DNS zone;
- domain lifecycle/status;
- last checked timestamp;
- verified timestamp.

Expected/default path:

- customer-owned domain;
- Namecheap expected;
- Namecheap MCP/tool management expected;
- provider-neutral Product contract.

Namecheap was deliberately modeled as an **external MCP/tool execution plan**, not an in-process Product provider.

No real customer Namecheap DNS mutation was performed.

## Evidence / commits

Product documentation:

`f0d396abba6741ae96ac4f6cae6bb18d20f77c62 docs(whitelabel): define customer domain model`

Control Plane implementation:

`a168952 feat(domains): model customer-owned Namecheap DNS`

**Important:** the Control Plane Task 08 commit is intentionally local-only while Control Plane repository/project ownership is being clarified. Do not push it to the temporary `yahiaal/allstar-control-plane` origin merely because that remote exists.

Key implementation:

- `supabase/migrations/20260921001000_customer_domain_model.sql`
- `src/lib/domains/namecheap.ts`
- `src/lib/domains/namecheap.test.ts`
- `src/lib/domains/types.ts`
- `src/lib/whitelabel/types.ts`
- `src/lib/whitelabel/validation.ts`
- `src/lib/actions/admin/os-builds.ts`
- `src/components/admin/os-builds/BuildIntakeFields.tsx`

Recorded Task 08 QA:

- focused tests: **7/7 PASS**
- full Control Plane suite: **51/51 PASS**
- TypeScript: **PASS**
- ESLint: **PASS**
- production build with Webpack: **PASS**

The Turbopack failure recorded in the isolated worktree was caused by a `node_modules` junction pointing outside the filesystem root; it was not a source-code regression.

## How to verify

Product:

- inspect `task-08-customer-domain-model.md`;
- verify Product has no Namecheap credential dependency;
- verify the White-Label Product branch remains isolated from `dev`.

Control Plane:

- verify migration `20260921001000_customer_domain_model.sql` is applied to the dedicated Control Plane DB only;
- verify `whitelabel_domain_binding.provider_key` accepts `cloudflare`, `namecheap`, and `local`;
- run the full Control Plane tests/typecheck/lint/build;
- inspect `namecheapMcpCnamePlan(...)` and `namecheapRecordState(...)`;
- verify Namecheap write plans use `force: false`.

Do **not** use a real customer domain merely to close this task.

## Done criteria

Task 08 is done when:

- customer-owned hostname is the final handoff URL contract;
- ownership/provider/zone/status metadata is implemented in the Control Plane;
- Namecheap is supported as the expected external MCP/tool path;
- Product remains provider-neutral and contains no Namecheap secrets;
- real DNS mutation remains separately gated.

---

# Boundaries after Task 08

- **Roadmap Task 03 is still gated.**
- **Roadmap Task 09 has not started.**
- Do not merge/deploy White Label into All Star Preview without explicit approval.
- Do not apply Control Plane migrations to a Product/customer/Preview/Production DB.
- Do not push the local Task 08 Control Plane commit to the temporary operator-owned remote until repository/project ownership is clarified, unless explicitly directed otherwise.
- Do not treat Namecheap as a hard Product dependency.
- Do not add Namecheap to the in-process domain provider factory unless the architecture decision explicitly changes.
- Keep the client branch flow: **feature → QA/approval → dev**.

# Commit references: how to use them

The commit references in this document are evidence and traceability anchors. They let a developer inspect the exact diff, changed files, surrounding history, implementation details, and the relationship between code and recorded QA.

They do **not** mean every roadmap task maps to exactly one commit.

Some tasks are naturally multi-commit (for example Task 04), some are primarily environment/acceptance work (Task 06), and Task 03 cannot be closed by a commit at all because it requires a real controlled Preview operation.
