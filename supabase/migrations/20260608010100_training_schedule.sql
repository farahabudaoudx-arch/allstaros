-- Training schedule. Moves the hardcoded events in EventSchedule.tsx into the
-- database so admins can manage upcoming live trainings. The producer dashboard
-- reads from this table; all authenticated users can read, only admins write.

create table if not exists training_schedule (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  host text not null default '',
  initials text not null default '',
  image text,
  kicker text,
  event_date date not null,
  start_time time not null default '08:30',
  end_time time not null default '09:00',
  timezone text not null default 'America/Chicago',
  zoom_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists training_schedule_order_idx
  on training_schedule(sort_order, event_date);

drop trigger if exists training_schedule_updated_at on training_schedule;
create trigger training_schedule_updated_at
  before update on training_schedule
  for each row execute function set_updated_at();

alter table training_schedule enable row level security;

drop policy if exists "training_schedule: read" on training_schedule;
create policy "training_schedule: read" on training_schedule
  for select to authenticated using (true);

drop policy if exists "training_schedule: admin write" on training_schedule;
create policy "training_schedule: admin write" on training_schedule
  for all to authenticated using (is_admin()) with check (is_admin());

-- Seed the four events previously hardcoded in EventSchedule.tsx.
insert into training_schedule
  (slug, title, host, initials, image, kicker, event_date, start_time, end_time, zoom_url, sort_order)
values
  ('ring-of-objections', 'Ring of Objections', 'Preston Beck', 'PB',
   '/events/ring-of-objections.png', 'Special Training', '2026-05-11', '08:30', '09:00',
   'https://us02web.zoom.us/j/87144901286?pwd=Q0FuQXFDbXJ3ZjFSbVV1Wm95ZzNsUT09', 1),
  ('the-why', 'The Why', 'Graham Hatley', 'GH',
   '/events/the-why.png', null, '2026-05-12', '08:30', '09:00',
   'https://us02web.zoom.us/j/87144901286?pwd=Q0FuQXFDbXJ3ZjFSbVV1Wm95ZzNsUT09', 2),
  ('financial-inventory', 'Financial Inventory', 'Ethan Fox', 'EF',
   '/events/financial-inventory.png', null, '2026-05-13', '08:30', '09:00',
   'https://us02web.zoom.us/j/87144901286?pwd=Q0FuQXFDbXJ3ZjFSbVV1Wm95ZzNsUT09', 3),
  ('application-close', 'Application & Close', 'Aidan Abell', 'AA',
   '/events/application-close.png', null, '2026-05-14', '08:30', '09:00',
   'https://us02web.zoom.us/j/87144901286?pwd=Q0FuQXFDbXJ3ZjFSbVV1Wm95ZzNsUT09', 4)
on conflict (slug) do nothing;
