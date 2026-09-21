# Disposable Customer Validation — 2026-09-21

## Purpose

Validate the white-label customer package against a completely isolated customer database without touching All Star Preview, All Star Production, or any paid customer infrastructure.

## Product release under test

- Product source SHA: `aa8c1ecb344a4449ae5ead0a7e2cbcac34f85d11`
- Customer schema release: `20260914004000_whitelabel_content_services`
- Customer migration manifest: `config/whitelabel-customer-migrations.json`
- Manifest migration count: 68
- Control Plane migrations are not part of the customer manifest.

## Disposable environment

- Local project id: `whitelabel-disposable-20260921`
- Runtime type: local Supabase CLI on Docker Engine inside WSL2
- Customer API: local-only on port `54621`
- Customer database: local-only on port `54622`
- Customer app: local-only on port `3301`
- No Supabase Cloud project was created.
- No Vercel customer project was created.
- Existing All Star Preview and Production resources were not modified.

The local project was created as a fresh database. It did not copy All Star people, policies, auth users, storage objects, or other production data.

## Migration result

All 68 customer migrations applied successfully.

The canonical repository contains two historical migration files with the same numeric prefix:

- `20260601000400_clients.sql`
- `20260601000400_daily_projection.sql`

Supabase CLI uses the numeric prefix as the migration-ledger primary key, so the disposable local copy aliases the second filename to `20260601000401_daily_projection.sql`. The SQL contents are unchanged. This alias is local-pilot metadata only and must not be treated as a rewrite of an already-shipped canonical migration.

## Isolation checks

The disposable database contains customer/product tables including:

- `installation_config`
- `installation_carrier_link`
- `installation_service_binding`
- `person`
- `clients`
- Gateway tables
- Scorecard tables

The following Control Plane tables were explicitly checked and are absent:

- `control_plane_operator`
- `os_build`
- `os_update`

This confirms that the customer runtime remains separate from the Control Plane schema.

## Branding validation

The disposable customer was configured as:

- Organization: **Northstar Pilot Agency**
- Short name: **Northstar**
- Product: **Northstar OS**
- Primary brand color: `#1F4E79`
- Accent color: `#4CC9F0`
- Customer-specific local logo: `/northstar-pilot.svg`

The sign-in page rendered Northstar branding and did not render the All Star OS product name.

## Local QA identities

The existing development-only auth flow was used to create isolated local test identities for:

- Admin / Super Admin
- Builder
- Producer
- Recruit

The dev-login route remains guarded by the existing local-development gate and is not part of production customer behavior.

## Route smoke results

Authenticated HTTP smoke tests returned HTTP 200 and Northstar branding for:

- `/admin`
- `/admin/scorecards`
- `/admin/scorecards/coverage`
- `/admin/leaderboard`
- `/producer`
- `/producer/scorecards`
- `/producer/issued-premium`
- `/producer?settings=gateway`
- `/producer/leaderboard`

Builder and Producer sessions were tested separately. The Northstar logo asset also returned HTTP 200.

The Next.js development log was reviewed after these requests. No hidden HTTP 500 or runtime crash was observed for the validated routes.

## Acceptance result

The disposable customer milestone is validated locally for:

- independent customer database
- independent local auth state
- distinct branding
- admin access
- producer access
- builder access
- Scorecards route availability
- Gateway/Issued Premium route availability
- Leaderboard route availability
- Control Plane schema isolation

External production integrations such as real Gateway credentials, outbound email, AI provider credentials, DNS, and hosted Vercel/Supabase resources are intentionally not part of this disposable-local validation.
