-- Ticket #006 follow-up: make first-open reminder claims race-safe and ensure
-- Monday reminders can be materialized by the app shell before the cron tick.

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

  insert into public.gateway_connection (person_id)
  values (p_person_id)
  on conflict (person_id) do nothing;

  select c.first_connected_at, c.status
  into v_first_connected_at, v_status
  from public.gateway_connection c
  where c.person_id = p_person_id
  for update;

  if v_status = 'connected' then
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
    and r.business_date = p_business_date
  limit 1;
  if v_id is not null then
    return v_id;
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
    p_person_id,
    'launch:v1',
    'launch',
    p_business_date,
    case when v_first_connected_at is null then 'connect' else 'reconnect' end
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

create or replace function public.ensure_gateway_monday_reminder(
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
    raise exception 'invalid_gateway_monday_reminder';
  end if;

  if not exists (
    select 1 from public.person p
    where p.id = p_person_id
      and p.status = 'active'
      and (p.is_producer or p.is_builder)
  ) then
    return null;
  end if;

  insert into public.gateway_connection (person_id)
  values (p_person_id)
  on conflict (person_id) do nothing;

  select c.first_connected_at, c.status
  into v_first_connected_at, v_status
  from public.gateway_connection c
  where c.person_id = p_person_id
  for update;

  if v_status = 'connected' then
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
    and r.business_date = p_business_date
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  if not exists (
    select 1 from public.gateway_connection_reminder launch
    where launch.person_id = p_person_id
      and launch.reminder_key = 'launch:v1'
  ) then
    return null;
  end if;

  insert into public.gateway_connection_reminder (
    person_id, reminder_key, kind, business_date, variant
  ) values (
    p_person_id,
    'monday:' || p_business_date::text,
    'monday',
    p_business_date,
    case when v_first_connected_at is null then 'connect' else 'reconnect' end
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
    and exists (
      select 1 from public.gateway_connection_reminder launch
      where launch.person_id = p.id
        and launch.reminder_key = 'launch:v1'
    )
  on conflict do nothing;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.ensure_gateway_launch_reminder(uuid, date)
  from public, anon, authenticated;
grant execute on function public.ensure_gateway_launch_reminder(uuid, date)
  to service_role;

revoke all on function public.ensure_gateway_monday_reminder(uuid, date)
  from public, anon, authenticated;
grant execute on function public.ensure_gateway_monday_reminder(uuid, date)
  to service_role;

revoke all on function public.mint_gateway_monday_reminders(date)
  from public, anon, authenticated;
grant execute on function public.mint_gateway_monday_reminders(date)
  to service_role;

notify pgrst, 'reload schema';
