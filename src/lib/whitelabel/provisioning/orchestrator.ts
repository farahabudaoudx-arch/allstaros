import "server-only";

import { randomBytes } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { getBuildReadiness } from "@/lib/whitelabel/readiness";
import type {
  WhitelabelBuild,
  WhitelabelBuildAddition,
  WhitelabelBuildCarrierLink,
  WhitelabelServiceConnection,
} from "@/lib/whitelabel/types";
import { verifySupabaseProjectAccess, verifyVercelProjectAccess } from "@/lib/whitelabel/provider-verification";
import { verifyResendSenderAccess } from "@/lib/whitelabel/email-verification";
import {
  verifyAnthropicAccess,
  verifyBunnyVideoAccess,
  type BunnyLibraryInput,
} from "@/lib/whitelabel/content-service-verification";
import {
  CHECK_MIGRATION_SQL,
  CLEAN_CUSTOMER_DATA_SQL,
  CLEAN_CUSTOMER_MIGRATIONS,
  CLEAN_DATABASE_ASSERTION_SQL,
  CLEANUP_MIGRATION_KEY,
  migrationMarkerSql,
  readCustomerMigrationSql,
} from "./clean-schema";
import { PROVISIONING_STEPS, nextProvisioningStep, seedProvisioningSteps, type ProvisioningStepKey } from "./plan";
import {
  assertSupabaseProjectHealthy,
  getSupabaseProjectKeys,
  runSupabaseSql,
  updateSupabaseAuthConfig,
  uploadSupabaseStorageObject,
} from "./supabase-management";
import {
  createVercelGitDeployment,
  ensureVercelProjectDomain,
  getVercelDeployment,
  upsertVercelEnvironment,
} from "./vercel-management";
import type {
  ProvisioningState,
  StepExecutionOutcome,
  WhitelabelProvisioningRun,
  WhitelabelProvisioningStep,
} from "./types";

const BUILD_SELECT =
  "id, agency_name, product_name, short_name, primary_contact_name, primary_contact_email, initial_admin_name, initial_admin_email, domain, timezone, payment_status, standard_scope_confirmed, maintenance_status, notes, brand_primary_color, brand_accent_color, logo_path, favicon_path, support_email, reply_to_email, email_from, licensing_provider_name, licensing_code, licensing_login_url, licensing_requirements_url, licensing_application_url, graduation_policy_count, graduation_window_days, stall_persisted_lapse_days, stall_exam_unscheduled_days, stall_no_checkin_days, stall_checkin_lapsed_days, created_by, updated_by, created_at, updated_at";
const SERVICE_SELECT =
  "id, build_id, service_kind, required, status, account_label, provider_name, account_ref, project_ref, login_email, billing_url, next_action, verification_method, credential_secret_id, configuration, verified_by, status_updated_at, last_checked_at, created_at, updated_at";
const ADDITION_SELECT =
  "id, build_id, addition_type, name, delivery_requirements, timeline_notes, status, created_at, updated_at";
const CARRIER_SELECT =
  "id, build_id, company_key, display_name, portal_url, sort_order, show_in_resources, created_at, updated_at";

const SCHEMA_BATCH_SIZE = 8;

type Setup = {
  build: WhitelabelBuild;
  services: WhitelabelServiceConnection[];
  additions: WhitelabelBuildAddition[];
  carriers: WhitelabelBuildCarrierLink[];
};

type StepContext = Setup & {
  run: WhitelabelProvisioningRun;
  step: WhitelabelProvisioningStep;
};

function sourceSha(value: string): string {
  const clean = value.trim();
  if (!/^[0-9a-f]{7,64}$/i.test(clean)) throw new Error("Source version must be a Git commit SHA.");
  return clean;
}

function publicAppUrl(build: WhitelabelBuild): string {
  return `https://${build.domain}`;
}

function customerProjectUrl(projectRef: string): string {
  return `https://${projectRef}.supabase.co`;
}

function service(setup: Setup, kind: WhitelabelServiceConnection["service_kind"]): WhitelabelServiceConnection {
  const row = setup.services.find((item) => item.service_kind === kind && item.build_id === setup.build.id);
  if (!row) throw new Error(`${kind} service connection is missing from this build.`);
  return row;
}

function safeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Provisioning failed unexpectedly.";
  if (/bearer\s+|(?:api[_ -]?key|secret|token|password)\s*[:=]|sb_secret_|sbp_|sk-|re_[A-Za-z0-9]/i.test(raw)) {
    return "Provider operation failed. Check the customer provider access and retry this step.";
  }
  return raw.slice(0, 1000);
}

function queryRows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
  if (value && typeof value === "object") {
    for (const key of ["data", "result", "rows"]) {
      const candidate = (value as Record<string, unknown>)[key];
      if (Array.isArray(candidate)) return candidate.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
    }
  }
  return [];
}

async function loadSetup(buildId: string): Promise<Setup> {
  const admin = createServiceRoleClient();
  const [buildResult, servicesResult, additionsResult, carriersResult] = await Promise.all([
    admin.from("whitelabel_build").select(BUILD_SELECT).eq("id", buildId).maybeSingle(),
    admin.from("whitelabel_service_connection").select(SERVICE_SELECT).eq("build_id", buildId),
    admin.from("whitelabel_build_addition").select(ADDITION_SELECT).eq("build_id", buildId),
    admin.from("whitelabel_build_carrier_link").select(CARRIER_SELECT).eq("build_id", buildId).order("sort_order", { ascending: true }),
  ]);
  if (buildResult.error || !buildResult.data) throw new Error("OS build not found.");
  if (servicesResult.error) throw new Error("Could not load build service connections.");
  if (additionsResult.error) throw new Error("Could not load purchased additions.");
  if (carriersResult.error) throw new Error("Could not load customer carrier links.");
  return {
    build: buildResult.data as WhitelabelBuild,
    services: (servicesResult.data ?? []) as WhitelabelServiceConnection[],
    additions: (additionsResult.data ?? []) as WhitelabelBuildAddition[],
    carriers: (carriersResult.data ?? []) as WhitelabelBuildCarrierLink[],
  };
}

async function providerCredential(
  buildId: string,
  kind: "vercel" | "supabase" | "email" | "ai" | "video",
): Promise<string> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc("get_whitelabel_service_credential", {
    p_build_id: buildId,
    p_service_kind: kind,
  });
  if (error || typeof data !== "string" || !data) throw new Error(`${kind} authorization is unavailable. Re-run the provider access check.`);
  return data;
}

function bunnyLibrariesFromService(
  video: WhitelabelServiceConnection,
  secretPayload: string,
): BunnyLibraryInput[] {
  let keys: Record<string, string> = {};
  try {
    const parsed = JSON.parse(secretPayload) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      keys = Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      );
    }
  } catch {
    throw new Error("Stored Bunny authorization is invalid. Re-run the video provider check.");
  }
  const libraries = video.configuration?.libraries;
  const config = libraries && typeof libraries === "object" && !Array.isArray(libraries)
    ? (libraries as Record<string, unknown>)
    : {};
  return (["recruiting", "live", "tutorials"] as const).map((key) => {
    const value = config[key];
    const row = value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
    return {
      key,
      libraryId: typeof row.libraryId === "string" ? row.libraryId : "",
      apiKey: keys[key] ?? "",
      cdnHostname: typeof row.cdnHostname === "string" ? row.cdnHostname : null,
    };
  });
}

async function generatedSecret(buildId: string, kind: "cron_secret" | "initial_admin_invite_url"): Promise<string | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc("get_whitelabel_generated_secret", {
    p_build_id: buildId,
    p_secret_kind: kind,
  });
  if (error) throw new Error("Secure provisioning state could not be read.");
  return typeof data === "string" && data ? data : null;
}

async function saveGeneratedSecret(buildId: string, kind: "cron_secret" | "initial_admin_invite_url", secret: string) {
  const admin = createServiceRoleClient();
  const { error } = await admin.rpc("store_whitelabel_generated_secret", {
    p_build_id: buildId,
    p_secret_kind: kind,
    p_secret: secret,
  });
  if (error) throw new Error("Secure provisioning state could not be saved.");
}

async function loadState(runId: string, buildId: string): Promise<ProvisioningState> {
  const admin = createServiceRoleClient();
  const [runResult, stepsResult] = await Promise.all([
    admin.from("whitelabel_provisioning_run").select("*").eq("id", runId).eq("build_id", buildId).maybeSingle(),
    admin.from("whitelabel_provisioning_step").select("*").eq("run_id", runId).eq("build_id", buildId).order("ordinal", { ascending: true }),
  ]);
  if (runResult.error || !runResult.data) throw new Error("Provisioning run not found for this build.");
  if (stepsResult.error) throw new Error("Provisioning steps could not be loaded.");
  return {
    run: runResult.data as WhitelabelProvisioningRun,
    steps: (stepsResult.data ?? []) as WhitelabelProvisioningStep[],
  };
}

export async function startProvisioning(params: { buildId: string; sourceSha: string; actorId: string }): Promise<ProvisioningState> {
  const setup = await loadSetup(params.buildId);
  const readiness = getBuildReadiness(setup.build, setup.services, setup.additions);
  if (!readiness.ready) throw new Error("This build is not ready. Complete every required intake/access item before provisioning.");

  const admin = createServiceRoleClient();
  const { data: existing } = await admin
    .from("whitelabel_provisioning_run")
    .select("id")
    .eq("build_id", params.buildId)
    .in("status", ["pending", "running", "blocked", "failed"])
    .maybeSingle();
  if (existing?.id) return loadState(String(existing.id), params.buildId);

  const { data: run, error } = await admin
    .from("whitelabel_provisioning_run")
    .insert({ build_id: params.buildId, source_sha: sourceSha(params.sourceSha), status: "pending", started_by: params.actorId })
    .select("*")
    .single();
  if (error || !run) throw new Error("Could not create the provisioning run.");

  const { error: stepsError } = await admin.from("whitelabel_provisioning_step").insert(
    seedProvisioningSteps().map((item) => ({ ...item, run_id: run.id, build_id: params.buildId })),
  );
  if (stepsError) {
    await admin.from("whitelabel_provisioning_run").delete().eq("id", run.id);
    throw new Error("Could not initialize provisioning steps.");
  }
  return loadState(String(run.id), params.buildId);
}

async function executeValidate(ctx: StepContext): Promise<StepExecutionOutcome> {
  const readiness = getBuildReadiness(ctx.build, ctx.services, ctx.additions);
  if (!readiness.ready) {
    return { kind: "blocked", message: `Build readiness changed: ${readiness.missing[0]?.label ?? "required intake is incomplete"}.` };
  }
  if (!process.env.WHITELABEL_VERCEL_GIT_REPO_ID?.trim()) {
    return { kind: "blocked", message: "Assembly Line is missing WHITELABEL_VERCEL_GIT_REPO_ID." };
  }
  return { kind: "succeeded", safeResult: { sourceSha: ctx.run.source_sha, domain: ctx.build.domain } };
}

async function executeProviderCheck(ctx: StepContext): Promise<StepExecutionOutcome> {
  const vercel = service(ctx, "vercel");
  const supabase = service(ctx, "supabase");
  const video = service(ctx, "video");
  if (!vercel.account_ref || !vercel.project_ref || !supabase.project_ref) {
    return { kind: "blocked", message: "Vercel or Supabase project references are incomplete." };
  }
  const [vercelToken, supabaseToken, emailToken, aiToken] = await Promise.all([
    providerCredential(ctx.build.id, "vercel"),
    providerCredential(ctx.build.id, "supabase"),
    providerCredential(ctx.build.id, "email"),
    providerCredential(ctx.build.id, "ai"),
  ]);
  const [vercelResult, supabaseResult, emailResult, aiResult] = await Promise.all([
    verifyVercelProjectAccess({ accessToken: vercelToken, accountRef: vercel.account_ref, projectRef: vercel.project_ref }),
    verifySupabaseProjectAccess({ accessToken: supabaseToken, accountRef: supabase.account_ref, projectRef: supabase.project_ref }),
    verifyResendSenderAccess({ accessToken: emailToken, emailFrom: ctx.build.email_from }),
    verifyAnthropicAccess(aiToken),
  ]);
  if (!vercelResult.ok) return { kind: "blocked", message: vercelResult.error };
  if (!supabaseResult.ok) return { kind: "blocked", message: supabaseResult.error };
  if (!emailResult.ok) return { kind: "blocked", message: emailResult.error };
  if (!aiResult.ok) return { kind: "blocked", message: aiResult.error };

  let videoProvider: string | null = null;
  if (video.status === "verified") {
    const videoSecret = await providerCredential(ctx.build.id, "video");
    const videoResult = await verifyBunnyVideoAccess(bunnyLibrariesFromService(video, videoSecret));
    if (!videoResult.ok) return { kind: "blocked", message: videoResult.error };
    videoProvider = videoResult.providerName;
  }
  return {
    kind: "succeeded",
    safeResult: {
      vercelProjectRef: vercelResult.projectRef,
      supabaseProjectRef: supabaseResult.projectRef,
      emailDomain: emailResult.accountLabel,
      aiProvider: aiResult.providerName,
      videoProvider,
    },
  };
}

async function markerExists(token: string, projectRef: string, name: string): Promise<boolean> {
  const result = await runSupabaseSql({ token, projectRef, query: CHECK_MIGRATION_SQL, parameters: [name] });
  return queryRows(result).length > 0;
}

async function executeCleanSchema(ctx: StepContext): Promise<StepExecutionOutcome> {
  const supabase = service(ctx, "supabase");
  if (!supabase.project_ref) return { kind: "blocked", message: "Supabase project reference is missing." };
  const token = await providerCredential(ctx.build.id, "supabase");
  await assertSupabaseProjectHealthy({ token, projectRef: supabase.project_ref, services: ["db"] });

  await runSupabaseSql({
    token,
    projectRef: supabase.project_ref,
    query: "create table if not exists public.installation_schema_migration (migration_name text primary key, applied_at timestamptz not null default now())",
  });

  let appliedThisAttempt = 0;
  let lastMigration: string | null = null;
  for (const name of CLEAN_CUSTOMER_MIGRATIONS) {
    if (await markerExists(token, supabase.project_ref, name)) continue;
    const sql = await readCustomerMigrationSql(name);
    await runSupabaseSql({ token, projectRef: supabase.project_ref, query: migrationMarkerSql(name, sql) });
    appliedThisAttempt += 1;
    lastMigration = name;
    if (appliedThisAttempt >= SCHEMA_BATCH_SIZE) {
      return {
        kind: "waiting",
        message: "Clean schema batch applied. Continue provisioning to apply the next batch.",
        safeResult: { appliedThisAttempt, totalMigrations: CLEAN_CUSTOMER_MIGRATIONS.length, lastMigration },
      };
    }
  }

  if (!(await markerExists(token, supabase.project_ref, CLEANUP_MIGRATION_KEY))) {
    await runSupabaseSql({ token, projectRef: supabase.project_ref, query: CLEAN_CUSTOMER_DATA_SQL });
  }
  const cleanResult = await runSupabaseSql({ token, projectRef: supabase.project_ref, query: CLEAN_DATABASE_ASSERTION_SQL });
  const counts = queryRows(cleanResult)[0] as Record<string, unknown> | undefined;
  const nested = counts?.counts && typeof counts.counts === "object" ? (counts.counts as Record<string, unknown>) : counts;
  if (!nested || Object.values(nested).some((value) => Number(value) !== 0)) {
    throw new Error("Clean schema verification found customer data before handoff. Provisioning stopped.");
  }
  return { kind: "succeeded", safeResult: { totalMigrations: CLEAN_CUSTOMER_MIGRATIONS.length, clean: true } };
}

async function downloadIntakeAsset(path: string) {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.storage.from("whitelabel-intake").download(path);
  if (error || !data) throw new Error("A required branding asset could not be read from secure intake storage.");
  return { body: await data.arrayBuffer(), contentType: data.type || "application/octet-stream" };
}

async function executeInstallationConfig(ctx: StepContext): Promise<StepExecutionOutcome> {
  const supabase = service(ctx, "supabase");
  if (!supabase.project_ref) return { kind: "blocked", message: "Supabase project reference is missing." };
  const token = await providerCredential(ctx.build.id, "supabase");
  await assertSupabaseProjectHealthy({ token, projectRef: supabase.project_ref, services: ["db", "auth", "rest", "storage"] });
  const keys = await getSupabaseProjectKeys({ token, projectRef: supabase.project_ref });
  if (!ctx.build.logo_path || !ctx.build.favicon_path) return { kind: "blocked", message: "Logo and favicon are required before installation configuration." };

  await runSupabaseSql({
    token,
    projectRef: supabase.project_ref,
    query: "insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('installation-assets','installation-assets',true,5242880,array['image/png','image/jpeg','image/webp','image/x-icon','image/vnd.microsoft.icon']::text[]) on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types",
  });
  const [logo, favicon] = await Promise.all([downloadIntakeAsset(ctx.build.logo_path), downloadIntakeAsset(ctx.build.favicon_path)]);
  const [logoUrl, faviconUrl] = await Promise.all([
    uploadSupabaseStorageObject({ projectRef: supabase.project_ref, secretKey: keys.secretKey, bucket: "installation-assets", objectPath: "branding/logo", contentType: logo.contentType, body: logo.body }),
    uploadSupabaseStorageObject({ projectRef: supabase.project_ref, secretKey: keys.secretKey, bucket: "installation-assets", objectPath: "branding/favicon", contentType: favicon.contentType, body: favicon.body }),
  ]);

  const values = [
    ctx.build.agency_name,
    ctx.build.short_name,
    ctx.build.product_name,
    `${ctx.build.product_name} for ${ctx.build.agency_name}.`,
    ctx.build.timezone,
    ctx.build.brand_primary_color,
    ctx.build.brand_accent_color,
    logoUrl,
    faviconUrl,
    ctx.build.support_email,
    ctx.build.reply_to_email,
    ctx.build.licensing_provider_name,
    ctx.build.licensing_code,
    ctx.build.licensing_login_url,
    ctx.build.licensing_requirements_url,
    ctx.build.licensing_application_url,
    ctx.build.graduation_policy_count,
    ctx.build.graduation_window_days,
    ctx.build.stall_persisted_lapse_days,
    ctx.build.stall_exam_unscheduled_days,
    ctx.build.stall_no_checkin_days,
    ctx.build.stall_checkin_lapsed_days,
  ];
  await runSupabaseSql({
    token,
    projectRef: supabase.project_ref,
    query: `update public.installation_config set
      organization_name=$1, short_name=$2, product_name=$3, metadata_description=$4, timezone=$5,
      brand_primary_color=$6, brand_accent_color=$7, logo_url=$8, favicon_url=$9,
      support_email=$10, reply_to_email=$11, licensing_provider_name=$12, licensing_code=$13,
      licensing_login_url=$14, licensing_requirements_url=$15, licensing_application_url=$16,
      graduation_policy_count=$17, graduation_window_days=$18, stall_persisted_lapse_days=$19,
      stall_exam_unscheduled_days=$20, stall_no_checkin_days=$21, stall_checkin_lapsed_days=$22,
      updated_at=now() where singleton=true`,
    parameters: values,
  });
  await runSupabaseSql({
    token,
    projectRef: supabase.project_ref,
    query: `delete from public.installation_carrier_link;
      insert into public.installation_carrier_link (key, company_key, display_name, portal_url, sort_order, show_in_resources)
      select x.key, x.company_key, x.display_name, x.portal_url, x.sort_order, x.show_in_resources
      from jsonb_to_recordset($1::jsonb) as x(
        key text,
        company_key text,
        display_name text,
        portal_url text,
        sort_order integer,
        show_in_resources boolean
      )`,
    parameters: [
      JSON.stringify(
        ctx.carriers.map((carrier) => ({
          key: carrier.id,
          company_key: carrier.company_key,
          display_name: carrier.display_name,
          portal_url: carrier.portal_url,
          sort_order: carrier.sort_order,
          show_in_resources: carrier.show_in_resources,
        })),
      ),
    ],
  });
  const aiService = service(ctx, "ai");
  const videoService = service(ctx, "video");
  await runSupabaseSql({
    token,
    projectRef: supabase.project_ref,
    query: `delete from public.installation_service_binding where service_kind in ('ai','video');
      insert into public.installation_service_binding (service_kind, provider_key, status, account_ref, configuration, last_checked_at)
      values
        ('ai', $1, 'configured', $2, $3::jsonb, $4::timestamptz),
        ('video', $5, $6, $7, $8::jsonb, $9::timestamptz)`,
    parameters: [
      aiService.provider_name.trim().toLowerCase() === "anthropic" ? "anthropic" : aiService.provider_name.trim().toLowerCase(),
      aiService.account_ref,
      JSON.stringify(aiService.configuration ?? {}),
      aiService.last_checked_at,
      videoService.provider_name.trim().toLowerCase() === "bunny" ? "bunny" : (videoService.provider_name.trim().toLowerCase() || "bunny"),
      videoService.status === "verified" ? "configured" : videoService.status === "not_required" ? "not_required" : "missing",
      videoService.account_ref,
      JSON.stringify(videoService.configuration ?? {}),
      videoService.last_checked_at,
    ],
  });
  await updateSupabaseAuthConfig({ token, projectRef: supabase.project_ref, siteUrl: publicAppUrl(ctx.build) });
  return {
    kind: "succeeded",
    safeResult: { logoUrl, faviconUrl, projectRef: supabase.project_ref, carrierCount: ctx.carriers.length },
  };
}

async function executeEnvironment(ctx: StepContext): Promise<StepExecutionOutcome> {
  const vercel = service(ctx, "vercel");
  const supabase = service(ctx, "supabase");
  if (!vercel.account_ref || !vercel.project_ref || !supabase.project_ref) {
    return { kind: "blocked", message: "Vercel or Supabase references are missing." };
  }
  const ai = service(ctx, "ai");
  const video = service(ctx, "video");
  const [vercelToken, supabaseToken, emailToken, aiToken] = await Promise.all([
    providerCredential(ctx.build.id, "vercel"),
    providerCredential(ctx.build.id, "supabase"),
    providerCredential(ctx.build.id, "email"),
    providerCredential(ctx.build.id, "ai"),
  ]);
  const keys = await getSupabaseProjectKeys({ token: supabaseToken, projectRef: supabase.project_ref });
  let cronSecret = await generatedSecret(ctx.build.id, "cron_secret");
  if (!cronSecret) {
    cronSecret = randomBytes(32).toString("base64url");
    await saveGeneratedSecret(ctx.build.id, "cron_secret", cronSecret);
  }
  const logoUrl = `https://${supabase.project_ref}.supabase.co/storage/v1/object/public/installation-assets/branding/logo`;
  const values = [
      { key: "NEXT_PUBLIC_APP_URL", value: publicAppUrl(ctx.build) },
      { key: "NEXT_PUBLIC_SUPABASE_URL", value: customerProjectUrl(supabase.project_ref) },
      { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", value: keys.publishableKey },
      { key: "SUPABASE_SERVICE_ROLE_KEY", value: keys.secretKey, sensitive: true },
      { key: "CRON_SECRET", value: cronSecret, sensitive: true },
      { key: "RESEND_API_KEY", value: emailToken, sensitive: true },
      { key: "RESEND_FROM", value: ctx.build.email_from },
      { key: "RESEND_REPLY_TO", value: ctx.build.reply_to_email },
      { key: "ANTHROPIC_API_KEY", value: aiToken, sensitive: true },
      { key: "INSTALLATION_AI_PROVIDER", value: ai.provider_name.trim().toLowerCase() === "anthropic" ? "anthropic" : ai.provider_name.trim().toLowerCase() },
      { key: "INSTALLATION_COACH_MODE", value: "standard" },
      { key: "INSTALLATION_VIDEO_COLLECTION_AGENT_VLOGS", value: "Agent Vlogs" },
      { key: "INSTALLATION_VIDEO_COLLECTION_LIVE_DIALS", value: "Live Dials" },
      { key: "INSTALLATION_VIDEO_COLLECTION_CASE_STUDIES", value: "Case Studies" },
      { key: "INSTALLATION_ORGANIZATION_NAME", value: ctx.build.agency_name },
      { key: "INSTALLATION_SHORT_NAME", value: ctx.build.short_name },
      { key: "INSTALLATION_PRODUCT_NAME", value: ctx.build.product_name },
      { key: "INSTALLATION_BRAND_PRIMARY", value: ctx.build.brand_primary_color },
      { key: "INSTALLATION_BRAND_ACCENT", value: ctx.build.brand_accent_color },
      { key: "INSTALLATION_LOGO_URL", value: logoUrl },
      { key: "INSTALLATION_SUPPORT_EMAIL", value: ctx.build.support_email },
      { key: "INSTALLATION_REPLY_TO_EMAIL", value: ctx.build.reply_to_email },
      { key: "INSTALLATION_TIMEZONE", value: ctx.build.timezone },
      { key: "BUG_REPORT_TO", value: ctx.build.support_email },
      { key: "MARKETING_HOSTS", value: "marketing.invalid" },
      { key: "FLAGGED_APP_HOST", value: "" },
  ];
  if (video.status === "verified") {
    const videoSecret = await providerCredential(ctx.build.id, "video");
    const libraries = bunnyLibrariesFromService(video, videoSecret);
    const byKey = new Map(libraries.map((library) => [library.key, library]));
    values.push({ key: "INSTALLATION_VIDEO_PROVIDER", value: "bunny" });
    for (const [key, prefix] of [["recruiting", "BUNNY_RECRUITING"], ["live", "BUNNY_LIVE"], ["tutorials", "BUNNY_TUTORIALS"]] as const) {
      const library = byKey.get(key);
      if (!library?.libraryId || !library.apiKey) continue;
      values.push({ key: `${prefix}_LIBRARY_ID`, value: library.libraryId });
      values.push({ key: `${prefix}_API_KEY`, value: library.apiKey, sensitive: true });
      if (library.cdnHostname) values.push({ key: `${prefix}_CDN_HOSTNAME`, value: library.cdnHostname });
    }
  }
  await upsertVercelEnvironment({
    token: vercelToken,
    teamId: vercel.account_ref,
    projectRef: vercel.project_ref,
    values,
  });
  return { kind: "succeeded", safeResult: { envConfigured: true, projectRef: vercel.project_ref } };
}

async function executeDeployment(ctx: StepContext): Promise<StepExecutionOutcome> {
  const vercel = service(ctx, "vercel");
  if (!vercel.account_ref || !vercel.project_ref) return { kind: "blocked", message: "Vercel project references are missing." };
  const token = await providerCredential(ctx.build.id, "vercel");
  if (ctx.step.external_ref) {
    const existing = await getVercelDeployment({ token, teamId: vercel.account_ref, deploymentRef: ctx.step.external_ref });
    const state = (existing.readyState ?? "").toUpperCase();
    if (state === "READY") return { kind: "succeeded", externalRef: existing.id, externalUrl: existing.url ? `https://${existing.url.replace(/^https?:\/\//, "")}` : ctx.step.external_url, safeResult: { readyState: state } };
    if (state === "ERROR" || state === "CANCELED") throw new Error(`Vercel deployment ended in ${state}.`);
    return { kind: "waiting", message: `Vercel deployment is ${state || "still building"}. Continue to poll it.`, externalRef: existing.id, externalUrl: existing.url, safeResult: { readyState: state || null } };
  }
  const repoId = process.env.WHITELABEL_VERCEL_GIT_REPO_ID?.trim();
  if (!repoId) return { kind: "blocked", message: "Assembly Line is missing WHITELABEL_VERCEL_GIT_REPO_ID." };
  const created = await createVercelGitDeployment({
    token,
    teamId: vercel.account_ref,
    projectRef: vercel.project_ref,
    projectName: ctx.build.domain
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100),
    repoId,
    sourceSha: ctx.run.source_sha,
  });
  return { kind: created.readyState?.toUpperCase() === "READY" ? "succeeded" : "waiting", message: "Vercel deployment started. Continue provisioning to poll it.", externalRef: created.id, externalUrl: created.url, safeResult: { readyState: created.readyState } };
}

async function executeDomain(ctx: StepContext): Promise<StepExecutionOutcome> {
  const vercel = service(ctx, "vercel");
  if (!vercel.account_ref || !vercel.project_ref) return { kind: "blocked", message: "Vercel project references are missing." };
  const token = await providerCredential(ctx.build.id, "vercel");
  const result = await ensureVercelProjectDomain({ token, teamId: vercel.account_ref, projectRef: vercel.project_ref, domain: ctx.build.domain });
  if (!result.verified) {
    return { kind: "blocked", message: "Vercel needs customer DNS/domain ownership action. Complete the displayed provider verification, then retry.", externalRef: result.name, safeResult: { verification: result.verification } };
  }
  return { kind: "succeeded", externalRef: result.name, externalUrl: publicAppUrl(ctx.build), safeResult: { verified: true } };
}

async function executeInitialAdmin(ctx: StepContext): Promise<StepExecutionOutcome> {
  const supabase = service(ctx, "supabase");
  if (!supabase.project_ref) return { kind: "blocked", message: "Supabase project reference is missing." };
  const token = await providerCredential(ctx.build.id, "supabase");
  const keys = await getSupabaseProjectKeys({ token, projectRef: supabase.project_ref });
  const customer = createSupabaseClient(customerProjectUrl(supabase.project_ref), keys.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = ctx.build.initial_admin_email.trim().toLowerCase();
  const { data: existingPerson, error: personLookupError } = await customer
    .from("person")
    .select("id, auth_user_id")
    .ilike("email", email)
    .maybeSingle();
  if (personLookupError) throw new Error("Could not inspect the customer admin record.");
  let personId = existingPerson?.id as string | undefined;
  if (!personId) {
    const { data, error } = await customer
      .from("person")
      .insert({ full_name: ctx.build.initial_admin_name, email, is_owner: true, is_admin: true, is_super_admin: true, is_builder: false, is_producer: false })
      .select("id")
      .single();
    if (error || !data) throw new Error("Could not create the initial customer admin record.");
    personId = String(data.id);
  } else {
    const { error } = await customer
      .from("person")
      .update({ full_name: ctx.build.initial_admin_name, is_owner: true, is_admin: true, is_super_admin: true })
      .eq("id", personId);
    if (error) throw new Error("Could not update the initial customer admin record.");
  }

  let setupUrl = await generatedSecret(ctx.build.id, "initial_admin_invite_url");
  if (!setupUrl) {
    const users = await customer.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (users.error) throw new Error("Could not inspect customer Auth before creating the admin invitation.");
    const existingUser = users.data.users.find((user) => user.email?.toLowerCase() === email);
    if (existingUser) {
      await customer.from("person").update({ auth_user_id: existingUser.id }).eq("id", personId);
    }
    const type = existingUser ? "magiclink" : "invite";
    const link = await customer.auth.admin.generateLink({
      type,
      email,
      options: { redirectTo: `${publicAppUrl(ctx.build)}/auth/callback?next=/welcome` },
    });
    if (link.error || !link.data?.properties?.hashed_token) throw new Error("Could not create the initial customer admin setup link.");
    setupUrl = `${publicAppUrl(ctx.build)}/auth/confirm?token_hash=${encodeURIComponent(link.data.properties.hashed_token)}&type=${type}&next=/welcome`;
    await saveGeneratedSecret(ctx.build.id, "initial_admin_invite_url", setupUrl);
  }

  const sent = await sendEmail({
    to: email,
    subject: `${ctx.build.product_name} admin setup`,
    text: `You are the initial administrator for ${ctx.build.agency_name}.\n\nSet up your account: ${setupUrl}\n\nIf you were not expecting this invitation, ignore this email.`,
    replyTo: ctx.build.reply_to_email,
    idempotencyKey: `whitelabel-initial-admin-${ctx.step.request_key}`,
  });
  if (!sent.ok) throw new Error("Initial admin setup was prepared, but the setup email could not be delivered. Retry this step.");
  return { kind: "succeeded", safeResult: { email, personId, emailMessageId: sent.id } };
}

async function executeSmokeCheck(ctx: StepContext): Promise<StepExecutionOutcome> {
  const base = publicAppUrl(ctx.build);
  const [versionResponse, signinResponse] = await Promise.all([
    fetch(`${base}/api/version`, { cache: "no-store", signal: AbortSignal.timeout(15_000) }),
    fetch(`${base}/auth/signin`, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(15_000) }),
  ]);
  if (!versionResponse.ok) throw new Error(`Deployment version endpoint returned HTTP ${versionResponse.status}.`);
  if (signinResponse.status < 200 || signinResponse.status >= 400) throw new Error(`Deployment sign-in route returned HTTP ${signinResponse.status}.`);
  const version = (await versionResponse.json()) as { sha?: string };
  if (!version.sha || !ctx.run.source_sha.startsWith(version.sha) && !version.sha.startsWith(ctx.run.source_sha)) {
    throw new Error("Running deployment source version does not match the requested Whitelabel source SHA.");
  }
  return { kind: "succeeded", safeResult: { sha: version.sha, signinStatus: signinResponse.status } };
}

const executors: Record<ProvisioningStepKey, (ctx: StepContext) => Promise<StepExecutionOutcome>> = {
  validate_intake: executeValidate,
  verify_provider_access: executeProviderCheck,
  apply_clean_schema: executeCleanSchema,
  configure_installation: executeInstallationConfig,
  configure_vercel_environment: executeEnvironment,
  deploy_source: executeDeployment,
  configure_domain: executeDomain,
  create_initial_admin: executeInitialAdmin,
  smoke_check: executeSmokeCheck,
};

export async function executeNextProvisioningStep(params: { buildId: string; runId: string }): Promise<ProvisioningState> {
  const [setup, state] = await Promise.all([loadSetup(params.buildId), loadState(params.runId, params.buildId)]);
  if (state.run.status === "succeeded" || state.run.status === "cancelled") return state;
  const key = nextProvisioningStep(state.steps);
  if (!key) {
    const admin = createServiceRoleClient();
    await admin.from("whitelabel_provisioning_run").update({ status: "succeeded", current_step: null, completed_at: new Date().toISOString(), last_error: null }).eq("id", params.runId).eq("build_id", params.buildId);
    return loadState(params.runId, params.buildId);
  }
  const step = state.steps.find((item) => item.step_key === key);
  if (!step) throw new Error("Provisioning step state is incomplete.");

  const admin = createServiceRoleClient();
  const now = new Date().toISOString();
  await Promise.all([
    admin.from("whitelabel_provisioning_run").update({ status: "running", current_step: key, started_at: state.run.started_at ?? now, last_error: null }).eq("id", params.runId).eq("build_id", params.buildId),
    admin.from("whitelabel_provisioning_step").update({ status: "running", attempt_count: step.attempt_count + 1, started_at: step.started_at ?? now, last_error: null }).eq("id", step.id).eq("run_id", params.runId).eq("build_id", params.buildId),
  ]);

  try {
    const freshStep = { ...step, status: "running" as const, attempt_count: step.attempt_count + 1, started_at: step.started_at ?? now };
    const outcome = await executors[key]({ ...setup, run: state.run, step: freshStep });
    const stepUpdate = {
      status: outcome.kind === "succeeded" ? "succeeded" : outcome.kind === "blocked" ? "blocked" : "running",
      external_ref: outcome.externalRef ?? step.external_ref,
      external_url: outcome.externalUrl ?? step.external_url,
      safe_result: outcome.safeResult ?? step.safe_result,
      last_error: outcome.message ?? null,
      completed_at: outcome.kind === "succeeded" ? new Date().toISOString() : null,
    };
    await admin.from("whitelabel_provisioning_step").update(stepUpdate).eq("id", step.id).eq("run_id", params.runId).eq("build_id", params.buildId);
    const runRefs = key === "deploy_source"
      ? { deployment_ref: outcome.externalRef ?? state.run.deployment_ref, deployment_url: outcome.externalUrl ?? state.run.deployment_url }
      : {};
    if (outcome.kind === "blocked") {
      await admin.from("whitelabel_provisioning_run").update({ ...runRefs, status: "blocked", last_error: outcome.message ?? "Owner action is required." }).eq("id", params.runId).eq("build_id", params.buildId);
    } else if (outcome.kind === "succeeded" && key === PROVISIONING_STEPS[PROVISIONING_STEPS.length - 1]) {
      await admin.from("whitelabel_provisioning_run").update({ ...runRefs, status: "succeeded", current_step: null, completed_at: new Date().toISOString(), last_error: null }).eq("id", params.runId).eq("build_id", params.buildId);
    } else {
      await admin.from("whitelabel_provisioning_run").update({ ...runRefs, status: "running", last_error: outcome.message ?? null }).eq("id", params.runId).eq("build_id", params.buildId);
    }
  } catch (error) {
    const message = safeError(error);
    await Promise.all([
      admin.from("whitelabel_provisioning_step").update({ status: "failed", last_error: message }).eq("id", step.id).eq("run_id", params.runId).eq("build_id", params.buildId),
      admin.from("whitelabel_provisioning_run").update({ status: "failed", last_error: message }).eq("id", params.runId).eq("build_id", params.buildId),
    ]);
  }
  return loadState(params.runId, params.buildId);
}
