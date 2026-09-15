import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260915001000_whitelabel_updates_independent_operation.sql";
const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", migrationName), "utf8");
const ticketFive = readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "20260914005000_whitelabel_verification_handoff.sql"),
  "utf8",
);
const cleanSchema = readFileSync(
  path.join(process.cwd(), "src", "lib", "whitelabel", "provisioning", "clean-schema.ts"),
  "utf8",
);

const lifecycleTables = [
  "whitelabel_installation",
  "whitelabel_installation_version",
  "whitelabel_maintenance_event",
  "whitelabel_installation_entitlement",
  "whitelabel_release",
  "whitelabel_release_migration",
  "whitelabel_rollout",
  "whitelabel_rollout_entitlement",
  "whitelabel_update_attempt",
  "whitelabel_recovery_point",
  "whitelabel_recovery_run",
] as const;

describe("Ticket 6 updates / independent-operation SQL boundary", () => {
  it("is control-plane only and stays out of the customer clean schema", () => {
    expect(sql).toContain("CONTROL-PLANE ONLY");
    expect(cleanSchema).not.toContain(migrationName);
    for (const table of lifecycleTables) {
      expect(sql).toContain(`public.${table}`);
    }
    expect(sql).not.toContain("CLEAN_CUSTOMER_DATA_SQL");
  });

  it("keeps Ticket 5 handoff verification intact while adding exact operational origins", () => {
    expect(ticketFive).toContain("start_whitelabel_handoff_verification");
    expect(ticketFive).toContain("finalize_whitelabel_verification");
    expect(sql).toContain("alter column provisioning_run_id drop not null");
    expect(sql).toContain("whitelabel_verification_run_exact_origin_check");
    expect(sql).toContain("kind = 'handoff'");
    expect(sql).toContain("kind = 'post_update'");
    expect(sql).toContain("kind = 'compatibility'");
    expect(sql).toContain("and provisioning_run_id is not null");
    expect(sql).toContain("and update_attempt_id is not null");
    expect(sql).toContain("start_whitelabel_operational_verification");
    expect(sql).toContain("finalize_whitelabel_operational_verification");
    expect(sql).toContain("drop index if exists public.whitelabel_verification_one_active_build_idx");
    expect(sql).toContain("where kind = 'handoff' and status in ('draft', 'running', 'blocked')");
    expect(sql).toContain("whitelabel_verification_one_active_post_update_idx");
    expect(sql).toContain("whitelabel_verification_one_running_compatibility_idx");
    expect(sql).not.toContain("create or replace function public.start_whitelabel_handoff_verification");
    expect(sql).not.toContain("create or replace function public.finalize_whitelabel_verification");
  });

  it("uses immutable installed-version and maintenance history with delivered-handoff bootstrap", () => {
    expect(sql).toContain("origin_kind text not null check (origin_kind in ('handoff', 'update', 'recovery'))");
    expect(sql).toContain("whitelabel_installation_version_append_only");
    expect(sql).toContain("whitelabel_installation_version_insert_guard");
    expect(sql).toContain("whitelabel_version_ledger_requires_delivered_handoff");
    expect(sql).toContain("whitelabel_version_ledger_requires_passed_post_update_verification");
    expect(sql).toContain("whitelabel_maintenance_event_append_only");
    expect(sql).toContain("whitelabel_history_is_append_only");
    expect(sql).toContain("bootstrap_whitelabel_installation_lifecycle");
    expect(sql).toContain("v_handoff.status <> 'delivered'");
    expect(sql).toContain("whitelabel_lifecycle_requires_delivered_handoff");
    expect(sql).toContain("'base:standard-os'");
    expect(sql).toContain("'addition:' || addition.id::text");
  });

  it("models release, rollout, entitlement, attempt, and recovery state machines", () => {
    expect(sql).toContain("status in ('draft', 'ready', 'running', 'paused', 'completed', 'withdrawn')");
    expect(sql).toContain("status in ('queued', 'notified', 'running', 'verifying', 'succeeded', 'failed', 'recovering', 'recovered', 'cancelled')");
    expect(sql).toContain("status in ('scheduled', 'running', 'awaiting_verification', 'succeeded', 'paused', 'recovery_required', 'recovered', 'cancelled')");
    expect(sql).toContain("'start_post_update_verification'");
    expect(sql).toContain("'awaiting_verification'");
    expect(sql).toContain("whitelabel_rollout_one_active_installation_idx");
    expect(sql).toContain("whitelabel_rollout_one_mutating_release_idx");
    expect(sql).toContain("whitelabel_update_attempt_one_active_installation_idx");
    expect(sql).toContain("whitelabel_recovery_run_one_active_installation_idx");
    expect(sql).toContain("policy in ('preserve', 'upgrade', 'manual_review')");
    expect(sql).toContain("whitelabel_update_entitlements_not_verified");
    expect(sql).toContain("recovery_strategy in ('forward_fix', 'restore_then_replay')");
    expect(sql).toContain("database_recovery_mode in ('forward_fix', 'restore_then_replay')");
    expect(sql).toContain("database_recovery_mode = 'forward_fix'");
    expect(sql).toContain("or database_snapshot_ref is not null");
    expect(sql).toContain("newer_records_preserved");
    expect(sql).toContain("preservation_evidence <> '{}'::jsonb");
    expect(sql).toContain("pause_whitelabel_release_on_update_failure");
    expect(sql).toContain("new.status = 'recovery_required'");
    expect(sql).toContain("sync_whitelabel_installation_entitlements");
    expect(sql).toContain("'entitlements_synced'");
    expect(sql).toContain("public.whitelabel_installation_entitlement.status = 'pending_delivery'");
  });

  it("pins release migration SQL and freezes release identity/migrations after draft", () => {
    expect(sql).toContain("migration_sql text not null");
    expect(sql).toContain("sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$')");
    expect(sql).toContain("whitelabel_release_migrations_immutable_after_ready");
    expect(sql).toContain("whitelabel_release_identity_immutable_after_draft");
    expect(sql).toContain("whitelabel_invalid_release_status_transition");
    expect(sql).toContain("whitelabel_release_migration_draft_only");
    expect(sql).toContain("old.status = 'paused' and new.status in ('running', 'withdrawn')");
  });

  it("blocks updates for independent or unmaintained installations and requires compatibility to rejoin", () => {
    expect(sql).toContain("operation_mode in ('managed', 'independent', 'rejoining')");
    expect(sql).toContain("whitelabel_independent_installation_updates_blocked");
    expect(sql).toContain("whitelabel_update_requires_active_maintenance");
    expect(sql).toContain("whitelabel_cannot_change_maintenance_during_active_update");
    expect(sql).toContain("Maintenance is no longer active.");
    expect(sql).toContain("enter_whitelabel_independent_operation");
    expect(sql).toContain("attempt.status = 'scheduled'");
    expect(sql).not.toContain("attempt.status = 'pending'");
    expect(sql).toContain("v_installation.operation_mode not in ('managed', 'rejoining')");
    expect(sql).toContain("'independent_operation_started'");
    expect(sql).toContain("'rejoin_cancelled_independent'");
    expect(sql).toContain("begin_whitelabel_rejoin");
    expect(sql).toContain("'rejoin_started'");
    expect(sql).toContain("complete_whitelabel_rejoin");
    expect(sql).toContain("'rejoin_completed'");
    expect(sql).toContain("whitelabel_rejoin_requires_passed_compatibility_verification");
    expect(sql).toContain("verification.kind = 'compatibility'");
  });

  it("promotes the installed version only after passed post-update verification", () => {
    expect(sql).toContain("promote_whitelabel_installed_version");
    expect(sql).toContain("whitelabel_version_promotion_requires_passed_post_update_verification");
    expect(sql).toContain("verification.kind = 'post_update'");
    expect(sql).toContain("verification.status = 'passed'");
    expect(sql).toContain("whitelabel_installation_version_pointer_guard");
    expect(sql).toContain("v_attempt.status <> 'awaiting_verification'");
    expect(sql).toContain("v_attempt.verification_run_id is null");
    expect(sql).toContain("set current_version_id = v_version_id");
    expect(sql).toContain("set status = 'succeeded', completed_at = now(), last_error = null");
  });

  it("records recovery atomically without rewinding the customer database", () => {
    expect(sql).toContain("record_whitelabel_recovery_version");
    expect(sql).toContain("database_recovery_mode <> 'forward_fix'");
    expect(sql).toContain("not v_recovery.newer_records_preserved");
    expect(sql).toContain("'strategy', 'database-left-in-place'");
    expect(sql).toContain("'forwardSchemaRelease', p_schema_release");
    expect(sql).toContain("where installation_id = p_installation_id");
    expect(sql).toContain("and source_sha = p_source_sha");
    expect(sql).toContain("and schema_release = p_schema_release");
    expect(sql).toContain("if v_existing_version_id is not null then");
    expect(sql).toContain("'recovery', p_recovery_run_id, p_actor_id");
    expect(sql).toContain("set status = 'recovered', completed_at = now(), last_error = null");
  });

  it("fences build/installation relationships with composite foreign keys", () => {
    expect(sql).toContain("foreign key (handoff_id, build_id)");
    expect(sql).toContain("foreign key (installation_id, build_id)");
    expect(sql).toContain("foreign key (from_version_id, build_id, installation_id)");
    expect(sql).toContain("foreign key (update_attempt_id, build_id, installation_id)");
    expect(sql).toContain("foreign key (recovery_run_id, build_id, installation_id)");
    expect(sql).toContain("foreign key (entitlement_id, build_id, installation_id)");
    expect(sql).toContain("foreign key (recovery_point_id, build_id, installation_id)");
  });

  it("keeps every Ticket 6 lifecycle table private to service_role", () => {
    for (const table of lifecycleTables) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from anon, authenticated`);
    }
    expect(sql).toContain("grant execute on function public.bootstrap_whitelabel_installation_lifecycle");
    expect(sql).toContain("grant execute on function public.sync_whitelabel_installation_entitlements");
    expect(sql).toContain("grant execute on function public.start_whitelabel_operational_verification");
    expect(sql).toContain("grant execute on function public.promote_whitelabel_installed_version");
    expect(sql).toContain("grant execute on function public.record_whitelabel_recovery_version");
  });
});
