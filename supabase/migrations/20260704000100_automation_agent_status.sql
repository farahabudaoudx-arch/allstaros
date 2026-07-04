-- Automation agent monitoring.
--
-- Rentamac and any future worker machines report heartbeats + run receipts here.
-- Writes happen server-side through token-protected API routes using the service
-- role. Admins can read the status/dashboard rows.

create table if not exists automation_agent_status (
  agent_id text primary key,
  agent_name text not null,
  machine_id text not null,
  source text not null default 'rentamac',
  status text not null default 'unknown'
    check (status in ('online', 'running', 'success', 'partial', 'failed', 'offline', 'unknown')),
  last_heartbeat_at timestamptz,
  last_run_id uuid,
  last_run_status text
    check (last_run_status is null or last_run_status in ('running', 'success', 'partial', 'failed')),
  last_run_started_at timestamptz,
  last_run_finished_at timestamptz,
  last_success_at timestamptz,
  last_error_message text,
  report_date date,
  report_label text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists automation_agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references automation_agent_status(agent_id) on delete cascade,
  machine_id text not null,
  source text not null default 'rentamac',
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  report_date date,
  report_label text,
  wtd_status text check (wtd_status is null or wtd_status in ('success', 'skipped', 'failed', 'not_run')),
  wtd_rows integer,
  wtd_pages integer,
  mtd_status text check (mtd_status is null or mtd_status in ('success', 'skipped', 'failed', 'not_run')),
  mtd_rows integer,
  mtd_pages integer,
  ytd_status text check (ytd_status is null or ytd_status in ('success', 'skipped', 'failed', 'not_run')),
  ytd_rows integer,
  ytd_pages integer,
  error_message text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_agent_status_updated_idx
  on automation_agent_status(updated_at desc);

create index if not exists automation_agent_runs_agent_started_idx
  on automation_agent_runs(agent_id, started_at desc);

create index if not exists automation_agent_runs_status_idx
  on automation_agent_runs(status, started_at desc);

alter table automation_agent_status enable row level security;
alter table automation_agent_runs enable row level security;

drop policy if exists "automation_agent_status: admin read" on automation_agent_status;
create policy "automation_agent_status: admin read" on automation_agent_status
  for select to authenticated using (is_admin());

drop policy if exists "automation_agent_runs: admin read" on automation_agent_runs;
create policy "automation_agent_runs: admin read" on automation_agent_runs
  for select to authenticated using (is_admin());
