"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { writeAudit } from "@/lib/admin/audit";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isWhitelabelLocalPilot } from "@/lib/local-pilot";
import { SERVICE_CATALOG } from "@/lib/whitelabel/catalog";
import {
  verifySupabaseProjectAccess,
  verifyVercelProjectAccess,
} from "@/lib/whitelabel/provider-verification";
import { verifyResendSenderAccess } from "@/lib/whitelabel/email-verification";
import {
  verifyAnthropicAccess,
  verifyBunnyVideoAccess,
  type BunnyLibraryInput,
} from "@/lib/whitelabel/content-service-verification";
import {
  additionStatusValue,
  additionTypeValue,
  assertNoSecretLikeValue,
  colorValue,
  deliveryPhaseValue,
  emailValue,
  emailFromValue,
  integerRangeValue,
  isUuid,
  maintenanceStatusValue,
  normalizeDomain,
  optionalText,
  paymentStatusValue,
  providerBillingUrlValue,
  requiredHttpsUrlValue,
  requiredText,
  safeReference,
  serviceKindValue,
  serviceStatusValue,
  timezoneValue,
} from "@/lib/whitelabel/validation";

const LIST_PATH = "/admin/os-builds";
const LOGO_BUCKET = "whitelabel-intake";
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_FAVICON_BYTES = 1024 * 1024;
const FAVICON_TYPES = new Set(["image/png", "image/x-icon", "image/vnd.microsoft.icon"]);

function buildPath(buildId: string): string {
  return `${LIST_PATH}/${buildId}`;
}

function revalidateBuild(buildId: string): void {
  revalidatePath(LIST_PATH);
  revalidatePath(buildPath(buildId));
}

function actionError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function actionDone(path: string, code: string): never {
  redirect(`${path}?ok=${encodeURIComponent(code)}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid form data.";
}

function verificationCredential(
  formData: FormData,
  serviceKind: "vercel" | "supabase" | "email" | "ai",
  label: string,
): string {
  if (isWhitelabelLocalPilot()) return `local-pilot-${serviceKind}-credential`;
  return requiredText(formData.get("access_token"), label, 4096);
}

function requiredBuildId(formData: FormData, path = LIST_PATH): string {
  const buildId = String(formData.get("build_id") ?? "").trim();
  if (!isUuid(buildId)) actionError(path, "Invalid OS build.");
  return buildId;
}

function readBuildFields(formData: FormData) {
  const agencyName = requiredText(formData.get("agency_name"), "Agency name");
  const productName = requiredText(formData.get("product_name"), "Product name");
  const primaryContactName = String(formData.get("primary_contact_name") ?? "").trim();
  const primaryContactEmail = emailValue(
    formData.get("primary_contact_email"),
    "Primary contact email",
    false,
  );
  const initialAdminName = String(formData.get("initial_admin_name") ?? "").trim();
  const initialAdminEmail = emailValue(
    formData.get("initial_admin_email"),
    "Initial admin email",
    false,
  );
  const notes = optionalText(formData.get("notes"), 4000);
  assertNoSecretLikeValue(notes, "Notes");

  if (primaryContactName.length > 160) throw new Error("Primary contact name is too long.");
  if (initialAdminName.length > 160) throw new Error("Initial admin name is too long.");

  return {
    agency_name: agencyName,
    product_name: productName,
    short_name: requiredText(formData.get("short_name"), "Short organization name", 80),
    primary_contact_name: primaryContactName,
    primary_contact_email: primaryContactEmail ?? "",
    initial_admin_name: initialAdminName,
    initial_admin_email: initialAdminEmail ?? "",
    domain: normalizeDomain(formData.get("domain")),
    timezone: timezoneValue(formData.get("timezone")),
    payment_status: paymentStatusValue(formData.get("payment_status")),
    standard_scope_confirmed: formData.get("standard_scope_confirmed") === "on",
    maintenance_status: maintenanceStatusValue(formData.get("maintenance_status")),
    brand_primary_color: colorValue(formData.get("brand_primary_color"), "Primary brand color"),
    brand_accent_color: colorValue(formData.get("brand_accent_color"), "Accent brand color"),
    support_email: emailValue(formData.get("support_email"), "Support email", true)!,
    reply_to_email: emailValue(formData.get("reply_to_email"), "Reply-to email", true)!,
    email_from: emailFromValue(formData.get("email_from")),
    licensing_provider_name: requiredText(formData.get("licensing_provider_name"), "Licensing provider", 160),
    licensing_code: requiredText(formData.get("licensing_code"), "Licensing code", 300),
    licensing_login_url: requiredHttpsUrlValue(formData.get("licensing_login_url"), "Licensing login URL"),
    licensing_requirements_url: requiredHttpsUrlValue(formData.get("licensing_requirements_url"), "Licensing requirements URL"),
    licensing_application_url: requiredHttpsUrlValue(formData.get("licensing_application_url"), "Licensing application URL"),
    graduation_policy_count: integerRangeValue(formData.get("graduation_policy_count"), "Graduation policy count", 1, 1000),
    graduation_window_days: integerRangeValue(formData.get("graduation_window_days"), "Graduation window", 1, 3650),
    stall_persisted_lapse_days: integerRangeValue(formData.get("stall_persisted_lapse_days"), "Persisted stall threshold", 1, 365),
    stall_exam_unscheduled_days: integerRangeValue(formData.get("stall_exam_unscheduled_days"), "Exam-unscheduled threshold", 1, 365),
    stall_no_checkin_days: integerRangeValue(formData.get("stall_no_checkin_days"), "No-check-in threshold", 1, 365),
    stall_checkin_lapsed_days: integerRangeValue(formData.get("stall_checkin_lapsed_days"), "Check-in lapse threshold", 1, 365),
    notes,
  };
}

export async function adminCreateOsBuild(formData: FormData) {
  const person = await requireAdmin(`${LIST_PATH}/new`);

  let fields: ReturnType<typeof readBuildFields>;
  try {
    fields = readBuildFields(formData);
  } catch (error) {
    actionError(`${LIST_PATH}/new`, errorMessage(error));
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("whitelabel_build")
    .insert({ ...fields, created_by: person.id, updated_by: person.id })
    .select("id")
    .single();

  if (error || !data?.id) actionError(`${LIST_PATH}/new`, "Could not create the OS build.");

  await writeAudit({
    actorId: person.id,
    action: "whitelabel.build.create",
    detail: { buildId: data.id, agencyName: fields.agency_name },
  });
  revalidateBuild(data.id);
  actionDone(buildPath(data.id), "created");
}

export async function adminSaveOsBuild(formData: FormData) {
  const person = await requireAdmin(LIST_PATH);
  const buildId = requiredBuildId(formData);
  const path = buildPath(buildId);

  let fields: ReturnType<typeof readBuildFields>;
  try {
    fields = readBuildFields(formData);
  } catch (error) {
    actionError(path, errorMessage(error));
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("whitelabel_build")
    .update({ ...fields, updated_by: person.id })
    .eq("id", buildId)
    .select("id")
    .maybeSingle();

  if (error) actionError(path, "Could not save the OS build.");
  if (!data) actionError(LIST_PATH, "OS build not found.");

  await writeAudit({
    actorId: person.id,
    action: "whitelabel.build.update",
    detail: { buildId },
  });
  revalidateBuild(buildId);
  actionDone(path, "saved");
}

export async function adminSaveOsBuildService(formData: FormData) {
  const person = await requireAdmin(LIST_PATH);
  const buildId = requiredBuildId(formData);
  const path = buildPath(buildId);

  let serviceKind;
  let status;
  let accountLabel;
  let providerName;
  let accountRef;
  let projectRef;
  let loginEmail;
  let billingUrl;
  let nextAction;
  const required = formData.get("required") === "on";

  try {
    serviceKind = serviceKindValue(formData.get("service_kind"));
    status = serviceStatusValue(formData.get("status"));
    accountLabel = safeReference(formData.get("account_label"), "Account label");
    providerName =
      serviceKind === "vercel"
        ? "Vercel"
        : serviceKind === "supabase"
          ? "Supabase"
          : safeReference(formData.get("provider_name"), "Provider name") ?? "";
    accountRef = safeReference(formData.get("account_ref"), "Account reference");
    projectRef = safeReference(formData.get("project_ref"), "Project reference");
    loginEmail = emailValue(formData.get("login_email"), "Login email", false);
    billingUrl = providerBillingUrlValue(
      formData.get("billing_url"),
      "Billing/usage link",
      serviceKind,
    );
    assertNoSecretLikeValue(billingUrl, "Billing/usage link");
    nextAction = optionalText(formData.get("next_action"), 1000);
    assertNoSecretLikeValue(nextAction, "Next action");

    if (SERVICE_CATALOG[serviceKind].defaultRequired && !required) {
      throw new Error(`${SERVICE_CATALOG[serviceKind].label} is required for every standard OS build.`);
    }
    if (required && !providerName) {
      throw new Error("A required service needs its provider identified.");
    }
    if (required && status === "not_required") {
      throw new Error("A required service cannot be marked not required.");
    }
    if ((serviceKind === "vercel" || serviceKind === "supabase" || serviceKind === "email" || serviceKind === "ai" || serviceKind === "video") && status === "verified") {
      throw new Error(`Use the ${SERVICE_CATALOG[serviceKind].label} access check below to set verified status.`);
    }
    if (status === "verified" && !accountRef) {
      throw new Error("Verified service access needs an account reference.");
    }
    if ((serviceKind === "vercel" || serviceKind === "supabase") && status === "verified" && !projectRef) {
      throw new Error("Verified Vercel/Supabase access needs the target project reference.");
    }
  } catch (error) {
    actionError(path, errorMessage(error));
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("whitelabel_service_connection")
    .update({
      required,
      status,
      account_label: accountLabel,
      provider_name: providerName,
      account_ref: accountRef,
      project_ref: projectRef,
      login_email: loginEmail,
      billing_url: billingUrl,
      next_action: nextAction,
      verification_method: "manual",
      verified_by: status === "verified" ? person.id : null,
      status_updated_at: new Date().toISOString(),
      last_checked_at: null,
    })
    .eq("build_id", buildId)
    .eq("service_kind", serviceKind)
    .select("id")
    .maybeSingle();

  if (error) actionError(path, "Could not save that service connection.");
  if (!data) actionError(path, "Service connection not found for this build.");

  await writeAudit({
    actorId: person.id,
    action: "whitelabel.service.update",
    detail: { buildId, serviceKind, status },
  });
  revalidateBuild(buildId);
  actionDone(path, "service-saved");
}

export async function adminVerifyOsBuildEmailAccess(formData: FormData) {
  const person = await requireAdmin(LIST_PATH);
  const buildId = requiredBuildId(formData);
  const path = buildPath(buildId);
  let accessToken: string;
  try {
    accessToken = verificationCredential(formData, "email", "Resend API key");
  } catch (error) {
    actionError(path, errorMessage(error));
  }

  const admin = createServiceRoleClient();
  const [{ data: build, error: buildError }, { data: service, error: serviceError }] = await Promise.all([
    admin.from("whitelabel_build").select("email_from").eq("id", buildId).maybeSingle(),
    admin.from("whitelabel_service_connection").select("id").eq("build_id", buildId).eq("service_kind", "email").maybeSingle(),
  ]);
  if (buildError || !build) actionError(LIST_PATH, "OS build not found.");
  if (serviceError || !service) actionError(path, "Email service connection not found for this build.");

  const checkedAt = new Date().toISOString();
  const result = await verifyResendSenderAccess({ accessToken, emailFrom: String(build.email_from ?? "") });
  if (!result.ok) {
    await admin
      .from("whitelabel_service_connection")
      .update({
        status: "failed",
        provider_name: "Resend",
        verification_method: "provider_api",
        verified_by: null,
        status_updated_at: checkedAt,
        last_checked_at: checkedAt,
        next_action: result.error,
      })
      .eq("build_id", buildId)
      .eq("service_kind", "email");
    revalidateBuild(buildId);
    actionError(path, result.error);
  }

  const vaultResult = await admin.rpc("store_whitelabel_service_credential", {
    p_build_id: buildId,
    p_service_kind: "email",
    p_secret: accessToken,
  });
  if (vaultResult.error) actionError(path, "Secure email authorization could not be saved. Retry before continuing.");

  const { error } = await admin
    .from("whitelabel_service_connection")
    .update({
      status: "verified",
      provider_name: result.providerName,
      account_label: result.accountLabel,
      account_ref: result.accountRef,
      billing_url: result.billingUrl,
      verification_method: "provider_api",
      verified_by: person.id,
      status_updated_at: checkedAt,
      last_checked_at: checkedAt,
      next_action: null,
    })
    .eq("build_id", buildId)
    .eq("service_kind", "email");
  if (error) actionError(path, "Email access was verified, but the build record could not be updated.");

  await writeAudit({ actorId: person.id, action: "whitelabel.service.verify", detail: { buildId, serviceKind: "email", accountRef: result.accountRef } });
  revalidateBuild(buildId);
  actionDone(path, "service-verified");
}

export async function adminVerifyOsBuildProviderAccess(formData: FormData) {
  const person = await requireAdmin(LIST_PATH);
  const buildId = requiredBuildId(formData);
  const path = buildPath(buildId);

  let serviceKind;
  let accountRef;
  let projectRef;
  let accessToken;
  try {
    serviceKind = serviceKindValue(formData.get("service_kind"));
    if (serviceKind !== "vercel" && serviceKind !== "supabase") {
      throw new Error("Automated provider verification is available for Vercel and Supabase only.");
    }
    accountRef = safeReference(formData.get("account_ref"), "Account reference");
    projectRef = requiredText(formData.get("project_ref"), "Project reference", 300);
    accessToken = verificationCredential(formData, serviceKind, "Provider access token");
    if (serviceKind === "vercel" && !accountRef) {
      throw new Error("Vercel verification needs the customer team/account reference.");
    }
  } catch (error) {
    actionError(path, errorMessage(error));
  }

  const admin = createServiceRoleClient();
  const { data: service, error: serviceError } = await admin
    .from("whitelabel_service_connection")
    .select("id, account_label")
    .eq("build_id", buildId)
    .eq("service_kind", serviceKind)
    .maybeSingle();
  if (serviceError || !service) actionError(path, "Service connection not found for this build.");

  const result =
    serviceKind === "vercel"
      ? await verifyVercelProjectAccess({
          accessToken,
          accountRef: accountRef!,
          projectRef,
        })
      : await verifySupabaseProjectAccess({
          accessToken,
          accountRef,
          projectRef,
        });

  const checkedAt = new Date().toISOString();
  if (!result.ok) {
    const { error } = await admin
      .from("whitelabel_service_connection")
      .update({
        status: "failed",
        verification_method: "provider_api",
        verified_by: null,
        status_updated_at: checkedAt,
        last_checked_at: checkedAt,
        next_action: result.error,
      })
      .eq("build_id", buildId)
      .eq("service_kind", serviceKind);
    if (error) actionError(path, "Provider access failed and its status could not be saved.");

    await writeAudit({
      actorId: person.id,
      action: "whitelabel.service.verify_failed",
      detail: { buildId, serviceKind },
    });
    revalidateBuild(buildId);
    actionError(path, result.error);
  }

  const vaultResult = await admin.rpc("store_whitelabel_service_credential", {
    p_build_id: buildId,
    p_service_kind: serviceKind,
    p_secret: accessToken,
  });
  if (vaultResult.error) actionError(path, "Secure provider authorization could not be saved. Retry before continuing.");

  const { error } = await admin
    .from("whitelabel_service_connection")
    .update({
      status: "verified",
      provider_name: result.providerName,
      account_label: result.accountLabel ?? service.account_label,
      account_ref: result.accountRef,
      project_ref: result.projectRef,
      billing_url: result.billingUrl,
      verification_method: "provider_api",
      verified_by: person.id,
      status_updated_at: checkedAt,
      last_checked_at: checkedAt,
      next_action: null,
    })
    .eq("build_id", buildId)
    .eq("service_kind", serviceKind);
  if (error) actionError(path, "Provider access was verified, but the build record could not be updated.");

  await writeAudit({
    actorId: person.id,
    action: "whitelabel.service.verify",
    detail: {
      buildId,
      serviceKind,
      accountRef: result.accountRef,
      projectRef: result.projectRef,
    },
  });
  revalidateBuild(buildId);
  actionDone(path, "service-verified");
}

export async function adminVerifyOsBuildAiAccess(formData: FormData) {
  const person = await requireAdmin(LIST_PATH);
  const buildId = requiredBuildId(formData);
  const path = buildPath(buildId);
  let apiKey: string;
  try {
    apiKey = verificationCredential(formData, "ai", "Anthropic API key");
  } catch (error) {
    actionError(path, errorMessage(error));
  }

  const admin = createServiceRoleClient();
  const { data: service, error: serviceError } = await admin
    .from("whitelabel_service_connection")
    .select("id")
    .eq("build_id", buildId)
    .eq("service_kind", "ai")
    .maybeSingle();
  if (serviceError || !service) actionError(path, "AI service connection not found for this build.");

  const checkedAt = new Date().toISOString();
  const result = await verifyAnthropicAccess(apiKey);
  if (!result.ok) {
    await admin
      .from("whitelabel_service_connection")
      .update({
        status: "failed",
        provider_name: "Anthropic",
        verification_method: "provider_api",
        verified_by: null,
        status_updated_at: checkedAt,
        last_checked_at: checkedAt,
        next_action: result.error,
      })
      .eq("build_id", buildId)
      .eq("service_kind", "ai");
    revalidateBuild(buildId);
    actionError(path, result.error);
  }

  const vaultResult = await admin.rpc("store_whitelabel_service_credential", {
    p_build_id: buildId,
    p_service_kind: "ai",
    p_secret: apiKey,
  });
  if (vaultResult.error) actionError(path, "Secure AI authorization could not be saved. Retry before continuing.");

  const { error } = await admin
    .from("whitelabel_service_connection")
    .update({
      status: "verified",
      provider_name: result.providerName,
      account_label: result.accountLabel,
      account_ref: result.accountRef,
      billing_url: result.billingUrl,
      configuration: result.configuration,
      verification_method: "provider_api",
      verified_by: person.id,
      status_updated_at: checkedAt,
      last_checked_at: checkedAt,
      next_action: null,
    })
    .eq("build_id", buildId)
    .eq("service_kind", "ai");
  if (error) actionError(path, "AI access was verified, but the build record could not be updated.");

  await writeAudit({ actorId: person.id, action: "whitelabel.service.verify", detail: { buildId, serviceKind: "ai", provider: result.providerName } });
  revalidateBuild(buildId);
  actionDone(path, "service-verified");
}

function bunnyLibraryInput(
  formData: FormData,
  key: BunnyLibraryInput["key"],
): BunnyLibraryInput {
  return {
    key,
    libraryId: String(formData.get(`${key}_library_id`) ?? "").trim(),
    apiKey: String(formData.get(`${key}_api_key`) ?? "").trim(),
    cdnHostname: String(formData.get(`${key}_cdn_hostname`) ?? "").trim() || null,
  };
}

export async function adminVerifyOsBuildVideoAccess(formData: FormData) {
  const person = await requireAdmin(LIST_PATH);
  const buildId = requiredBuildId(formData);
  const path = buildPath(buildId);
  const libraries = (["recruiting", "live", "tutorials"] as const).map((key) => bunnyLibraryInput(formData, key));

  const admin = createServiceRoleClient();
  const { data: service, error: serviceError } = await admin
    .from("whitelabel_service_connection")
    .select("id")
    .eq("build_id", buildId)
    .eq("service_kind", "video")
    .maybeSingle();
  if (serviceError || !service) actionError(path, "Video service connection not found for this build.");

  const checkedAt = new Date().toISOString();
  const result = await verifyBunnyVideoAccess(libraries);
  if (!result.ok) {
    await admin
      .from("whitelabel_service_connection")
      .update({
        status: "failed",
        provider_name: "Bunny",
        verification_method: "provider_api",
        verified_by: null,
        status_updated_at: checkedAt,
        last_checked_at: checkedAt,
        next_action: result.error,
      })
      .eq("build_id", buildId)
      .eq("service_kind", "video");
    revalidateBuild(buildId);
    actionError(path, result.error);
  }

  const secretPayload = JSON.stringify(
    Object.fromEntries(
      libraries
        .filter((item) => item.libraryId && item.apiKey)
        .map((item) => [item.key, item.apiKey]),
    ),
  );
  const vaultResult = await admin.rpc("store_whitelabel_service_credential", {
    p_build_id: buildId,
    p_service_kind: "video",
    p_secret: secretPayload,
  });
  if (vaultResult.error) actionError(path, "Secure video authorization could not be saved. Retry before continuing.");

  const { error } = await admin
    .from("whitelabel_service_connection")
    .update({
      status: "verified",
      provider_name: result.providerName,
      account_label: result.accountLabel,
      account_ref: result.accountRef,
      billing_url: result.billingUrl,
      configuration: result.configuration,
      verification_method: "provider_api",
      verified_by: person.id,
      status_updated_at: checkedAt,
      last_checked_at: checkedAt,
      next_action: null,
    })
    .eq("build_id", buildId)
    .eq("service_kind", "video");
  if (error) actionError(path, "Video access was verified, but the build record could not be updated.");

  await writeAudit({ actorId: person.id, action: "whitelabel.service.verify", detail: { buildId, serviceKind: "video", provider: result.providerName } });
  revalidateBuild(buildId);
  actionDone(path, "service-verified");
}

function readAdditionFields(formData: FormData) {
  const deliveryRequirements = String(formData.get("delivery_requirements") ?? "").trim();
  const timelineNotes = optionalText(formData.get("timeline_notes"), 2000);
  assertNoSecretLikeValue(deliveryRequirements || null, "Delivery requirements");
  assertNoSecretLikeValue(timelineNotes, "Timeline notes");
  if (deliveryRequirements.length > 4000) throw new Error("Delivery requirements are too long.");

  return {
    addition_type: additionTypeValue(formData.get("addition_type")),
    name: requiredText(formData.get("name"), "Addition name"),
    delivery_requirements: deliveryRequirements,
    timeline_notes: timelineNotes,
    status: additionStatusValue(formData.get("status")),
    delivery_phase: deliveryPhaseValue(formData.get("delivery_phase") ?? "launch"),
  };
}

export async function adminAddOsBuildAddition(formData: FormData) {
  const person = await requireAdmin(LIST_PATH);
  const buildId = requiredBuildId(formData);
  const path = buildPath(buildId);

  let fields: ReturnType<typeof readAdditionFields>;
  try {
    fields = readAdditionFields(formData);
  } catch (error) {
    actionError(path, errorMessage(error));
  }

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("whitelabel_build_addition")
    .insert({ build_id: buildId, ...fields });
  if (error) actionError(path, "Could not add purchased work.");

  await writeAudit({
    actorId: person.id,
    action: "whitelabel.addition.create",
    detail: { buildId, additionName: fields.name, additionType: fields.addition_type },
  });
  revalidateBuild(buildId);
  actionDone(path, "addition-added");
}

export async function adminUpdateOsBuildAddition(formData: FormData) {
  const person = await requireAdmin(LIST_PATH);
  const buildId = requiredBuildId(formData);
  const path = buildPath(buildId);
  const additionId = String(formData.get("addition_id") ?? "").trim();
  if (!isUuid(additionId)) actionError(path, "Invalid purchased-work item.");

  let fields: ReturnType<typeof readAdditionFields>;
  try {
    fields = readAdditionFields(formData);
  } catch (error) {
    actionError(path, errorMessage(error));
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("whitelabel_build_addition")
    .update(fields)
    .eq("build_id", buildId)
    .eq("id", additionId)
    .select("id")
    .maybeSingle();

  if (error) actionError(path, "Could not save purchased work.");
  if (!data) actionError(path, "Purchased-work item not found for this build.");

  await writeAudit({
    actorId: person.id,
    action: "whitelabel.addition.update",
    detail: { buildId, additionId },
  });
  revalidateBuild(buildId);
  actionDone(path, "addition-saved");
}

export async function adminDeleteOsBuildAddition(formData: FormData) {
  const person = await requireAdmin(LIST_PATH);
  const buildId = requiredBuildId(formData);
  const path = buildPath(buildId);
  const additionId = String(formData.get("addition_id") ?? "").trim();
  if (!isUuid(additionId)) actionError(path, "Invalid purchased-work item.");

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("whitelabel_build_addition")
    .delete()
    .eq("build_id", buildId)
    .eq("id", additionId)
    .select("id")
    .maybeSingle();
  if (error) actionError(path, "Could not remove purchased work.");
  if (!data) actionError(path, "Purchased-work item not found for this build.");

  await writeAudit({
    actorId: person.id,
    action: "whitelabel.addition.delete",
    detail: { buildId, additionId },
  });
  revalidateBuild(buildId);
  actionDone(path, "addition-deleted");
}

export async function adminUploadOsBuildLogo(formData: FormData) {
  const person = await requireAdmin(LIST_PATH);
  const buildId = requiredBuildId(formData);
  const path = buildPath(buildId);
  const file = formData.get("logo");

  if (!(file instanceof File) || file.size === 0) actionError(path, "Choose a logo file.");
  if (file.size > MAX_LOGO_BYTES) actionError(path, "Logo must be 5 MB or smaller.");
  if (!LOGO_TYPES.has(file.type)) actionError(path, "Logo must be PNG, JPEG, or WebP.");

  const admin = createServiceRoleClient();
  const { data: build, error: buildError } = await admin
    .from("whitelabel_build")
    .select("id")
    .eq("id", buildId)
    .maybeSingle();
  if (buildError || !build) actionError(LIST_PATH, "OS build not found.");

  const objectKey = `${buildId}/logo`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage.from(LOGO_BUCKET).upload(objectKey, bytes, {
    contentType: file.type,
    upsert: true,
  });
  if (uploadError) actionError(path, "Could not save the logo.");

  const { error: updateError } = await admin
    .from("whitelabel_build")
    .update({ logo_path: objectKey, updated_by: person.id })
    .eq("id", buildId);
  if (updateError) actionError(path, "Logo uploaded, but the build record could not be updated.");

  await writeAudit({
    actorId: person.id,
    action: "whitelabel.logo.upload",
    detail: { buildId, contentType: file.type, size: file.size },
  });
  revalidateBuild(buildId);
  actionDone(path, "logo-saved");
}

export async function adminUploadOsBuildFavicon(formData: FormData) {
  const person = await requireAdmin(LIST_PATH);
  const buildId = requiredBuildId(formData);
  const path = buildPath(buildId);
  const file = formData.get("favicon");

  if (!(file instanceof File) || file.size === 0) actionError(path, "Choose a favicon file.");
  if (file.size > MAX_FAVICON_BYTES) actionError(path, "Favicon must be 1 MB or smaller.");
  if (!FAVICON_TYPES.has(file.type)) actionError(path, "Favicon must be PNG or ICO.");

  const admin = createServiceRoleClient();
  const { data: build, error: buildError } = await admin
    .from("whitelabel_build")
    .select("id")
    .eq("id", buildId)
    .maybeSingle();
  if (buildError || !build) actionError(LIST_PATH, "OS build not found.");

  const objectKey = `${buildId}/favicon`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage.from(LOGO_BUCKET).upload(objectKey, bytes, {
    contentType: file.type,
    upsert: true,
  });
  if (uploadError) actionError(path, "Could not save the favicon.");

  const { error: updateError } = await admin
    .from("whitelabel_build")
    .update({ favicon_path: objectKey, updated_by: person.id })
    .eq("id", buildId);
  if (updateError) actionError(path, "Favicon uploaded, but the build record could not be updated.");

  await writeAudit({
    actorId: person.id,
    action: "whitelabel.favicon.upload",
    detail: { buildId, contentType: file.type, size: file.size },
  });
  revalidateBuild(buildId);
  actionDone(path, "favicon-saved");
}

function carrierFields(formData: FormData) {
  const companyKey = requiredText(formData.get("company_key"), "Carrier company key", 160).toLowerCase();
  const displayName = requiredText(formData.get("display_name"), "Carrier display name", 160);
  const portalUrl = requiredHttpsUrlValue(formData.get("portal_url"), "Carrier portal URL");
  const sortOrder = integerRangeValue(formData.get("sort_order") ?? "0", "Carrier sort order", 0, 10000);
  assertNoSecretLikeValue(companyKey, "Carrier company key");
  assertNoSecretLikeValue(displayName, "Carrier display name");
  assertNoSecretLikeValue(portalUrl, "Carrier portal URL");
  return {
    company_key: companyKey,
    display_name: displayName,
    portal_url: portalUrl,
    sort_order: sortOrder,
    show_in_resources: formData.get("show_in_resources") === "on",
  };
}

export async function adminAddOsBuildCarrier(formData: FormData) {
  const person = await requireAdmin(LIST_PATH);
  const buildId = requiredBuildId(formData);
  const path = buildPath(buildId);
  let fields: ReturnType<typeof carrierFields>;
  try {
    fields = carrierFields(formData);
  } catch (error) {
    actionError(path, errorMessage(error));
  }
  const admin = createServiceRoleClient();
  const { error } = await admin.from("whitelabel_build_carrier_link").insert({ build_id: buildId, ...fields });
  if (error) actionError(path, "Could not add that carrier. Confirm it is not already configured for this build.");
  await writeAudit({ actorId: person.id, action: "whitelabel.carrier.add", detail: { buildId, companyKey: fields.company_key } });
  revalidateBuild(buildId);
  actionDone(path, "carrier-added");
}

export async function adminUpdateOsBuildCarrier(formData: FormData) {
  const person = await requireAdmin(LIST_PATH);
  const buildId = requiredBuildId(formData);
  const path = buildPath(buildId);
  const carrierId = String(formData.get("carrier_id") ?? "").trim();
  if (!isUuid(carrierId)) actionError(path, "Invalid carrier row.");
  let fields: ReturnType<typeof carrierFields>;
  try {
    fields = carrierFields(formData);
  } catch (error) {
    actionError(path, errorMessage(error));
  }
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("whitelabel_build_carrier_link")
    .update(fields)
    .eq("id", carrierId)
    .eq("build_id", buildId)
    .select("id")
    .maybeSingle();
  if (error) actionError(path, "Could not save the carrier configuration.");
  if (!data) actionError(path, "Carrier row not found for this build.");
  await writeAudit({ actorId: person.id, action: "whitelabel.carrier.update", detail: { buildId, carrierId } });
  revalidateBuild(buildId);
  actionDone(path, "carrier-saved");
}

export async function adminDeleteOsBuildCarrier(formData: FormData) {
  const person = await requireAdmin(LIST_PATH);
  const buildId = requiredBuildId(formData);
  const path = buildPath(buildId);
  const carrierId = String(formData.get("carrier_id") ?? "").trim();
  if (!isUuid(carrierId)) actionError(path, "Invalid carrier row.");
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("whitelabel_build_carrier_link")
    .delete()
    .eq("id", carrierId)
    .eq("build_id", buildId)
    .select("id")
    .maybeSingle();
  if (error) actionError(path, "Could not remove the carrier configuration.");
  if (!data) actionError(path, "Carrier row not found for this build.");
  await writeAudit({ actorId: person.id, action: "whitelabel.carrier.delete", detail: { buildId, carrierId } });
  revalidateBuild(buildId);
  actionDone(path, "carrier-deleted");
}
