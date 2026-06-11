-- Per-person read receipts for message threads. One row per (person, recruit
-- thread); last_read_at is bumped to now() whenever that person opens the
-- thread. Powers the unread dots on the producer "Messages" (their own upline
-- thread) and "Team Messages" (downline threads) nav items — the dot clears
-- only once every message in the thread has been seen.

create table if not exists message_read (
  person_id uuid not null references person(id) on delete cascade,
  recruit_id uuid not null references recruit(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (person_id, recruit_id)
);

alter table message_read enable row level security;

-- A person only ever reads/writes their own read receipts.
create policy message_read_select_own on message_read
  for select using (person_id = auth_person_id());
create policy message_read_insert_own on message_read
  for insert with check (person_id = auth_person_id());
create policy message_read_update_own on message_read
  for update using (person_id = auth_person_id())
  with check (person_id = auth_person_id());
