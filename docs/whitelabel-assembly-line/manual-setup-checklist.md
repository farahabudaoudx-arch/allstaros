# Customer Manual Setup Checklist

This checklist distinguishes intentionally manual customer onboarding steps from automation.

## Internal operator inputs

For the first customers, the internal team enters customer details directly. The shareable/public customer intake form is deferred.

Required operator inputs include:

- organization name;
- short/product name;
- brand colors;
- logo/favicon assets;
- support/reply-to email;
- timezone;
- domain hostname;
- required integrations;
- customer admin identity;
- release to install.

## Manual provider setup

Items that may remain manual, depending on provider access and automation permissions:

- create or approve the dedicated Vercel project;
- create or approve the dedicated Supabase project;
- configure billing/account ownership;
- configure custom domain/DNS;
- configure email sender/domain;
- configure customer-owned API/provider credentials;
- authorize integrations that require an interactive provider login;
- approve destructive or exceptional migrations;
- perform provider ownership transfer.

## Automated or controlled by the release system

The release/update workflow should control:

- exact source SHA;
- customer-safe migration manifest;
- package checksum;
- installation configuration;
- deployment environment generation;
- migration verification;
- application deployment;
- health checks;
- installed-release tracking;
- update/recovery audit events.

## Secrets

Never collect service-role keys, deployment tokens, or other privileged provider credentials in a public intake form.

Secrets belong in provider-managed environment storage or an approved secret store and are supplied only to the execution path that needs them.

## Customer acceptance checklist

Before calling a customer installation complete, verify:

- customer branding is visible on sign-in and authenticated shells;
- admin login works;
- user/role access works;
- Producer and Builder shells work where licensed;
- Scorecards routes load;
- Gateway/Issued Premium routes load;
- storage is customer-specific;
- database/auth are customer-specific;
- All Star Preview/Production refs are not used;
- customer domain/TLS work when hosted;
- installed release SHA and schema release are recorded;
- remaining manual integrations are documented.
