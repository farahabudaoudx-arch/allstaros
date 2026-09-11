-- Live Leaderboard #19: revocable view-only capability links.
-- Only a SHA-256 hash of each bearer token is persisted.

create table if not exists public.live_leaderboard_capability (
  id uuid primary key default gen_random_uuid(),
  creator_person_id uuid not null references public.person(id) on delete cascade,
  scope text not null check (scope in ('team', 'organization')),
  token_hash text not null unique check (char_length(token_hash) = 64),
  rotated_from_id uuid references public.live_leaderboard_capability(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);

create index if not exists live_leaderboard_capability_creator_created_idx
  on public.live_leaderboard_capability (creator_person_id, created_at desc);

create index if not exists live_leaderboard_capability_active_hash_idx
  on public.live_leaderboard_capability (token_hash)
  where revoked_at is null;

alter table public.live_leaderboard_capability enable row level security;
revoke all on public.live_leaderboard_capability from anon, authenticated;
grant select, insert, update, delete on public.live_leaderboard_capability to service_role;

-- Rotate old -> new atomically so there is never a committed window where both links are active.
create or replace function public.rotate_live_leaderboard_capability(
  p_capability_id uuid,
  p_creator_person_id uuid,
  p_new_token_hash text
)
returns table (
  id uuid,
  creator_person_id uuid,
  scope text,
  token_hash text,
  created_at timestamptz,
  revoked_at timestamptz,
  rotated_from_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text;
begin
  update public.live_leaderboard_capability
     set revoked_at = now()
   where live_leaderboard_capability.id = p_capability_id
     and live_leaderboard_capability.creator_person_id = p_creator_person_id
     and live_leaderboard_capability.revoked_at is null
  returning live_leaderboard_capability.scope into v_scope;

  if not found then
    return;
  end if;

  return query
  insert into public.live_leaderboard_capability (
    creator_person_id, scope, token_hash, rotated_from_id
  ) values (
    p_creator_person_id, v_scope, p_new_token_hash, p_capability_id
  )
  returning
    live_leaderboard_capability.id,
    live_leaderboard_capability.creator_person_id,
    live_leaderboard_capability.scope,
    live_leaderboard_capability.token_hash,
    live_leaderboard_capability.created_at,
    live_leaderboard_capability.revoked_at,
    live_leaderboard_capability.rotated_from_id;
end;
$$;

revoke all on function public.rotate_live_leaderboard_capability(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.rotate_live_leaderboard_capability(uuid, uuid, text) to service_role;
