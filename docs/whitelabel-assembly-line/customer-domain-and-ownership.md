# Customer Domain and Ownership Model

## Domain rule

Customer installations use a subdomain owned by the customer, for example:

`app.customercompany.com`

Customer installations must not depend on an All Star-owned customer hostname such as `customer.allstar.co`.

## Recommended initial operating model

For the first customers, the internal team manages the technical resources while the customer retains ownership of its domain/DNS.

Each customer receives:

- one dedicated Vercel project
- one dedicated Supabase project
- separate auth users and sessions
- separate database/storage state
- separate environment variables and integration credentials
- its own customer domain
- an exact installed product release SHA

Customer projects are not directly Git-linked to `main` or `dev`. A customer receives an explicitly selected release.

## DNS setup

The customer or its DNS administrator creates the record requested by the hosting provider for `app.customercompany.com`.

The internal team then:

1. attaches the hostname to the customer's Vercel project;
2. verifies DNS resolution;
3. verifies TLS is active;
4. verifies the application resolves on the customer-owned hostname;
5. updates the customer runtime/callback URLs as required.

DNS remains under customer control. This keeps a later transfer straightforward because the customer does not need to migrate away from an All Star-owned domain.

## Resource ownership and transfer

The initial managed model optimizes for operational simplicity:

- Vercel project managed by the internal delivery team;
- Supabase project isolated per customer;
- customer owns its DNS/domain;
- secrets stay in provider-managed environment storage, never in the public intake form or source repository.

When a customer later takes over hosting, transfer must preserve:

- exact deployed release SHA;
- database ownership and backup state;
- auth configuration;
- storage objects;
- environment variables/secrets;
- custom domain;
- email/provider integrations;
- any provider-specific billing or organization settings.

Provider-side transfer steps can change over time, so the handoff checklist should verify the current Vercel and Supabase transfer procedure at the time of transfer rather than encoding assumptions into product code.

## Isolation invariant

No customer may share All Star Preview or Production database/auth/storage resources.

All Star Preview remains an All Star QA environment. It is not Customer #1.
