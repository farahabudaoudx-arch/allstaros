-- Login monitoring. Records every successful sign-in with IP / user-agent and a
-- resolved city/region, and auto-flags logins from a location this person hasn't
-- signed in from before — a simple account-sharing signal. Rows are inserted
-- server-side via the service role; only admins can read them.

create table if not exists login_event (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  ip text,
  user_agent text,
  city text,
  region text,
  country text,
  flagged boolean not null default false,
  logged_in_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists login_event_person_idx
  on login_event(person_id, logged_in_at desc);
create index if not exists login_event_flagged_idx
  on login_event(flagged) where flagged;

alter table login_event enable row level security;

-- Admin-only read. Inserts happen via the service role (no insert policy needed).
drop policy if exists "login_event: admin read" on login_event;
create policy "login_event: admin read" on login_event
  for select to authenticated using (is_admin());
