import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260914005000_whitelabel_verification_handoff.sql";
const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", migrationName), "utf8");
const cleanSchema = readFileSync(path.join(process.cwd(), "src", "lib", "whitelabel", "provisioning", "clean-schema.ts"), "utf8");

describe("Ticket 5 verification/handoff SQL boundary", () => {
  it("stays control-plane only and out of the customer clean schema", () => {
    expect(sql).toContain("CONTROL-PLANE ONLY");
    expect(cleanSchema).not.toContain(migrationName);
    expect(sql).toContain("whitelabel_verification_run");
    expect(sql).toContain("whitelabel_verification_item");
    expect(sql).toContain("whitelabel_handoff");
    expect(sql).toContain("whitelabel_handoff_artifact");
  });

  it("blocks handoff until actual required checks and the verified deployment still match", () => {
    expect(sql).toContain("required_for_handoff and status <> 'passed'");
    expect(sql).toContain("handoff_requires_passed_verification");
    expect(sql).toContain("handoff_source_no_longer_matches_verified_installation");
    expect(sql).toContain("handoff_launch_additions_not_ready");
    expect(sql).toContain("v_provision.source_sha <> v_run.source_sha");
    expect(sql).toContain("v_provision.deployment_url <> v_run.deployment_url");
    expect(sql).toContain("'https://' || btrim(v_build.domain)");
    expect(sql).toContain("handoff_vercel_project_mismatch");
    expect(sql).toContain("handoff_supabase_project_mismatch");
  });

  it("enforces build isolation with composite foreign keys", () => {
    expect(sql).toContain("whitelabel_provisioning_run_id_build_unique");
    expect(sql).toContain("whitelabel_build_addition_id_build_unique");
    expect(sql).toContain("foreign key (run_id, build_id)");
    expect(sql).toContain("foreign key (addition_id, build_id)");
    expect(sql).toContain("foreign key (handoff_id, build_id)");
  });

  it("makes support windows canonical and keeps maintenance pricing exact", () => {
    expect(sql).toContain("status text not null default 'preparing'");
    expect(sql).toContain("whitelabel_add_business_days(v_delivered_at::date, 5)");
    expect(sql).toContain("v_delivered_at::date + 90");
    expect(sql).toContain("whitelabel_handoff_windows_are_immutable");
    expect(sql).toContain("maintenance_price_cents = 19700");
    expect(sql).not.toContain("grant select, insert, update, delete on table public.whitelabel_handoff to service_role");
    expect(sql).toContain("whitelabel_handoff_verification_is_immutable");
    expect(sql).toContain("whitelabel_verification_item_immutable_after_handoff");
  });

  it("starts support windows only after all required handoff artifacts exist", () => {
    expect(sql).toContain("finalize_whitelabel_handoff");
    expect(sql).toContain("whitelabel_handoff_pdf_required");
    expect(sql).toContain("whitelabel_handoff_manifest_required");
    expect(sql).toContain("whitelabel_handoff_source_package_required");
    expect(sql).toContain("a.safe_metadata->>'generated' = 'true'");
    expect(sql).toContain("a.safe_metadata->>'sourceSha' = v_handoff.installed_source_sha");
    expect(sql).toContain("a.safe_metadata->>'schemaRelease' = v_handoff.schema_release");
  });

  it("keeps lifecycle data and artifacts private to the service role", () => {
    for (const table of ["whitelabel_verification_run", "whitelabel_verification_item", "whitelabel_handoff", "whitelabel_handoff_artifact"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from anon, authenticated`);
    }
    expect(sql).toContain("values ('whitelabel-handoff-artifacts', 'whitelabel-handoff-artifacts', false)");
    expect(sql).toContain("sha256 ~ '^[0-9a-f]{64}$'");
  });
});
