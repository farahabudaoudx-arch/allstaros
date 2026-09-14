import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

// Customer projects get the same schema lineage, but never the Assembly Line
// control-plane migrations and never the two explicit demo/sample-data seeds.
// Mixed historical migrations that contain an old All Star seed are safe here
// because the final cleanup runs before any app deployment or customer invite.
export const CLEAN_CUSTOMER_MIGRATIONS = [
  "20260525000100_extensions.sql",
  "20260525000200_schema.sql",
  "20260525000300_helpers.sql",
  "20260525000400_rls.sql",
  "20260525000500_phase_state_machine.sql",
  "20260525000600_flagging.sql",
  "20260601000100_owner_visibility.sql",
  "20260601000200_producer_sales_tracking.sql",
  "20260601000400_clients.sql",
  "20260601000400_daily_projection.sql",
  "20260601000500_producer_goal.sql",
  "20260601000600_recruit_mark_studying.sql",
  "20260601000700_recruit_signup.sql",
  "20260602000100_exam_attempts.sql",
  "20260602000200_guide_read.sql",
  "20260602000300_licensing_submitted.sql",
  "20260603000100_message_channel_realtime.sql",
  "20260606000100_client_beneficiaries.sql",
  "20260606000200_person_phone.sql",
  "20260608000100_lead_purchases.sql",
  "20260608000200_client_private_notes.sql",
  "20260608000300_tracker_leads.sql",
  "20260608000400_drop_dead_funnel.sql",
  "20260608010000_admin_roles.sql",
  "20260608010100_training_schedule.sql",
  "20260608010200_training_content.sql",
  "20260608010300_login_event.sql",
  "20260608010400_admin_audit.sql",
  "20260610000100_builder_settings.sql",
  "20260610000200_message_read.sql",
  "20260611000100_remove_recruit_unrestricted.sql",
  "20260611000200_tracker_sales_from_clients.sql",
  "20260611000300_policy_contact.sql",
  "20260612000100_ai_usage_log.sql",
  "20260612000200_ai_conversation_log.sql",
  "20260612000300_clients_person_created_idx.sql",
  "20260612000400_drop_unused_client_pii.sql",
  "20260701000100_npn_tracking.sql",
  "20260702000100_discord_notifications.sql",
  "20260722000100_person_headshot.sql",
  "20260810000100_scorecard_foundation.sql",
  "20260811211917_validated_scorecard_runs.sql",
  "20260815000100_set_based_rls_visibility.sql",
  "20260815000200_leaderboard_aggregates.sql",
  "20260821000100_producer_unread_flags.sql",
  "20260821000200_producer_metrics_aggregates.sql",
  "20260821224151_safe_analytics_money_parsing.sql",
  "20260821224720_harden_producer_functions_and_dedupe_indexes.sql",
  "20260829000100_freeze_published_scorecard_snapshots.sql",
  "20260829000200_scorecard_visibility.sql",
  "20260831000100_manual_scorecard_generation.sql",
  "20260903000100_scorecard_correction_workflow.sql",
  "20260904000600_scorecard_auto_publish.sql",
  "20260909000100_live_leaderboard_capabilities.sql",
  "20260914002000_installation_config.sql",
] as const;

export const CLEANUP_MIGRATION_KEY = "__whitelabel_clean_customer_data_v1__";

export async function readCustomerMigrationSql(name: string): Promise<string> {
  if (!(CLEAN_CUSTOMER_MIGRATIONS as readonly string[]).includes(name)) {
    throw new Error("Migration is not approved for customer provisioning.");
  }
  return readFile(path.join(process.cwd(), "supabase", "migrations", name), "utf8");
}

export function migrationMarkerSql(name: string, sql: string): string {
  const marker = name.replace(/'/g, "''");
  return `begin;\ncreate table if not exists public.installation_schema_migration (\n  migration_name text primary key,\n  applied_at timestamptz not null default now()\n);\n${sql}\ninsert into public.installation_schema_migration (migration_name) values ('${marker}') on conflict do nothing;\ncommit;`;
}

export const CLEAN_CUSTOMER_DATA_SQL = `begin;
do $$
declare
  row record;
begin
  for row in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
      and tablename not in ('installation_config', 'installation_schema_migration')
  loop
    execute format('truncate table %I.%I restart identity cascade', row.schemaname, row.tablename);
  end loop;
end $$;
insert into public.installation_schema_migration (migration_name)
values ('${CLEANUP_MIGRATION_KEY}') on conflict do nothing;
commit;`;

export const CHECK_MIGRATION_SQL =
  "select migration_name from public.installation_schema_migration where migration_name = $1 limit 1";

export const CLEAN_DATABASE_ASSERTION_SQL = `
select json_build_object(
  'people', (select count(*) from public.person),
  'recruits', (select count(*) from public.recruit),
  'clients', (select count(*) from public.clients),
  'training_content', (select count(*) from public.training_content),
  'training_schedule', (select count(*) from public.training_schedule),
  'notification_destinations', (select count(*) from public.notification_destinations),
  'carrier_links', (select count(*) from public.installation_carrier_link),
  'tracker_entries', (select count(*) from public.tracker_entry),
  'policy_submissions', (select count(*) from public.policy_submission)
) as counts`;
