-- Recruit↔builder live chat.
--
-- The `message` table is shared by two conversations: the AI assistant (Casey)
-- and the human builder chat. Add a `channel` column to keep them separate, and
-- publish the table to Realtime so new messages stream into open chat windows.

-- 1. channel: 'builder' (recruit <-> builder) or 'assistant' (Casey Q&A).
alter table message add column if not exists channel text not null default 'builder';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'message_channel_check'
  ) then
    alter table message
      add constraint message_channel_check check (channel in ('builder', 'assistant'));
  end if;
end $$;

-- Existing AI messages belong to the assistant thread. (Human questions that
-- were asked to Casey stay on the default 'builder' channel — acceptable for
-- the small amount of pre-existing demo data.)
update message set channel = 'assistant' where is_ai = true;

-- 2. Realtime: publish the table so subscribers receive INSERTs live. RLS still
--    applies, so each user only receives messages on threads they can view.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message'
  ) then
    alter publication supabase_realtime add table message;
  end if;
end $$;
