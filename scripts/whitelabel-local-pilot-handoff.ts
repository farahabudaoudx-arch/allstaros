/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assertNoSecretLikeValue } from "@/lib/whitelabel/validation";
import { renderWhitelabelHandoffPdf } from "@/lib/whitelabel/handoff-pdf";

const BUCKET = "whitelabel-handoff-artifacts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function localPilotContext() {
  if (process.env.WHITELABEL_LOCAL_PILOT !== "1" || process.env.NODE_ENV === "production") {
    throw new Error("This runner is local-pilot only.");
  }
  const root = process.env.WHITELABEL_LOCAL_PILOT_ROOT || "E:\\LocalPilot\\whitelabel-pilot";
  const registryPath = process.env.WHITELABEL_LOCAL_PILOT_REGISTRY || path.join(root, "registry.json");
  const registry = JSON.parse(readFileSync(registryPath, "utf8")) as {
    projects: Array<{ projectRef: string; role?: string; apiUrl: string; secretKey?: string }>;
  };
  const controlProjectRef = process.env.WHITELABEL_LOCAL_CONTROL_PROJECT_REF || "local-control";
  const localControl = registry.projects.find((row) => row.projectRef === controlProjectRef);
  assert(localControl, "Local control-plane registry entry is missing.");
  assert(localControl.role === "control-plane-local", "Local control-plane registry entry has the wrong role.");
  const envUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || localControl.apiUrl).replace(/\/+$/, "");
  const localUrl = localControl.apiUrl.replace(/\/+$/, "");
  assert(envUrl === localUrl, "Refusing handoff write: current Supabase URL is not the registered local-control project.");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || localControl.secretKey;
  assert(key, "Local control-plane service role is missing.");
  return {
    root,
    admin: createClient(localUrl, key, { auth: { persistSession: false, autoRefreshToken: false } }) as any,
  };
}

async function storeGeneratedArtifact(args: {
  admin: any;
  buildId: string;
  handoffId: string;
  kind: "handoff_pdf" | "manifest";
  bytes: Buffer;
  contentType: string;
  actorId: string;
  sourceSha: string;
  schemaRelease: string;
}) {
  const existing = await args.admin
    .from("whitelabel_handoff_artifact")
    .select("id, revision, sha256, safe_metadata")
    .eq("handoff_id", args.handoffId)
    .eq("build_id", args.buildId)
    .eq("kind", args.kind)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  const metadata = existing.data?.safe_metadata as Record<string, unknown> | undefined;
  if (
    existing.data
    && metadata?.generated === true
    && metadata?.sourceSha === args.sourceSha
    && metadata?.schemaRelease === args.schemaRelease
  ) {
    return { revision: existing.data.revision, sha256: existing.data.sha256, reused: true };
  }

  const revision = Number(existing.data?.revision ?? 0) + 1;
  const extension = args.kind === "handoff_pdf" ? "pdf" : "json";
  const storagePath = `${args.buildId}/${args.handoffId}/${args.kind}/r${revision}.${extension}`;
  const sha256 = createHash("sha256").update(args.bytes).digest("hex");
  const upload = await args.admin.storage.from(BUCKET).upload(storagePath, args.bytes, {
    contentType: args.contentType,
    upsert: false,
  });
  if (upload.error) throw new Error(`Could not store generated ${args.kind}: ${upload.error.message}`);
  const inserted = await args.admin.from("whitelabel_handoff_artifact").insert({
    handoff_id: args.handoffId,
    build_id: args.buildId,
    kind: args.kind,
    revision,
    storage_path: storagePath,
    sha256,
    byte_size: args.bytes.length,
    content_type: args.contentType,
    safe_metadata: { generated: true, sourceSha: args.sourceSha, schemaRelease: args.schemaRelease },
    created_by: args.actorId,
  });
  if (inserted.error) {
    await args.admin.storage.from(BUCKET).remove([storagePath]);
    throw inserted.error;
  }
  return { revision, sha256, reused: false };
}

async function loadCore(admin: any) {
  const [buildResult, actorResult] = await Promise.all([
    admin
      .from("whitelabel_build")
      .select("id, agency_name, product_name, short_name, domain, timezone, primary_contact_name, primary_contact_email, initial_admin_email, maintenance_status, support_email, reply_to_email, email_from, brand_primary_color, brand_accent_color, licensing_provider_name")
      .eq("domain", "customer-a.local")
      .single(),
    admin.from("person").select("id").eq("email", "admin@allstar.test").single(),
  ]);
  if (buildResult.error || !buildResult.data) throw buildResult.error ?? new Error("Customer A build is missing.");
  if (actorResult.error || !actorResult.data) throw actorResult.error ?? new Error("Local admin actor is missing.");
  return { build: buildResult.data, actor: actorResult.data };
}

async function prepare() {
  const { admin } = localPilotContext();
  const { build, actor } = await loadCore(admin);
  const verification = await admin
    .from("whitelabel_verification_run")
    .select("id, status")
    .eq("build_id", build.id)
    .eq("kind", "handoff")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (verification.error || !verification.data) throw verification.error ?? new Error("Handoff verification is missing.");
  assert(verification.data.status === "passed", "Handoff verification must be passed before recording handoff.");

  let handoff = await admin.from("whitelabel_handoff").select("*").eq("build_id", build.id).maybeSingle();
  if (handoff.error) throw handoff.error;
  if (!handoff.data) {
    const [servicesResult, carriersResult] = await Promise.all([
      admin.from("whitelabel_service_connection").select("service_kind, project_ref, status").eq("build_id", build.id).in("service_kind", ["vercel", "supabase"]),
      admin.from("whitelabel_build_carrier_link").select("company_key, display_name, portal_url, sort_order, show_in_resources").eq("build_id", build.id).order("sort_order", { ascending: true }),
    ]);
    if (servicesResult.error || carriersResult.error) throw new Error("Could not load safe handoff configuration.");
    const vercel = servicesResult.data?.find((row: any) => row.service_kind === "vercel");
    const supabase = servicesResult.data?.find((row: any) => row.service_kind === "supabase");
    assert(vercel?.status === "verified" && vercel.project_ref, "Verified local Vercel project ref is required.");
    assert(supabase?.status === "verified" && supabase.project_ref, "Verified local Supabase project ref is required.");
    assert(build.maintenance_status === "selected" || build.maintenance_status === "declined", "Maintenance decision is required.");
    const safeConfig = {
      agencyName: build.agency_name,
      productName: build.product_name,
      shortName: build.short_name,
      domain: build.domain,
      timezone: build.timezone,
      supportEmail: build.support_email,
      replyToEmail: build.reply_to_email,
      emailFrom: build.email_from,
      primaryColor: build.brand_primary_color,
      accentColor: build.brand_accent_color,
      licensingProvider: build.licensing_provider_name,
      carrierLinks: carriersResult.data ?? [],
    };
    assertNoSecretLikeValue(JSON.stringify(safeConfig), "Handoff configuration");
    const recorded = await admin.rpc("record_whitelabel_handoff", {
      p_build_id: build.id,
      p_verification_run_id: verification.data.id,
      p_recorded_by: actor.id,
      p_vercel_project_ref: vercel.project_ref,
      p_supabase_project_ref: supabase.project_ref,
      p_initial_admin_email: build.initial_admin_email,
      p_maintenance_status: build.maintenance_status,
      p_safe_config_snapshot: safeConfig,
    });
    if (recorded.error || typeof recorded.data !== "string") throw recorded.error ?? new Error("Could not record canonical handoff.");
    handoff = await admin.from("whitelabel_handoff").select("*").eq("id", recorded.data).single();
    if (handoff.error || !handoff.data) throw handoff.error ?? new Error("Recorded handoff could not be reloaded.");
  }
  assert(handoff.data.verification_run_id === verification.data.id, "Existing handoff belongs to a different verification run.");

  const safeDocument = {
    formatVersion: 1,
    buildId: build.id,
    handoffId: handoff.data.id,
    agencyName: build.agency_name,
    productName: build.product_name,
    primaryContact: { name: build.primary_contact_name, email: build.primary_contact_email },
    osUrl: handoff.data.os_url,
    vercelProjectRef: handoff.data.vercel_project_ref,
    supabaseProjectRef: handoff.data.supabase_project_ref,
    initialAdminEmail: handoff.data.initial_admin_email,
    installedSourceSha: handoff.data.installed_source_sha,
    schemaRelease: handoff.data.schema_release,
    handoffAt: handoff.data.handoff_at,
    reviewDeadline: handoff.data.review_deadline,
    defectDeadline: handoff.data.defect_deadline,
    maintenance: handoff.data.maintenance_status === "selected"
      ? { status: "selected", monthlyPriceUsd: 197 }
      : { status: "declined", monthlyPriceUsd: null },
    configuration: handoff.data.safe_config_snapshot,
    operatingNotes: [
      "The customer installation has its own Vercel and Supabase projects and continues operating independently of the Assembly Line console.",
      "Credentials are not included in this handoff artifact. Provider credentials remain in the customer installation environment or secure Vault-backed setup.",
      "Maintenance affects managed support and future updates, not the customer's ability to operate the handed-off OS.",
    ],
  };
  const manifestText = JSON.stringify(safeDocument, null, 2) + "\n";
  assertNoSecretLikeValue(manifestText, "Generated handoff manifest");
  const pdf = await renderWhitelabelHandoffPdf(safeDocument);
  const manifestArtifact = await storeGeneratedArtifact({
    admin,
    buildId: build.id,
    handoffId: handoff.data.id,
    kind: "manifest",
    bytes: Buffer.from(manifestText, "utf8"),
    contentType: "application/json",
    actorId: actor.id,
    sourceSha: handoff.data.installed_source_sha,
    schemaRelease: handoff.data.schema_release,
  });
  const pdfArtifact = await storeGeneratedArtifact({
    admin,
    buildId: build.id,
    handoffId: handoff.data.id,
    kind: "handoff_pdf",
    bytes: Buffer.from(pdf),
    contentType: "application/pdf",
    actorId: actor.id,
    sourceSha: handoff.data.installed_source_sha,
    schemaRelease: handoff.data.schema_release,
  });
  process.stdout.write(JSON.stringify({
    buildId: build.id,
    handoffId: handoff.data.id,
    status: handoff.data.status,
    sourceSha: handoff.data.installed_source_sha,
    schemaRelease: handoff.data.schema_release,
    maintenancePriceCents: handoff.data.maintenance_price_cents,
    manifestRevision: manifestArtifact.revision,
    pdfRevision: pdfArtifact.revision,
    cloudCalls: false,
  }) + "\n");
}

async function finalize() {
  const { admin } = localPilotContext();
  const { build, actor } = await loadCore(admin);
  const handoff = await admin.from("whitelabel_handoff").select("id, status").eq("build_id", build.id).single();
  if (handoff.error || !handoff.data) throw handoff.error ?? new Error("Canonical handoff is missing.");
  const finalized = await admin.rpc("finalize_whitelabel_handoff", {
    p_build_id: build.id,
    p_handoff_id: handoff.data.id,
    p_actor_id: actor.id,
  });
  if (finalized.error || !finalized.data) throw finalized.error ?? new Error("Handoff could not be finalized.");
  const reloaded = await admin
    .from("whitelabel_handoff")
    .select("id, status, handoff_at, review_deadline, defect_deadline, installed_source_sha, schema_release")
    .eq("id", handoff.data.id)
    .single();
  if (reloaded.error || !reloaded.data) throw reloaded.error ?? new Error("Delivered handoff could not be reloaded.");
  const artifacts = await admin.from("whitelabel_handoff_artifact").select("kind, revision, safe_metadata").eq("handoff_id", handoff.data.id);
  if (artifacts.error) throw artifacts.error;
  process.stdout.write(JSON.stringify({ ...reloaded.data, artifactKinds: [...new Set((artifacts.data ?? []).map((row: any) => row.kind))].sort(), cloudCalls: false }) + "\n");
}

async function main() {
  const command = (process.argv[2] ?? "prepare").toLowerCase();
  if (command === "prepare") await prepare();
  else if (command === "finalize") await finalize();
  else throw new Error("Usage: whitelabel-local-pilot-handoff.ts <prepare|finalize>");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : JSON.stringify(error));
  process.exitCode = 1;
});
