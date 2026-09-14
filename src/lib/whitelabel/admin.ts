import "server-only";

import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getBuildReadiness } from "./readiness";
import type {
  WhitelabelBuild,
  WhitelabelBuildAddition,
  WhitelabelBuildCarrierLink,
  WhitelabelBuildWithSetup,
  WhitelabelServiceConnection,
} from "./types";

const BUILD_SELECT =
  "id, agency_name, product_name, short_name, primary_contact_name, primary_contact_email, initial_admin_name, initial_admin_email, domain, timezone, payment_status, standard_scope_confirmed, maintenance_status, notes, brand_primary_color, brand_accent_color, logo_path, favicon_path, support_email, reply_to_email, email_from, licensing_provider_name, licensing_code, licensing_login_url, licensing_requirements_url, licensing_application_url, graduation_policy_count, graduation_window_days, stall_persisted_lapse_days, stall_exam_unscheduled_days, stall_no_checkin_days, stall_checkin_lapsed_days, created_by, updated_by, created_at, updated_at";

const SERVICE_SELECT =
  "id, build_id, service_kind, required, status, account_label, provider_name, account_ref, project_ref, login_email, billing_url, next_action, verification_method, credential_secret_id, configuration, verified_by, status_updated_at, last_checked_at, created_at, updated_at";

const ADDITION_SELECT =
  "id, build_id, addition_type, name, delivery_requirements, timeline_notes, status, created_at, updated_at";
const CARRIER_SELECT =
  "id, build_id, company_key, display_name, portal_url, sort_order, show_in_resources, created_at, updated_at";

function genericLoadError(): Error {
  return new Error("OS build data could not be loaded. Try again or contact a developer if the problem continues.");
}

export async function loadOsBuildsForAdmin(): Promise<WhitelabelBuildWithSetup[]> {
  await requireAdmin("/admin/os-builds");
  const admin = createServiceRoleClient();
  const { data: buildData, error: buildError } = await admin
    .from("whitelabel_build")
    .select(BUILD_SELECT)
    .order("updated_at", { ascending: false });
  if (buildError) throw genericLoadError();

  const builds = (buildData ?? []) as WhitelabelBuild[];
  if (builds.length === 0) return [];
  const ids = builds.map((build) => build.id);

  const [serviceResult, additionResult, carrierResult] = await Promise.all([
    admin.from("whitelabel_service_connection").select(SERVICE_SELECT).in("build_id", ids),
    admin.from("whitelabel_build_addition").select(ADDITION_SELECT).in("build_id", ids),
    admin.from("whitelabel_build_carrier_link").select(CARRIER_SELECT).in("build_id", ids),
  ]);
  if (serviceResult.error || additionResult.error || carrierResult.error) throw genericLoadError();

  const services = (serviceResult.data ?? []) as WhitelabelServiceConnection[];
  const additions = (additionResult.data ?? []) as WhitelabelBuildAddition[];
  const carriers = (carrierResult.data ?? []) as WhitelabelBuildCarrierLink[];

  return builds.map((build) => {
    const buildServices = services.filter((service) => service.build_id === build.id);
    const buildAdditions = additions.filter((addition) => addition.build_id === build.id);
    return {
      ...build,
      services: buildServices,
      additions: buildAdditions,
      carriers: carriers.filter((carrier) => carrier.build_id === build.id),
      readiness: getBuildReadiness(build, buildServices, buildAdditions),
    };
  });
}

export async function loadOsBuildForAdmin(buildId: string): Promise<WhitelabelBuildWithSetup | null> {
  await requireAdmin(`/admin/os-builds/${buildId}`);
  const admin = createServiceRoleClient();
  const { data: buildData, error: buildError } = await admin
    .from("whitelabel_build")
    .select(BUILD_SELECT)
    .eq("id", buildId)
    .maybeSingle();
  if (buildError) throw genericLoadError();
  if (!buildData) return null;

  const [serviceResult, additionResult, carrierResult] = await Promise.all([
    admin
      .from("whitelabel_service_connection")
      .select(SERVICE_SELECT)
      .eq("build_id", buildId)
      .order("service_kind", { ascending: true }),
    admin
      .from("whitelabel_build_addition")
      .select(ADDITION_SELECT)
      .eq("build_id", buildId)
      .order("created_at", { ascending: true }),
    admin
      .from("whitelabel_build_carrier_link")
      .select(CARRIER_SELECT)
      .eq("build_id", buildId)
      .order("sort_order", { ascending: true })
      .order("display_name", { ascending: true }),
  ]);
  if (serviceResult.error || additionResult.error || carrierResult.error) throw genericLoadError();

  const build = buildData as WhitelabelBuild;
  const services = (serviceResult.data ?? []) as WhitelabelServiceConnection[];
  const additions = (additionResult.data ?? []) as WhitelabelBuildAddition[];
  const carriers = (carrierResult.data ?? []) as WhitelabelBuildCarrierLink[];
  let logoUrl: string | null = null;
  let faviconUrl: string | null = null;

  if (build.logo_path) {
    const { data } = await admin.storage
      .from("whitelabel-intake")
      .createSignedUrl(build.logo_path, 60 * 30);
    logoUrl = data?.signedUrl ?? null;
  }

  if (build.favicon_path) {
    const { data } = await admin.storage
      .from("whitelabel-intake")
      .createSignedUrl(build.favicon_path, 60 * 30);
    faviconUrl = data?.signedUrl ?? null;
  }

  return {
    ...build,
    services,
    additions,
    carriers,
    readiness: getBuildReadiness(build, services, additions),
    logoUrl,
    faviconUrl,
  };
}
