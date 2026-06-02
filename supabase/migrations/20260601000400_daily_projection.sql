-- daily_projection: a producer's self-set targets for a single day.
-- The producer fills in how many dials/contacts/appointments/presentations/
-- sales they intend to do today plus the AP they intend to submit; the
-- dashboard then renders progress bars of today's ACTUALS (from tracker_entry
-- and sale) against these projections.
--
-- Scoped to a single person_id, mirroring tracker_entry: read = can_view()
-- (self + downline + owner), write = self only via auth_person_id().

create table if not exists daily_projection (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  entry_date date not null,
  dials integer not null default 0 check (dials >= 0),
  contacts integer not null default 0 check (contacts >= 0),
  appointments integer not null default 0 check (appointments >= 0),
  presentations integer not null default 0 check (presentations >= 0),
  sales integer not null default 0 check (sales >= 0),
  ap_cents integer not null default 0 check (ap_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, entry_date)
);
create index if not exists daily_projection_person_date_idx
  on daily_projection(person_id, entry_date desc);

drop trigger if exists daily_projection_updated_at on daily_projection;
create trigger daily_projection_updated_at
  before update on daily_projection
  for each row execute function set_updated_at();

alter table daily_projection enable row level security;

drop policy if exists "daily_projection: read" on daily_projection;
create policy "daily_projection: read" on daily_projection for select using (can_view(person_id));
drop policy if exists "daily_projection: write" on daily_projection;
create policy "daily_projection: write" on daily_projection for all
  using (person_id = auth_person_id()) with check (person_id = auth_person_id());
