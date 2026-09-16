-- Compatibility helper for scorecard migrations that originally referenced
-- current_person_id(). The canonical auth resolver has always been
-- auth_person_id(); keep the historical scorecard SQL immutable and expose the
-- old helper name as a stable wrapper for clean installs.

create or replace function public.current_person_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.auth_person_id();
$$;

revoke all on function public.current_person_id() from public, anon;
grant execute on function public.current_person_id() to authenticated, service_role;
