-- Read-only Gateway production schema verification.
-- Run after applying repository migrations and before enabling runner traffic.

select
  (select max(version) from supabase_migrations.schema_migrations) as latest_migration,
  to_regclass('public.gateway_connection') is not null as gateway_connection_exists,
  to_regclass('public.gateway_connect_request') is not null as gateway_connect_request_exists,
  to_regclass('public.gateway_report_pull_job') is not null as gateway_report_pull_job_exists,
  to_regclass('public.gateway_report_pull_claim_request') is not null as gateway_report_pull_claim_request_exists,
  to_regclass('public.gateway_report_pull_artifact') is not null as gateway_report_pull_artifact_exists,
  to_regclass('public.scorecard_auto_publish_period') is not null as scorecard_auto_publish_period_exists,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'gateway_report_pull_job' and column_name = 'claim_token'
  ) as report_job_claim_token_exists,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'gateway_report_pull_job' and column_name = 'session_generation'
  ) as report_job_session_generation_exists,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'producer_issued_premium' and column_name = 'source_kind'
  ) as issued_premium_source_kind_exists,
  exists (select 1 from pg_proc where proname = 'begin_gateway_connection') as begin_connection_rpc_exists,
  exists (select 1 from pg_proc where proname = 'complete_gateway_connection') as complete_connection_rpc_exists,
  exists (select 1 from pg_proc where proname = 'mint_gateway_monday_report_pull_jobs') as monday_pull_rpc_exists,
  exists (select 1 from pg_proc where proname = 'claim_gateway_report_pull_job') as claim_pull_rpc_exists,
  exists (select 1 from pg_proc where proname = 'renew_gateway_report_pull_job_lease') as renew_pull_rpc_exists,
  exists (select 1 from pg_proc where proname = 'complete_gateway_report_pull_job') as complete_pull_rpc_exists,
  exists (select 1 from pg_proc where proname = 'fail_gateway_report_pull_job') as fail_pull_rpc_exists,
  exists (select 1 from pg_proc where proname = 'register_gateway_report_pull_artifact') as register_pull_artifact_rpc_exists,
  exists (select 1 from pg_proc where proname = 'authorize_gateway_report_pull_artifact_upload') as authorize_pull_artifact_rpc_exists,
  exists (select 1 from pg_proc where proname = 'confirm_gateway_report_pull_artifact_upload') as confirm_pull_artifact_rpc_exists,
  exists (
    select 1
    from storage.buckets
    where id = 'gateway-report-evidence' and public = false
  ) as gateway_report_evidence_bucket_private;
