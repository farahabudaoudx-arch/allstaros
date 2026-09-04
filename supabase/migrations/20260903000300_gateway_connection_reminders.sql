-- Ticket #006: durable, non-blocking Gateway connection reminders.
-- Reminder cadence uses America/Chicago in application code.

create table if not exists public.gateway_connection_reminder (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.person(id) on delete cascade,
  reminder_key text not null,
  kind text not null check (kind in ('launch', 'monday')),
  business_date date not null,
  variant text not null check (variant in ('connect', 'reconnect')),
  popup_dismissed_at timestamptz,
  email_status text not null default 'pending'
    check (email_status in ('pending', 'sent', 'failed', 'missing_recipient', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempted_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, reminder_key)
);

create unique index if not exists gateway_connection_reminder_one_cycle_per_business_date_idx
  on public.gateway_connection_reminder (person_id, business_date);

create index if not exists gateway_connection_reminder_delivery_idx
  on public.gateway_connection_reminder (business_date, email_status, created_at);

alter table public.gateway_connection_reminder enable row level security;

create or replace function public.ensure_gateway_launch_reminder(
  p_person_id uuid,
  p_business_date date
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_first_connected_at timestamptz;
  v_status text;
begin
  if p_person_id is null or p_business_date is null then
    raise exception 'invalid_gateway_launch_reminder';
  end if;

  if not exists (
    select 1 from public.person p
    where p.id = p_person_id
      and p.status = 'active'
      and (p.is_producer or p.is_builder)
  ) then
    return null;
  end if;

  select r.id into v_id
  from public.gateway_connection_reminder r
  where r.person_id = p_person_id
    and r.business_date = p_business_date
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select c.first_connected_at, c.status
  into v_first_connected_at, v_status
  from public.gateway_connection c
  where c.person_id = p_person_id
  for update;

  if v_status = 'connected' or v_first_connected_at is not null then
    return null;
  end if;

  if exists (
    select 1 from public.gateway_connect_request q
    where q.person_id = p_person_id
      and q.status = 'pending'
      and q.expires_at > now()
  ) then
    return null;
  end if;

  select r.id into v_id
  from public.gateway_connection_reminder r
  where r.person_id = p_person_id
    and r.reminder_key = 'launch:v1'
  limit 1;
  if v_id is not null then
    return null;
  end if;

  insert into public.gateway_connection_reminder (
    person_id, reminder_key, kind, business_date, variant
  ) values (
    p_person_id, 'launch:v1', 'launch', p_business_date, 'connect'
  )
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    select r.id into v_id
    from public.gateway_connection_reminder r
    where r.person_id = p_person_id
      and r.business_date = p_business_date
    limit 1;
  end if;

  return v_id;
end;
$$;

create or replace function public.mint_gateway_monday_reminders(
  p_business_date date
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer := 0;
begin
  if p_business_date is null then
    raise exception 'invalid_gateway_monday_business_date';
  end if;

  insert into public.gateway_connection_reminder (
    person_id, reminder_key, kind, business_date, variant
  )
  select
    p.id,
    'monday:' || p_business_date::text,
    'monday',
    p_business_date,
    case when c.first_connected_at is null then 'connect' else 'reconnect' end
  from public.person p
  left join public.gateway_connection c on c.person_id = p.id
  where p.status = 'active'
    and (p.is_producer or p.is_builder)
    and coalesce(c.status, 'disconnected') <> 'connected'
    and not exists (
      select 1 from public.gateway_connect_request q
      where q.person_id = p.id
        and q.status = 'pending'
        and q.expires_at > now()
    )
    and (
      c.first_connected_at is not null
      or exists (
        select 1 from public.gateway_connection_reminder launch
        where launch.person_id = p.id
          and launch.reminder_key = 'launch:v1'
      )
    )
  on conflict do nothing;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

create or replace function public.dismiss_gateway_connection_reminder(
  p_person_id uuid,
  p_reminder_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer := 0;
begin
  update public.gateway_connection_reminder
  set popup_dismissed_at = coalesce(popup_dismissed_at, now()),
      updated_at = now()
  where id = p_reminder_id
    and person_id = p_person_id;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

create or replace function public.cancel_gateway_reminders_on_connected()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'connected' and old.status is distinct from 'connected' then
    update public.gateway_connection_reminder
    set popup_dismissed_at = coalesce(popup_dismissed_at, now()),
        email_status = case
          when email_status in ('pending', 'failed') then 'cancelled'
          else email_status
        end,
        last_error = case
          when email_status in ('pending', 'failed') then null
          else last_error
        end,
        updated_at = now()
    where person_id = new.person_id;
  end if;
  return new;
end;
$$;

drop trigger if exists gateway_connection_cancel_reminders_when_connected
  on public.gateway_connection;
create trigger gateway_connection_cancel_reminders_when_connected
after update of status on public.gateway_connection
for each row
execute function public.cancel_gateway_reminders_on_connected();

revoke all on table public.gateway_connection_reminder from public, anon, authenticated;
grant all on table public.gateway_connection_reminder to service_role;

revoke all on function public.ensure_gateway_launch_reminder(uuid, date)
  from public, anon, authenticated;
grant execute on function public.ensure_gateway_launch_reminder(uuid, date)
  to service_role;

revoke all on function public.mint_gateway_monday_reminders(date)
  from public, anon, authenticated;
grant execute on function public.mint_gateway_monday_reminders(date)
  to service_role;

revoke all on function public.dismiss_gateway_connection_reminder(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.dismiss_gateway_connection_reminder(uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';