import { createClient } from "@supabase/supabase-js";
import type {
  MaintenanceStatus,
  WhitelabelBuildAddition,
  WhitelabelServiceConnection,
} from "@/lib/whitelabel/types";

async function main() {
  const target = (process.argv[2] ?? "a").toLowerCase();
  if (target !== "a" && target !== "b") {
    throw new Error("Usage: tsx scripts/whitelabel-local-pilot-verify.ts <a|b>");
  }
  if (process.env.WHITELABEL_LOCAL_PILOT !== "1" || process.env.NODE_ENV === "production") {
    throw new Error("This runner is local-pilot only.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Local control-plane env is incomplete.");

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const domain = `customer-${target}.local`;

  const [{ data: build, error: buildError }, { data: actor, error: actorError }] = await Promise.all([
    admin
      .from("whitelabel_build")
      .select("id, domain, product_name, maintenance_status")
      .eq("domain", domain)
      .single(),
    admin.from("person").select("id").eq("email", "admin@allstar.test").single(),
  ]);
  if (buildError || !build) throw buildError ?? new Error(`Pilot build ${domain} is missing.`);
  if (actorError || !actor) throw actorError ?? new Error("Pilot admin actor is missing.");

  const existing = await admin
    .from("whitelabel_verification_run")
    .select("id, status, source_sha, schema_release, deployment_url")
    .eq("build_id", build.id)
    .eq("kind", "handoff")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;

  let runId: string;
  if (existing.data) {
    runId = String(existing.data.id);
  } else {
    const {
      buildHandoffVerificationItems,
      CURRENT_CUSTOMER_SCHEMA_RELEASE,
      verifyLiveInstallationVersion,
    } = await import("@/lib/whitelabel/verification");
    const [provisioningResult, serviceResult, additionResult] = await Promise.all([
      admin
        .from("whitelabel_provisioning_run")
        .select("id, source_sha, status, deployment_url, completed_at")
        .eq("build_id", build.id)
        .eq("status", "succeeded")
        .order("completed_at", { ascending: false })
        .limit(1)
        .single(),
      admin.from("whitelabel_service_connection").select("*").eq("build_id", build.id),
      admin.from("whitelabel_build_addition").select("*").eq("build_id", build.id),
    ]);
    if (provisioningResult.error || !provisioningResult.data?.deployment_url) {
      throw new Error("A succeeded local provisioning run is required before verification.");
    }
    if (serviceResult.error || additionResult.error) throw new Error("Could not load verification inputs.");

    const canonicalOsUrl = `https://${domain}`;
    const liveVersion = await verifyLiveInstallationVersion({
      osUrl: canonicalOsUrl,
      expectedSha: provisioningResult.data.source_sha,
      expectedSchema: CURRENT_CUSTOMER_SCHEMA_RELEASE,
    });
    const items = buildHandoffVerificationItems({
      additions: (additionResult.data ?? []) as WhitelabelBuildAddition[],
      services: (serviceResult.data ?? []) as WhitelabelServiceConnection[],
      maintenanceStatus: build.maintenance_status as MaintenanceStatus,
      sourceSha: provisioningResult.data.source_sha,
      deploymentUrl: provisioningResult.data.deployment_url,
      liveVersion,
    });

    const started = await admin.rpc("start_whitelabel_handoff_verification", {
      p_build_id: build.id,
      p_provisioning_run_id: provisioningResult.data.id,
      p_source_sha: provisioningResult.data.source_sha,
      p_schema_release: CURRENT_CUSTOMER_SCHEMA_RELEASE,
      p_deployment_url: provisioningResult.data.deployment_url,
      p_started_by: actor.id,
      p_items: items,
    });
    if (started.error || !started.data) throw started.error ?? new Error("Could not start local handoff verification.");
    runId = String(started.data);
  }

  const [runResult, itemsResult] = await Promise.all([
    admin.from("whitelabel_verification_run").select("id, status, source_sha, schema_release, deployment_url").eq("id", runId).single(),
    admin
      .from("whitelabel_verification_item")
      .select("check_key, mode, required_for_handoff, status, actual_summary")
      .eq("run_id", runId)
      .order("mode", { ascending: true })
      .order("check_key", { ascending: true }),
  ]);
  if (runResult.error || itemsResult.error || !runResult.data) throw new Error("Could not reload local verification state.");

  const items = itemsResult.data ?? [];
  process.stdout.write(JSON.stringify({
    buildId: build.id,
    productName: build.product_name,
    runId,
    status: runResult.data.status,
    sourceSha: runResult.data.source_sha,
    schemaRelease: runResult.data.schema_release,
    automated: items.filter((item) => item.mode === "automated").map((item) => ({ key: item.check_key, status: item.status })),
    manual: items.filter((item) => item.mode === "manual").map((item) => ({ key: item.check_key, required: item.required_for_handoff, status: item.status })),
  }) + "\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
