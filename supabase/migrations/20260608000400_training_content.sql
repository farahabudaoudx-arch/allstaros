-- Training content. Moves the hardcoded Bootcamp / Accelerator / Uplevel course
-- arrays (src/lib/producer/trainings.ts) into the database so admins can add or
-- remove videos by pasting a Bunny Stream embed link. Each row is one video in a
-- library; the program pages render a flat list. The 'recruit' and 'live'
-- libraries are tracked in the enum for the unified admin UI, though those pages
-- keep reading Bunny / training_lesson directly.
--
-- No seed: the program pages fall back to the existing hardcoded catalog when a
-- library has zero rows, so nothing breaks before admins add content.

create table if not exists training_content (
  id uuid primary key default gen_random_uuid(),
  library text not null
    check (library in ('recruit', 'live', 'bootcamp', 'accelerator', 'uplevel')),
  title text not null,
  embed_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists training_content_lib_idx
  on training_content(library, sort_order);

drop trigger if exists training_content_updated_at on training_content;
create trigger training_content_updated_at
  before update on training_content
  for each row execute function set_updated_at();

alter table training_content enable row level security;

drop policy if exists "training_content: read" on training_content;
create policy "training_content: read" on training_content
  for select to authenticated using (true);

drop policy if exists "training_content: admin write" on training_content;
create policy "training_content: admin write" on training_content
  for all to authenticated using (is_admin()) with check (is_admin());
