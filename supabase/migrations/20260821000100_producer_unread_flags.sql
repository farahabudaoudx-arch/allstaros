-- Performance: producer unread badges as existence checks.
--
-- getProducerUnread() used to pull every visible builder-channel non-AI message
-- (newest first) plus all read receipts, then scan in JS for two booleans.
-- On a busy builder that meant transferring a large message payload on every
-- producer page that loads menu chrome.
--
-- Fix: one SECURITY INVOKER function that returns (upline, team) via EXISTS.
-- RLS on message / recruit / message_read still applies — the viewer only sees
-- threads they can already open. auth_person_id() is used so callers cannot
-- probe another person's unread state by passing a foreign id.

create or replace function producer_unread_flags()
returns table (upline boolean, team boolean)
language sql
stable
security invoker
set search_path = public
as $$
  with me as (
    select auth_person_id() as person_id
  ),
  own as (
    select r.id as recruit_id
    from recruit r
    join me on r.person_id = me.person_id
    limit 1
  )
  select
    exists (
      select 1
      from message m
      join own o on o.recruit_id = m.recruit_id
      join me on true
      left join message_read mr
        on mr.recruit_id = m.recruit_id
       and mr.person_id = me.person_id
      where m.channel = 'builder'
        and m.is_ai = false
        and m.sender_person_id is distinct from me.person_id
        and (mr.last_read_at is null or m.created_at > mr.last_read_at)
    ) as upline,
    exists (
      select 1
      from message m
      join me on true
      left join own o on o.recruit_id = m.recruit_id
      left join message_read mr
        on mr.recruit_id = m.recruit_id
       and mr.person_id = me.person_id
      where m.channel = 'builder'
        and m.is_ai = false
        and m.sender_person_id is distinct from me.person_id
        and o.recruit_id is null
        and (mr.last_read_at is null or m.created_at > mr.last_read_at)
    ) as team;
$$;

grant execute on function producer_unread_flags() to authenticated;
