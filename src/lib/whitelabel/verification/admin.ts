import "server-only";

import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type WhitelabelVerificationRun = {
  id: string;
  build_id: string;
  provisioning_run_id: string;
  kind: "handoff" | "post_update" | "compatibility";
  source_sha: string;
  schema_release: string;
  deployment_url: string;
  status: "draft" | "running" | "blocked" | "passed";
  started_by: string | null;
  completed_by: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WhitelabelVerificationItem = {
  id: string;
  run_id: string;
  build_id: string;
  check_key: string;
  label: string;
  category: string;
  mode: "automated" | "manual";
  source_kind: "base" | "addition";
  addition_id: string | null;
  required_for_handoff: boolean;
  status: "pending" | "passed" | "failed" | "deferred" | "not_applicable";
  expected_summary: string | null;
  actual_summary: string | null;
  evidence: Record<string, unknown>;
  checked_by: string | null;
  checked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WhitelabelHandoff = {
  id: string;
  build_id: string;
  verification_run_id: string;
  provisioning_run_id: string;
  status: "preparing" | "delivered";
  handoff_at: string | null;
  review_deadline: string | null;
  defect_deadline: string | null;
  installed_source_sha: string;
  schema_release: string;
  os_url: string;
  vercel_project_ref: string;
  supabase_project_ref: string;
  initial_admin_email: string;
  maintenance_status: "selected" | "declined";
  maintenance_price_cents: number | null;
  safe_config_snapshot: Record<string, unknown>;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WhitelabelHandoffArtifact = {
  id: string;
  handoff_id: string;
  build_id: string;
  kind: "handoff_pdf" | "source_package" | "manifest";
  revision: number;
  storage_path: string;
  sha256: string;
  byte_size: number;
  content_type: string;
  safe_metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  signedUrl?: string | null;
};

export type VerificationAdminView = {
  available: boolean;
  run: WhitelabelVerificationRun | null;
  items: WhitelabelVerificationItem[];
  handoff: WhitelabelHandoff | null;
  artifacts: WhitelabelHandoffArtifact[];
};

function missingTicketFive(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error
      && (error.code === "42P01"
        || /whitelabel_(verification|handoff)/i.test(error.message ?? "")),
  );
}

export async function loadVerificationForAdmin(buildId: string): Promise<VerificationAdminView> {
  await requireAdmin(`/admin/os-builds/${buildId}`);
  const admin = createServiceRoleClient();
  const { data: run, error } = await admin
    .from("whitelabel_verification_run")
    .select("*")
    .eq("build_id", buildId)
    .eq("kind", "handoff")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (missingTicketFive(error)) {
      return { available: false, run: null, items: [], handoff: null, artifacts: [] };
    }
    throw new Error("Could not load handoff verification state.");
  }

  const [itemsResult, handoffResult] = await Promise.all([
    run
      ? admin
          .from("whitelabel_verification_item")
          .select("*")
          .eq("build_id", buildId)
          .eq("run_id", run.id)
          .order("required_for_handoff", { ascending: false })
          .order("category", { ascending: true })
          .order("check_key", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("whitelabel_handoff")
      .select("*")
      .eq("build_id", buildId)
      .maybeSingle(),
  ]);
  if (itemsResult.error || handoffResult.error) {
    throw new Error("Could not load handoff verification details.");
  }

  const handoff = handoffResult.data as WhitelabelHandoff | null;
  let artifacts: WhitelabelHandoffArtifact[] = [];
  if (handoff) {
    const { data, error: artifactError } = await admin
      .from("whitelabel_handoff_artifact")
      .select("*")
      .eq("build_id", buildId)
      .eq("handoff_id", handoff.id)
      .order("kind", { ascending: true })
      .order("revision", { ascending: false });
    if (artifactError) throw new Error("Could not load handoff artifacts.");
    artifacts = (data ?? []) as WhitelabelHandoffArtifact[];
    await Promise.all(artifacts.map(async (artifact) => {
      const signed = await admin.storage
        .from("whitelabel-handoff-artifacts")
        .createSignedUrl(artifact.storage_path, 60 * 15);
      artifact.signedUrl = signed.data?.signedUrl ?? null;
    }));
  }

  return {
    available: true,
    run: run as WhitelabelVerificationRun | null,
    items: (itemsResult.data ?? []) as WhitelabelVerificationItem[],
    handoff,
    artifacts,
  };
}
