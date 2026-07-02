-- Discord notifications and AP leaderboards.
-- Replaces the single person.discord_webhook_url with multiple webhook
-- destinations per builder (sales plus daily/WTD/MTD/YTD leaderboards),
-- edit-in-place Discord leaderboard messages, and manual YTD AP baselines
-- for pre-app Discord totals.
--
-- All app reads/writes go through service-role API routes. RLS is enabled
-- with admin-only read policies (same posture as login_event); there are
-- no authenticated write policies on purpose.
-- person.discord_webhook_url is kept during rollout; new code prefers
-- notification_destinations.

-- One webhook destination per row, owned by a builder.
create table if not exists notification_destinations (
  id uuid primary key default gen_random_uuid(),
  owner_person_id uuid not null references person(id) on delete cascade,
  provider text not null check (provider in ('discord_webhook')),
  purpose text not null check (purpose in (
    'sale_submitted',
    'leaderboard_daily',
    'leaderboard_wtd',
    'leaderboard_mtd',
    'leaderboard_ytd'
  )),
  label text not null default '',
  url text not null,
  enabled boolean not null default true,
  created_by uuid references person(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_destinations_owner_purpose_idx
  on notification_destinations(owner_person_id, purpose, enabled);

drop trigger if exists notification_destinations_updated_at on notification_destinations;
create trigger notification_destinations_updated_at
  before update on notification_destinations
  for each row execute function set_updated_at();

-- Tracks the Discord message posted per destination/period so leaderboards
-- are edited in place instead of re-posted.
create table if not exists discord_leaderboard_messages (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references notification_destinations(id) on delete cascade,
  period_type text not null check (period_type in ('daily', 'wtd', 'mtd', 'ytd')),
  period_start date not null,
  period_end date not null,
  message_id text not null,
  thread_id text,
  last_payload_hash text,
  last_updated_at timestamptz not null default now(),
  unique (destination_id, period_type, period_start)
);

-- Manual YTD starting totals per producer (submitted AP tracked in Discord
-- before this app existed). Applies to the YTD leaderboard only.
create table if not exists leaderboard_ap_baselines (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  year integer not null,
  baseline_through_date date not null,
  submitted_ap_cents integer not null default 0 check (submitted_ap_cents >= 0),
  sales_count integer not null default 0 check (sales_count >= 0),
  notes text,
  entered_by uuid references person(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, year)
);

drop trigger if exists leaderboard_ap_baselines_updated_at on leaderboard_ap_baselines;
create trigger leaderboard_ap_baselines_updated_at
  before update on leaderboard_ap_baselines
  for each row execute function set_updated_at();

-- Performance index for submitted-AP leaderboard queries on clients.
create index if not exists clients_person_sale_submit_idx
  on clients(person_id, sale_status, submit_date);

-- Backfill: copy each existing non-empty person.discord_webhook_url into a
-- 'sale_submitted' destination so nothing is lost when the old field retires.
insert into notification_destinations (
  owner_person_id,
  provider,
  purpose,
  label,
  url,
  enabled
)
select
  id,
  'discord_webhook',
  'sale_submitted',
  'Sales',
  discord_webhook_url,
  true
from person
where discord_webhook_url is not null
  and trim(discord_webhook_url) <> ''
  and not exists (
    select 1 from notification_destinations d
    where d.owner_person_id = person.id
      and d.purpose = 'sale_submitted'
      and d.url = person.discord_webhook_url
  )
on conflict do nothing;

-- RLS: admin-only read, no authenticated write policies. All app access
-- goes through service-role API routes that authorize the caller.
alter table notification_destinations enable row level security;

drop policy if exists "notification_destinations: admin read" on notification_destinations;
create policy "notification_destinations: admin read" on notification_destinations
  for select to authenticated using (is_admin());

alter table discord_leaderboard_messages enable row level security;

drop policy if exists "discord_leaderboard_messages: admin read" on discord_leaderboard_messages;
create policy "discord_leaderboard_messages: admin read" on discord_leaderboard_messages
  for select to authenticated using (is_admin());

alter table leaderboard_ap_baselines enable row level security;

drop policy if exists "leaderboard_ap_baselines: admin read" on leaderboard_ap_baselines;
create policy "leaderboard_ap_baselines: admin read" on leaderboard_ap_baselines
  for select to authenticated using (is_admin());
