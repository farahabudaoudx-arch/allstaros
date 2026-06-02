# Supabase — schema, RLS, and seed

This directory holds the database side of All Star OS:

- `migrations/` — applied in lexical order. The numeric prefix is timestamp-based; do not reorder.
- `seed/seed.sql` — 3-level hierarchy with a parallel team. Used to verify Section 3.3 visibility-rule acceptance.

## Applying the migrations

The simplest path (no CLI install) is the Supabase **SQL editor**:

1. Create a Supabase project. Copy `Project URL`, `anon` key, and `service_role` key into `.env.local`.
2. Enable Google as an auth provider (Authentication → Providers → Google).
3. Open the **SQL editor** and run each file in `migrations/` in order.
4. Run `seed/seed.sql` once to populate the test hierarchy.

Or use the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push       # applies migrations/
psql <connection-string> -f supabase/seed/seed.sql
```

## Verifying RLS (Section 3.3 acceptance)

After seeding, run the verification block at the bottom of `seed/seed.sql`
interactively as the postgres superuser. It simulates each user by setting
`request.jwt.claim.sub` and confirms:

- **Bob** (mid-tree builder) sees Bob, Charlie, and Daria — three rows.
- **Bob** sees zero rows for Alice (upline), Eve, or Frank (parallel team).
- **Daria** (recruit) sees only her own person and recruit rows.

If any assertion fails, do not proceed past Task 2.
