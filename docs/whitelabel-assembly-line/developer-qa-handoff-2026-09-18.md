# White Label Assembly Line — Developer 2 QA Handoff — 18/09/2026

> **Scope note:** The Ticket 01–12 table below is the technical implementation ticket sequence, not the client/user Roadmap Task 01–13 sequence. For the current Roadmap Tasks 01–08 status and the developer-facing **Why / Goal / What changed / Evidence / How to verify / Done criteria** mapping, use [`roadmap-tasks-01-08-developer-handoff.md`](./roadmap-tasks-01-08-developer-handoff.md).

## Repositories / commits

- Product repository: farahabudaoudx-arch/allstaros
- Product QA branch: feat/whitelabel-phase2-isolation
- Product runtime cleanup commit: 98842f7991e1cb77c1821024746d7cad4e6565a5
- Product handoff documentation commit is the latest commit on the QA branch.
- Control Plane repository: yahiaal/allstar-control-plane
- Control Plane direct-source implementation: 61f5024aed7e25ca7dc742dc5275eda0dd10343e
- Control Plane handoff evidence: fdc3b88c5afd59950cbba75e778c8bd54f9e415d
- Control Plane final local-QA hardening: 2a1cdc1ff4659e94c0c03c904f91eb0d719232be
- Control Plane final handoff helpers: dcece2bbbb4180ced10d45265c9a7d303b2fe262

All commits above were authored/committed as:

Farahabudaoud-arch <Farahabudaoudx@gmail.com>

## Ticket status matrix

| Ticket | Handoff state | What Developer 2 should verify |
| --- | --- | --- |
| 01 Intake / Accounts | Implemented | Intake CRUD, provider refs, readiness, secret rejection, cross-build isolation. |
| 02 Installation Configuration | Implemented | Branding/config defaults, runtime routing, support/licensing/email branding, backward compatibility. |
| 03 Clean Provisioning | Implemented engine; live provider QA remains | Clean customer migration lineage, resume/idempotency, Vercel direct-source path. Customer Supabase project creation is still not autonomous; use an isolated supplied customer project/ref for live QA. |
| 04 Content / Services | Implemented | Customer-local training/content, AI/video bindings, cron auth, no All Star fallback leakage. |
| 05 Verification / Handoff | Implemented | Live identity checks, manual/automated evidence, no-secret artifacts, proof-profile rejection before canonical handoff. |
| 06 Updates / Independent Operation | Implemented at code/test level | Managed update, exact release pinning, forward-schema recovery, independent operation/rejoin. Live update/recovery acceptance remains QA work. |
| 07 Branch / DB Isolation | Implemented and validated | No White Label migration on Preview/Prod; Product and Control Plane migration ownership remains split. |
| 08 Standalone Control Plane | Implemented for local Docker QA | Repo/auth/audit/schema/source contract independent. Hosted Control Plane deployment is not required for this handoff. |
| 09 Real Vercel Integration | Implementation complete; provider QA pending | Create/adopt/env/direct-source/poll/retry reconciliation/cleanup on disposable Vercel resources. |
| 10 DNS Provider Sandbox | Core implemented; real test-zone gate | Local provider QA now. Cloudflare real-zone E2E only after dedicated zone + least-privilege token. |
| 11 Preview Migration Pilot | GATED | Do not start without client approval and branch prerequisite. |
| 12 Main Promotion | GATED | Do not start before Ticket 11 acceptance. |

## Current non-negotiable boundaries

- Do not migrate White Label schema to DEV Preview or Production during this QA handoff.
- Do not merge the White Label branch into dev or main as part of testing.
- Do not use a customer production Vercel project or domain.
- Do not use proof-no-crons as canonical handoff/update/recovery evidence.
- Control Plane state uses the dedicated Docker Supabase stack for this handoff.
- Control Plane Docker ports use the isolated 5472x range.
- Product customer runtime must keep operating if the Control Plane is unavailable.

## Fast QA entry point

In the standalone Control Plane repo run:

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sync-local-supabase-env.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/qa-handoff.ps1

The first command refreshes only the ignored local Supabase URL/keys and prints no credential values. The second command verifies the complete handoff gate, including Docker runtime state and that all six Control Plane migrations are applied.

Or, if `.env.local` is already synchronized, run only:

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/qa-handoff.ps1

Expected baseline:

- TypeScript PASS
- 38/38 Control Plane tests PASS
- ESLint PASS
- Next.js production build PASS
- production dependency audit: 0 vulnerabilities

## Product regression baseline

Already recorded after removing Control Plane runtime from Product:

- installation/runtime: 29/29 PASS
- Leaderboard + Scorecards: 572/572 PASS
- Gateway: 128/129 PASS
- the single Gateway failure is the known CRLF-sensitive assertion reproduced on clean origin/dev
- production build PASS
- production dependency audit: 0 vulnerabilities

## Provider acceptance still worth repeating

### Vercel

Use a disposable project only:

1. create by deterministic name with no Git integration;
2. rerun resolution and confirm same project ID;
3. set test environment values;
4. deploy an exact Product SHA through direct-source;
5. verify missing-file upload flow if requested by Vercel;
6. poll to READY;
7. retry same logical deployment and confirm reconciliation;
8. verify /api/version returns the requested Product SHA + schema release;
9. delete the disposable project and verify it no longer lists.

### Customer Supabase

The current provisioning engine expects an isolated customer Supabase project/ref and can apply the Product manifest cleanly to it. Automatic creation of a brand-new customer Supabase project is not implemented in this handoff. Do not substitute Preview/Production.

### Cloudflare

Do not run real DNS mutation until a dedicated test zone and zone-scoped DNS Write token are provided. Until then, exercise the local DNS provider's create/adopt/conflict/propagation/cleanup behavior.

## Evidence already captured

- A disposable Vercel project was created without Git integration.
- Direct Product source upload reached a READY deployment.
- The proof used exact Product source SHA provenance.
- Because the test account is Vercel Hobby, a clearly marked proof-no-crons profile was used to bypass unsupported frequent crons for provider proof only.
- The disposable Vercel project was permanently deleted afterward.
- Follow-up Vercel listing returned no projects in the test scope.

## What counts as QA success today

Developer 2 can sign off the handoff if:

1. both repos match the commits above / latest handoff docs;
2. the local Control Plane QA script passes;
3. Product boundary checks show no Control Plane runtime routes/imports;
4. no Preview/Production mutation occurs;
5. disposable Vercel direct-source deployment can be repeated or the existing evidence is independently reviewed;
6. local DNS provider scenarios pass;
7. any remaining external gates are recorded rather than worked around with customer resources.
