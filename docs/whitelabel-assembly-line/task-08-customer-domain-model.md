# Roadmap Task 08 — Customer Domain Model

**Status:** Domain ownership/model decided and implemented in the standalone Control Plane. Product handoff contract documented here.

## Decision

The official customer OS URL is a customer-owned hostname such as:

`https://app.customer-company.com`

The generic Vercel deployment URL is never the final handoff URL.

The customer domain remains independent from the Vercel/Supabase account model:

- the customer owns the domain;
- the Control Plane records the hostname, DNS provider, management mode, DNS zone, and verification state;
- Vercel owns the deployment target, not the domain;
- DNS credentials are not copied into the Product/customer database.

## Expected provider path

The expected default is **Namecheap DNS managed through the official Namecheap MCP connector**.

The domain intake model supports:

- ownership: customer-owned or operator-owned;
- registrar metadata;
- DNS provider: Namecheap, Cloudflare, manual/other;
- DNS management: MCP, direct API, or manual;
- explicit DNS zone;
- lifecycle: planned → needs DNS → DNS configured → verifying → verified/failed.

Namecheap is the preferred default, not a hard dependency. A customer using another registrar/DNS provider does not require Product changes.

## Namecheap MCP contract

For a normal subdomain such as `app.example.com` with DNS zone `example.com`,
the standard Vercel path is a CNAME record.

The provider operation is deliberately read-before-write:

1. `dns_records_get` for the customer zone.
2. Confirm the requested hostname does not conflict with an unrelated record.
3. `dns_records_save` with `force=false`.
4. Re-read/confirm the record.
5. Verify public DNS propagation.
6. Retry Vercel domain verification.
7. Persist only safe record/provider references in the Control Plane.

Deletion follows the same ownership check and then uses
`dns_records_delete`.

The Control Plane must not guess an apex-domain record. If the customer wants
`example.com` rather than a subdomain, use the exact DNS requirement returned
by Vercel for that domain.

## Data contract

`whitelabel_build.domain` remains the canonical hostname so existing
provisioning, verification, handoff, and update flows keep one source of truth.

The standalone Control Plane extends that build with:

- `domain_ownership_model`
- `domain_registrar_provider`
- `domain_dns_provider_key`
- `domain_dns_management_mode`
- `domain_zone_name`
- `domain_status`
- `domain_last_checked_at`
- `domain_verified_at`

Concrete DNS records remain in `whitelabel_domain_binding`. The supported
provider keys now include `namecheap`, `cloudflare`, and `local`.

## Safety rules

- No real customer domain is used for automated sandbox tests.
- A DNS mutation requires an explicit zone/hostname match.
- Namecheap MCP writes use `force=false`.
- Existing unrelated records are never overwritten.
- Provider credentials never enter Product/customer tables.
- The final handoff is blocked until the customer hostname is verified.
- Cleanup/delete is performed only for a record associated with the same build.

## Task 08 acceptance

- Customer-owned hostname is the handoff URL: **defined**.
- Domain ownership/provider/zone/status model: **implemented in Control Plane**.
- Namecheap MCP is a first-class provider execution path: **modeled**.
- Cloudflare/manual fallback remains possible: **supported**.
- Product source has no Namecheap credential dependency: **confirmed by design**.
- Real customer DNS mutation: **not part of this task**; requires an approved customer/test domain.

Task 09 can now decide the Vercel/Supabase hosting and billing ownership model
without changing the domain contract above.

