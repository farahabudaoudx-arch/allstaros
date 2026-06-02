-- producer_goal: a producer's standing goals (no period reset). One row per
-- person. The dashboard renders month-to-date actuals (AP / IP / sales) as
-- progress against these targets. Producers edit their own goal in Settings.
--
-- Scoped to a single person_id, mirroring tracker_entry / daily_projection:
-- read = can_view() (self + downline + owner), write = self via auth_person_id().

create table if not exists producer_goal (
  person_id uuid primary key references person(id) on delete cascade,
  ap_cents integer not null default 0 check (ap_cents >= 0),
  ip_cents integer not null default 0 check (ip_cents >= 0),
  sales integer not null default 0 check (sales >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists producer_goal_updated_at on producer_goal;
create trigger producer_goal_updated_at
  before update on producer_goal
  for each row execute function set_updated_at();

alter table producer_goal enable row level security;

drop policy if exists "producer_goal: read" on producer_goal;
create policy "producer_goal: read" on producer_goal for select using (can_view(person_id));
drop policy if exists "producer_goal: write" on producer_goal;
create policy "producer_goal: write" on producer_goal for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());
