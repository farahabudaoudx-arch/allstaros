"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { writeAudit } from "@/lib/admin/audit";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  assertNoSecretLikeValue,
  isUuid,
} from "@/lib/whitelabel/validation";
import {
  buildHandoffVerificationItems,
  CURRENT_CUSTOMER_SCHEMA_RELEASE,
  VERIFICATION_STATUSES,
  verifyLiveInstallationVersion,
  type VerificationStatus,
} from "@/lib/whitelabel/verification";
import { renderWhitelabelHandoffPdf } from "@/lib/whitelabel/handoff-pdf";
import type {
  MaintenanceStatus,
  WhitelabelBuildAddition,
  WhitelabelServiceConnection,
} from "@/lib/whitelabel/types";

const BUCKET = "whitelabel-handoff-artifacts";
const MAX_ARTIFACT_BYTES = 100 * 1024 * 1024;
const ARTIFACT_TYPES = {
  handoff_pdf: new Set(["application/pdf"]),
  source_package: new Set(["application/zip", "application/x-zip-compressed"]),
  manifest: new Set(["application/json", "text/json", "text/plain"]),
} as const;

function verificationPath(buildId: string): string {
  return `/admin/os-builds/${buildId}/verification`;
}

function handoffPath(buildId: string): string {
  return `/admin/os-builds/${buildId}/handoff`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The verification operation could not be completed.";
}

function fail(path: string, error: unknown): never {
  unstable_rethrow(error);
  redirect(`${path}?error=${encodeURIComponent(errorMessage(error))}`);
}

function done(path: string, code: string): never {
  redirect(`${path}?ok=${encodeURIComponent(code)}`);
}

function buildIdFrom(formData: FormData, fallback = "/admin/os-builds"): string {
  const buildId = String(formData.get("build_id") ?? "").trim();
  if (!isUuid(buildId)) redirect(`${fallback}?error=Invalid%20OS%20build.`);
  return buildId;
}

function itemStatus(value: FormDataEntryValue | null): VerificationStatus {
  const status = String(value ?? "").trim() as VerificationStatus;
  if (!VERIFICATION_STATUSES.includes(status)) throw new Error("Verification result is invalid.");
  return status;
}

function customerOsUrl(domain: string): string {
  const clean = domain.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!clean) throw new Error("Customer domain is required before verification.");
  return `https://${clean}`;
}

async function latestSucceededProvisioning(buildId: string) {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("whitelabel_provisioning_run")
    .select("id, build_id, source_sha, status, deployment_url, completed_at")
    .eq("build_id", buildId)
    .eq("status", "succeeded")
    .order("completed_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Could not load the completed customer deployment.");
  if (!data?.deployment_url) throw new Error("A succeeded provisioning run with a deployment URL is required before handoff verification.");
  return data;
}

export async function adminStartOsBuildVerification(formData: FormData) {
  const person = await requireAdmin("/admin/os-builds");
  const buildId = buildIdFrom(formData);
  const path = verificationPath(buildId);
  const admin = createServiceRoleClient();
  try {
    const provisioning = await latestSucceededProvisioning(buildId);
    const [buildResult, serviceResult, additionResult, handoffResult] = await Promise.all([
      admin
        .from("whitelabel_build")
        .select("id, domain, maintenance_status")
        .eq("id", buildId)
        .maybeSingle(),
      admin
        .from("whitelabel_service_connection")
        .select("*")
        .eq("build_id", buildId),
      admin
        .from("whitelabel_build_addition")
        .select("id, build_id, addition_type, name, delivery_requirements, timeline_notes, status, delivery_phase, created_at, updated_at")
        .eq("build_id", buildId),
      admin
        .from("whitelabel_handoff")
        .select("id")
        .eq("build_id", buildId)
        .maybeSingle(),
    ]);
    if (handoffResult.error) throw new Error("Could not check existing handoff state.");
    if (handoffResult.data) throw new Error("This build already has a canonical handoff; its handoff verification is immutable.");
    if (buildResult.error || serviceResult.error || additionResult.error || !buildResult.data) {
      throw new Error("Could not load the handoff verification inputs.");
    }

    const osUrl = customerOsUrl(buildResult.data.domain);
    const liveVersion = await verifyLiveInstallationVersion({
      osUrl,
      expectedSha: provisioning.source_sha,
      expectedSchema: CURRENT_CUSTOMER_SCHEMA_RELEASE,
    });

    const items = buildHandoffVerificationItems({
      additions: (additionResult.data ?? []) as WhitelabelBuildAddition[],
      services: (serviceResult.data ?? []) as WhitelabelServiceConnection[],
      maintenanceStatus: buildResult.data.maintenance_status as MaintenanceStatus,
      sourceSha: provisioning.source_sha,
      deploymentUrl: provisioning.deployment_url,
      liveVersion,
    });

    const { data: runId, error } = await admin.rpc("start_whitelabel_handoff_verification", {
      p_build_id: buildId,
      p_provisioning_run_id: provisioning.id,
      p_source_sha: provisioning.source_sha,
      p_schema_release: CURRENT_CUSTOMER_SCHEMA_RELEASE,
      p_deployment_url: provisioning.deployment_url,
      p_started_by: person.id,
      p_items: items,
    });
    if (error || !runId) {
      if (/whitelabel_verification_one_active_build/i.test(error?.message ?? "")) {
        throw new Error("This build already has an active handoff verification. Complete it instead of creating a duplicate run.");
      }
      throw new Error("Could not start the handoff verification run.");
    }

    await writeAudit({
      actorId: person.id,
      action: "whitelabel.verification.start",
      detail: { buildId, runId, sourceSha: provisioning.source_sha, schemaRelease: CURRENT_CUSTOMER_SCHEMA_RELEASE },
    });
    revalidatePath(path);
    revalidatePath(`/admin/os-builds/${buildId}`);
    done(path, "started");
  } catch (error) {
    fail(path, error);
  }
}

export async function adminRefreshOsBuildAutomatedVerification(formData: FormData) {
  const person = await requireAdmin("/admin/os-builds");
  const buildId = buildIdFrom(formData);
  const path = verificationPath(buildId);
  const runId = String(formData.get("run_id") ?? "").trim();
  if (!isUuid(runId)) fail(path, new Error("Invalid verification run."));

  try {
    const admin = createServiceRoleClient();
    const [runResult, buildResult, serviceResult, additionResult, handoffResult] = await Promise.all([
      admin
        .from("whitelabel_verification_run")
        .select("id, build_id, provisioning_run_id, source_sha, schema_release, deployment_url, status")
        .eq("id", runId)
        .eq("build_id", buildId)
        .eq("kind", "handoff")
        .maybeSingle(),
      admin
        .from("whitelabel_build")
        .select("id, domain, maintenance_status")
        .eq("id", buildId)
        .maybeSingle(),
      admin
        .from("whitelabel_service_connection")
        .select("*")
        .eq("build_id", buildId),
      admin
        .from("whitelabel_build_addition")
        .select("id, build_id, addition_type, name, delivery_requirements, timeline_notes, status, delivery_phase, created_at, updated_at")
        .eq("build_id", buildId),
      admin
        .from("whitelabel_handoff")
        .select("id")
        .eq("build_id", buildId)
        .maybeSingle(),
    ]);
    if (handoffResult.error) throw new Error("Could not check handoff state.");
    if (handoffResult.data) throw new Error("Automated verification cannot be changed after the canonical handoff is recorded.");
    if (runResult.error || buildResult.error || serviceResult.error || additionResult.error || !runResult.data || !buildResult.data) {
      throw new Error("Could not reload automated verification inputs.");
    }

    const provisioning = await admin
      .from("whitelabel_provisioning_run")
      .select("id, build_id, source_sha, status, deployment_url")
      .eq("id", runResult.data.provisioning_run_id)
      .eq("build_id", buildId)
      .maybeSingle();
    if (provisioning.error || !provisioning.data) throw new Error("Pinned provisioning run could not be reloaded.");
    if (
      provisioning.data.status !== "succeeded"
      || provisioning.data.source_sha !== runResult.data.source_sha
      || provisioning.data.deployment_url !== runResult.data.deployment_url
    ) {
      throw new Error("The pinned provisioning run no longer matches this verification run.");
    }

    const liveVersion = await verifyLiveInstallationVersion({
      osUrl: customerOsUrl(buildResult.data.domain),
      expectedSha: runResult.data.source_sha,
      expectedSchema: runResult.data.schema_release,
    });
    const automated = buildHandoffVerificationItems({
      additions: (additionResult.data ?? []) as WhitelabelBuildAddition[],
      services: (serviceResult.data ?? []) as WhitelabelServiceConnection[],
      maintenanceStatus: buildResult.data.maintenance_status as MaintenanceStatus,
      sourceSha: runResult.data.source_sha,
      deploymentUrl: runResult.data.deployment_url,
      liveVersion,
    }).filter((item) => item.mode === "automated");

    for (const item of automated) {
      const { data, error } = await admin
        .from("whitelabel_verification_item")
        .update({
          status: item.status,
          actual_summary: item.actualSummary ?? null,
          evidence: item.evidence ?? {},
          checked_by: person.id,
          checked_at: new Date().toISOString(),
        })
        .eq("build_id", buildId)
        .eq("run_id", runId)
        .eq("check_key", item.checkKey)
        .eq("mode", "automated")
        .select("id")
        .maybeSingle();
      if (error || !data) throw new Error(`Could not refresh automated check ${item.checkKey}.`);
    }

    const reopened = await admin
      .from("whitelabel_verification_run")
      .update({ status: "running", completed_by: null, completed_at: null })
      .eq("id", runId)
      .eq("build_id", buildId)
      .in("status", ["running", "blocked", "passed"])
      .select("id")
      .maybeSingle();
    if (reopened.error || !reopened.data) throw new Error("Could not reopen the verification gate after refreshing automated checks.");

    await writeAudit({
      actorId: person.id,
      action: "whitelabel.verification.refresh",
      detail: { buildId, runId, automatedChecks: automated.map((item) => item.checkKey) },
    });
    revalidatePath(path);
    done(path, "automated-refreshed");
  } catch (error) {
    fail(path, error);
  }
}

export async function adminSaveOsVerificationItem(formData: FormData) {
  const person = await requireAdmin("/admin/os-builds");
  const buildId = buildIdFrom(formData);
  const path = verificationPath(buildId);
  const runId = String(formData.get("run_id") ?? "").trim();
  const itemId = String(formData.get("item_id") ?? "").trim();
  if (!isUuid(runId) || !isUuid(itemId)) fail(path, new Error("Invalid verification item."));

  try {
    const status = itemStatus(formData.get("status"));
    if (!(["pending", "passed", "failed"] as VerificationStatus[]).includes(status)) {
      throw new Error("Manual launch checks can only be pending, passed, or failed.");
    }
    const actualSummary = String(formData.get("actual_summary") ?? "").trim();
    if (actualSummary.length > 4000) throw new Error("Verification evidence is too long.");
    if ((status === "passed" || status === "failed") && !actualSummary) {
      throw new Error("Record the observed result before marking a check passed or failed.");
    }
    assertNoSecretLikeValue(actualSummary || null, "Verification evidence");

    const admin = createServiceRoleClient();
    const checked = status === "pending" ? null : new Date().toISOString();
    const { data, error } = await admin
      .from("whitelabel_verification_item")
      .update({
        status,
        actual_summary: actualSummary || null,
        evidence: actualSummary ? { note: actualSummary } : {},
        checked_by: status === "pending" ? null : person.id,
        checked_at: checked,
      })
      .eq("build_id", buildId)
      .eq("run_id", runId)
      .eq("id", itemId)
      .eq("mode", "manual")
      .eq("required_for_handoff", true)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Could not save the verification result.");
    if (!data) throw new Error("The verification item was not found for this build/run, or it is not a manual handoff check.");

    await admin
      .from("whitelabel_verification_run")
      .update({ status: "running", completed_by: null, completed_at: null })
      .eq("id", runId)
      .eq("build_id", buildId)
      .in("status", ["running", "blocked"]);

    await writeAudit({
      actorId: person.id,
      action: "whitelabel.verification.item",
      detail: { buildId, runId, itemId, status },
    });
    revalidatePath(path);
    done(path, "item-saved");
  } catch (error) {
    fail(path, error);
  }
}

export async function adminFinalizeOsBuildVerification(formData: FormData) {
  const person = await requireAdmin("/admin/os-builds");
  const buildId = buildIdFrom(formData);
  const path = verificationPath(buildId);
  const runId = String(formData.get("run_id") ?? "").trim();
  if (!isUuid(runId)) fail(path, new Error("Invalid verification run."));
  try {
    const admin = createServiceRoleClient();
    const { data: status, error } = await admin.rpc("finalize_whitelabel_verification", {
      p_build_id: buildId,
      p_run_id: runId,
      p_actor_id: person.id,
    });
    if (error) throw new Error("Could not finalize handoff verification.");
    await writeAudit({
      actorId: person.id,
      action: "whitelabel.verification.finalize",
      detail: { buildId, runId, status },
    });
    revalidatePath(path);
    revalidatePath(handoffPath(buildId));
    done(path, status === "passed" ? "passed" : "blocked");
  } catch (error) {
    fail(path, error);
  }
}

export async function adminRecordOsBuildHandoff(formData: FormData) {
  const person = await requireAdmin("/admin/os-builds");
  const buildId = buildIdFrom(formData);
  const path = handoffPath(buildId);
  const runId = String(formData.get("run_id") ?? "").trim();
  if (!isUuid(runId)) fail(path, new Error("Invalid verification run."));
  try {
    const admin = createServiceRoleClient();
    const existing = await admin
      .from("whitelabel_handoff")
      .select("id, verification_run_id")
      .eq("build_id", buildId)
      .maybeSingle();
    if (existing.error) throw new Error("Could not check existing handoff history.");
    if (existing.data) {
      if (existing.data.verification_run_id !== runId) {
        throw new Error("This build already has a canonical handoff. Regenerating artifacts cannot create a second handoff or reset its support windows.");
      }
      done(path, "already-prepared");
    }

    const [buildResult, serviceResult, carrierResult] = await Promise.all([
      admin
        .from("whitelabel_build")
        .select("agency_name, product_name, short_name, domain, timezone, initial_admin_email, maintenance_status, support_email, reply_to_email, email_from, brand_primary_color, brand_accent_color, licensing_provider_name")
        .eq("id", buildId)
        .maybeSingle(),
      admin
        .from("whitelabel_service_connection")
        .select("service_kind, project_ref")
        .eq("build_id", buildId)
        .in("service_kind", ["vercel", "supabase"]),
      admin
        .from("whitelabel_build_carrier_link")
        .select("company_key, display_name, portal_url, sort_order, show_in_resources")
        .eq("build_id", buildId)
        .order("sort_order", { ascending: true }),
    ]);
    if (buildResult.error || serviceResult.error || carrierResult.error || !buildResult.data) {
      throw new Error("Could not load safe handoff configuration.");
    }
    const maintenanceStatus = buildResult.data.maintenance_status as MaintenanceStatus;
    if (maintenanceStatus === "undecided") throw new Error("Choose selected or declined maintenance before handoff.");
    const vercel = (serviceResult.data ?? []).find((row) => row.service_kind === "vercel");
    const supabase = (serviceResult.data ?? []).find((row) => row.service_kind === "supabase");
    if (!vercel?.project_ref || !supabase?.project_ref) throw new Error("Verified Vercel and Supabase project references are required for handoff.");

    const safeConfig = {
      agencyName: buildResult.data.agency_name,
      productName: buildResult.data.product_name,
      shortName: buildResult.data.short_name,
      domain: buildResult.data.domain,
      timezone: buildResult.data.timezone,
      supportEmail: buildResult.data.support_email,
      replyToEmail: buildResult.data.reply_to_email,
      emailFrom: buildResult.data.email_from,
      primaryColor: buildResult.data.brand_primary_color,
      accentColor: buildResult.data.brand_accent_color,
      licensingProvider: buildResult.data.licensing_provider_name,
      carrierLinks: carrierResult.data ?? [],
    };
    assertNoSecretLikeValue(JSON.stringify(safeConfig), "Handoff configuration");

    const { data: handoffId, error } = await admin.rpc("record_whitelabel_handoff", {
      p_build_id: buildId,
      p_verification_run_id: runId,
      p_recorded_by: person.id,
      p_vercel_project_ref: vercel.project_ref,
      p_supabase_project_ref: supabase.project_ref,
      p_initial_admin_email: buildResult.data.initial_admin_email,
      p_maintenance_status: maintenanceStatus,
      p_safe_config_snapshot: safeConfig,
    });
    if (error || !handoffId) throw new Error(error?.message || "Could not record the canonical handoff.");
    await writeAudit({
      actorId: person.id,
      action: "whitelabel.handoff.record",
      detail: { buildId, runId, handoffId, maintenanceStatus },
    });
    revalidatePath(path);
    revalidatePath(verificationPath(buildId));
    done(path, "recorded");
  } catch (error) {
    fail(path, error);
  }
}

export async function adminFinalizeOsBuildHandoff(formData: FormData) {
  const person = await requireAdmin("/admin/os-builds");
  const buildId = buildIdFrom(formData);
  const path = handoffPath(buildId);
  const handoffId = String(formData.get("handoff_id") ?? "").trim();
  if (!isUuid(handoffId)) fail(path, new Error("Invalid handoff."));
  try {
    const admin = createServiceRoleClient();
    const { data: deliveredAt, error } = await admin.rpc("finalize_whitelabel_handoff", {
      p_build_id: buildId,
      p_handoff_id: handoffId,
      p_actor_id: person.id,
    });
    if (error || !deliveredAt) throw new Error(error?.message || "Handoff cannot be delivered until the PDF, manifest, and matching safe source package are registered.");
    await writeAudit({
      actorId: person.id,
      action: "whitelabel.handoff.deliver",
      detail: { buildId, handoffId, deliveredAt },
    });
    revalidatePath(path);
    done(path, "delivered");
  } catch (error) {
    fail(path, error);
  }
}

function artifactKind(value: FormDataEntryValue | null): keyof typeof ARTIFACT_TYPES {
  const kind = String(value ?? "").trim() as keyof typeof ARTIFACT_TYPES;
  if (!(kind in ARTIFACT_TYPES)) throw new Error("Artifact type is invalid.");
  return kind;
}

export async function adminUploadOsHandoffArtifact(formData: FormData) {
  const person = await requireAdmin("/admin/os-builds");
  const buildId = buildIdFrom(formData);
  const path = handoffPath(buildId);
  const handoffId = String(formData.get("handoff_id") ?? "").trim();
  if (!isUuid(handoffId)) fail(path, new Error("Invalid handoff."));
  try {
    const kind = artifactKind(formData.get("kind"));
    if (kind === "source_package") {
      throw new Error("Source packages are built, secret-scanned, and uploaded with the offline handoff packaging script, not through Vercel.");
    }
    const file = formData.get("artifact");
    if (!(file instanceof File) || file.size <= 0) throw new Error("Choose an artifact file.");
    if (file.size > MAX_ARTIFACT_BYTES) throw new Error("Handoff artifacts must be 100 MB or smaller.");
    if (!ARTIFACT_TYPES[kind].has(file.type as never)) throw new Error(`Unexpected content type for ${kind}.`);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (kind === "manifest") {
      const text = bytes.toString("utf8");
      JSON.parse(text);
      assertNoSecretLikeValue(text, "Handoff manifest");
    }

    const admin = createServiceRoleClient();
    const { data: handoff, error: handoffError } = await admin
      .from("whitelabel_handoff")
      .select("id, installed_source_sha, schema_release")
      .eq("id", handoffId)
      .eq("build_id", buildId)
      .maybeSingle();
    if (handoffError || !handoff) throw new Error("Handoff not found for this build.");
    const { data: latest, error: latestError } = await admin
      .from("whitelabel_handoff_artifact")
      .select("revision")
      .eq("handoff_id", handoffId)
      .eq("build_id", buildId)
      .eq("kind", kind)
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw new Error("Could not determine artifact revision.");
    const revision = (latest?.revision ?? 0) + 1;
    const extension = kind === "handoff_pdf" ? "pdf" : "json";
    const storagePath = `${buildId}/${handoffId}/${kind}/r${revision}.${extension}`;
    const digest = createHash("sha256").update(bytes).digest("hex");
    const upload = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (upload.error) throw new Error("Could not store the private handoff artifact.");
    const inserted = await admin.from("whitelabel_handoff_artifact").insert({
      handoff_id: handoffId,
      build_id: buildId,
      kind,
      revision,
      storage_path: storagePath,
      sha256: digest,
      byte_size: bytes.length,
      content_type: file.type,
      safe_metadata: {},
      created_by: person.id,
    });
    if (inserted.error) {
      await admin.storage.from(BUCKET).remove([storagePath]);
      throw new Error("Artifact was uploaded but could not be registered; the upload was rolled back.");
    }
    await writeAudit({
      actorId: person.id,
      action: "whitelabel.handoff.artifact",
      detail: { buildId, handoffId, kind, revision, sha256: digest },
    });
    revalidatePath(path);
    done(path, "artifact-saved");
  } catch (error) {
    fail(path, error);
  }
}

async function storeGeneratedArtifact(args: {
  buildId: string;
  handoffId: string;
  kind: "handoff_pdf" | "manifest";
  bytes: Buffer;
  contentType: string;
  actorId: string;
  sourceSha: string;
  schemaRelease: string;
}): Promise<{ revision: number; sha256: string }> {
  const admin = createServiceRoleClient();
  const { data: latest, error: latestError } = await admin
    .from("whitelabel_handoff_artifact")
    .select("revision")
    .eq("handoff_id", args.handoffId)
    .eq("build_id", args.buildId)
    .eq("kind", args.kind)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw new Error("Could not determine generated artifact revision.");
  const revision = (latest?.revision ?? 0) + 1;
  const extension = args.kind === "handoff_pdf" ? "pdf" : "json";
  const storagePath = `${args.buildId}/${args.handoffId}/${args.kind}/r${revision}.${extension}`;
  const sha256 = createHash("sha256").update(args.bytes).digest("hex");
  const upload = await admin.storage.from(BUCKET).upload(storagePath, args.bytes, {
    contentType: args.contentType,
    upsert: false,
  });
  if (upload.error) throw new Error(`Could not store generated ${args.kind}.`);
  const inserted = await admin.from("whitelabel_handoff_artifact").insert({
    handoff_id: args.handoffId,
    build_id: args.buildId,
    kind: args.kind,
    revision,
    storage_path: storagePath,
    sha256,
    byte_size: args.bytes.length,
    content_type: args.contentType,
    safe_metadata: {
      generated: true,
      sourceSha: args.sourceSha,
      schemaRelease: args.schemaRelease,
    },
    created_by: args.actorId,
  });
  if (inserted.error) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    throw new Error(`Generated ${args.kind} could not be registered; its upload was rolled back.`);
  }
  return { revision, sha256 };
}

export async function adminGenerateOsHandoffDocuments(formData: FormData) {
  const person = await requireAdmin("/admin/os-builds");
  const buildId = buildIdFrom(formData);
  const path = handoffPath(buildId);
  const handoffId = String(formData.get("handoff_id") ?? "").trim();
  if (!isUuid(handoffId)) fail(path, new Error("Invalid handoff."));
  try {
    const admin = createServiceRoleClient();
    const { data: handoff, error } = await admin
      .from("whitelabel_handoff")
      .select("*")
      .eq("id", handoffId)
      .eq("build_id", buildId)
      .maybeSingle();
    if (error || !handoff) throw new Error("Canonical handoff not found for this build.");
    const { data: build, error: buildError } = await admin
      .from("whitelabel_build")
      .select("agency_name, product_name, primary_contact_name, primary_contact_email")
      .eq("id", buildId)
      .maybeSingle();
    if (buildError || !build) throw new Error("Could not load handoff customer identity.");

    const safeDocument = {
      formatVersion: 1,
      buildId,
      handoffId,
      agencyName: build.agency_name,
      productName: build.product_name,
      primaryContact: { name: build.primary_contact_name, email: build.primary_contact_email },
      osUrl: handoff.os_url,
      vercelProjectRef: handoff.vercel_project_ref,
      supabaseProjectRef: handoff.supabase_project_ref,
      initialAdminEmail: handoff.initial_admin_email,
      installedSourceSha: handoff.installed_source_sha,
      schemaRelease: handoff.schema_release,
      handoffAt: handoff.handoff_at,
      reviewDeadline: handoff.review_deadline,
      defectDeadline: handoff.defect_deadline,
      maintenance: handoff.maintenance_status === "selected"
        ? { status: "selected", monthlyPriceUsd: 197 }
        : { status: "declined", monthlyPriceUsd: null },
      configuration: handoff.safe_config_snapshot,
      operatingNotes: [
        "The customer installation has its own Vercel and Supabase projects and continues operating independently of the Assembly Line console.",
        "Credentials are not included in this handoff artifact. Provider credentials remain in the customer installation environment or secure Vault-backed setup.",
        "Maintenance affects managed support and future updates, not the customer's ability to operate the handed-off OS.",
      ],
    };
    const json = JSON.stringify(safeDocument, null, 2) + "\n";
    assertNoSecretLikeValue(json, "Generated handoff manifest");
    const pdf = await renderWhitelabelHandoffPdf(safeDocument);
    const manifestArtifact = await storeGeneratedArtifact({
      buildId,
      handoffId,
      kind: "manifest",
      bytes: Buffer.from(json, "utf8"),
      contentType: "application/json",
      actorId: person.id,
      sourceSha: handoff.installed_source_sha,
      schemaRelease: handoff.schema_release,
    });
    const pdfArtifact = await storeGeneratedArtifact({
      buildId,
      handoffId,
      kind: "handoff_pdf",
      bytes: Buffer.from(pdf),
      contentType: "application/pdf",
      actorId: person.id,
      sourceSha: handoff.installed_source_sha,
      schemaRelease: handoff.schema_release,
    });
    await writeAudit({
      actorId: person.id,
      action: "whitelabel.handoff.documents",
      detail: { buildId, handoffId, manifestRevision: manifestArtifact.revision, pdfRevision: pdfArtifact.revision },
    });
    revalidatePath(path);
    done(path, "documents-generated");
  } catch (error) {
    fail(path, error);
  }
}
