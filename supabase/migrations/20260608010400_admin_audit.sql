-- Admin audit log. Records sensitive admin actions (minting, etc.) with actor
-- and target. Inserted server-side via the service role; only super-admins read.

create table if not exists admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_person_id uuid references person(id) on delete set null,
  action text not null,
  target_person_id uuid references person(id) on delete set null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_created_idx
  on admin_audit(created_at desc);

alter table admin_audit enable row level security;

drop policy if exists "admin_audit: super read" on admin_audit;
create policy "admin_audit: super read" on admin_audit
  for select to authenticated using (is_super_admin());
