"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { writeAudit } from "@/lib/admin/audit";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { SERVICE_CATALOG } from "@/lib/whitelabel/catalog";
import {
  verifySupabaseProjectAccess,
  verifyVercelProjectAccess,
} from "@/lib/whitelabel/provider-verification";
import {
  additionStatusValue,
  additionTypeValue,
  assertNoSecretLikeValue,
  colorValue,
  emailValue,
  isUuid,
  maintenanceStatusValue,
  normalizeDomain,
  optionalText,
  paymentStatusValue,
  providerBillingUrlValue,
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
    if ((serviceKind === "vercel" || serviceKind === "supabase") && status === "verified") {
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
    accessToken = requiredText(formData.get("access_token"), "Provider access token", 4096);
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
