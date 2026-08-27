-- Supabase may grant function execution to anon through default privileges.
-- These producer RPCs are authenticated application internals, so make that
-- boundary explicit. This is especially important for visible_person_ids(),
-- which is SECURITY DEFINER to avoid recursive RLS evaluation.
revoke execute on function visible_person_ids() from public, anon;
grant execute on function visible_person_ids() to authenticated, service_role;

revoke execute on function leaderboard_aggregates(date, date, text) from public, anon;
grant execute on function leaderboard_aggregates(date, date, text) to authenticated, service_role;

revoke execute on function producer_unread_flags() from public, anon;
grant execute on function producer_unread_flags() to authenticated, service_role;

revoke execute on function producer_client_sale_day(date, date, timestamptz, text) from public, anon;
grant execute on function producer_client_sale_day(date, date, timestamptz, text) to authenticated, service_role;

revoke execute on function producer_dashboard_day_buckets(uuid, date, date, text) from public, anon;
grant execute on function producer_dashboard_day_buckets(uuid, date, date, text) to authenticated, service_role;

revoke execute on function producer_analytics_bundle(uuid, date, date, text) from public, anon;
grant execute on function producer_analytics_bundle(uuid, date, date, text) to authenticated, service_role;

revoke execute on function producer_calendar_days(uuid, date, date, text) from public, anon;
grant execute on function producer_calendar_days(uuid, date, date, text) to authenticated, service_role;

revoke execute on function producer_money_text_to_cents(text) from public, anon;
grant execute on function producer_money_text_to_cents(text) to authenticated, service_role;

-- Production already had equivalent Gateway indexes under the older *_date_idx
-- names. The catch-up migration creates the canonical names for fresh databases;
-- only remove them when the equivalent legacy index is present.
do $$
begin
  if to_regclass('public.producer_issued_premium_period_date_idx') is not null then
    drop index if exists public.producer_issued_premium_period_report_idx;
  end if;

  if to_regclass('public.producer_issued_premium_person_period_date_idx') is not null then
    drop index if exists public.producer_issued_premium_person_period_report_idx;
  end if;
end;
$$;
