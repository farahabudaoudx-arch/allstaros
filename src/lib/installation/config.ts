import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { ALL_STAR_CARRIER_LINKS, ALL_STAR_INSTALLATION_DEFAULTS } from "./defaults";
import type { InstallationBrand, InstallationCarrierLink, InstallationConfig } from "./types";

const CONFIG_SELECT =
  "organization_name, short_name, product_name, metadata_description, timezone, brand_primary_color, brand_accent_color, logo_url, favicon_url, support_email, reply_to_email, licensing_provider_name, licensing_code, licensing_login_url, licensing_requirements_url, licensing_application_url, graduation_policy_count, graduation_window_days, stall_persisted_lapse_days, stall_exam_unscheduled_days, stall_no_checkin_days, stall_checkin_lapsed_days";

type ConfigRow = {
  organization_name: string;
  short_name: string;
  product_name: string;
  metadata_description: string;
  timezone: string;
  brand_primary_color: string;
  brand_accent_color: string;
  logo_url: string;
  favicon_url: string;
  support_email: string;
  reply_to_email: string;
  licensing_provider_name: string;
  licensing_code: string;
  licensing_login_url: string;
  licensing_requirements_url: string;
  licensing_application_url: string;
  graduation_policy_count: number;
  graduation_window_days: number;
  stall_persisted_lapse_days: number;
  stall_exam_unscheduled_days: number;
  stall_no_checkin_days: number;
  stall_checkin_lapsed_days: number;
};

function toConfig(row: ConfigRow): InstallationConfig {
  return {
    organizationName: row.organization_name,
    shortName: row.short_name,
    productName: row.product_name,
    metadataDescription: row.metadata_description,
    timezone: row.timezone,
    brandPrimaryColor: row.brand_primary_color,
    brandAccentColor: row.brand_accent_color,
    logoUrl: row.logo_url,
    faviconUrl: row.favicon_url,
    supportEmail: row.support_email,
    replyToEmail: row.reply_to_email,
    licensingProviderName: row.licensing_provider_name,
    licensingCode: row.licensing_code,
    licensingLoginUrl: row.licensing_login_url,
    licensingRequirementsUrl: row.licensing_requirements_url,
    licensingApplicationUrl: row.licensing_application_url,
    graduationPolicyCount: row.graduation_policy_count,
    graduationWindowDays: row.graduation_window_days,
    stallPersistedLapseDays: row.stall_persisted_lapse_days,
    stallExamUnscheduledDays: row.stall_exam_unscheduled_days,
    stallNoCheckinDays: row.stall_no_checkin_days,
    stallCheckinLapsedDays: row.stall_checkin_lapsed_days,
  };
}

export async function getInstallationConfig(): Promise<InstallationConfig> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("installation_config")
      .select(CONFIG_SELECT)
      .eq("singleton", true)
      .maybeSingle();
    if (error || !data) return { ...ALL_STAR_INSTALLATION_DEFAULTS };
    return toConfig(data as ConfigRow);
  } catch {
    return { ...ALL_STAR_INSTALLATION_DEFAULTS };
  }
}

export async function getInstallationBrand(): Promise<InstallationBrand> {
  const config = await getInstallationConfig();
  const { organizationName, shortName, productName, brandPrimaryColor, brandAccentColor, logoUrl, faviconUrl } = config;
  return { organizationName, shortName, productName, brandPrimaryColor, brandAccentColor, logoUrl, faviconUrl };
}

export async function getInstallationCarrierLinks(): Promise<InstallationCarrierLink[]> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("installation_carrier_link")
      .select("key, company_key, display_name, portal_url, sort_order, show_in_resources")
      .order("sort_order", { ascending: true })
      .order("display_name", { ascending: true });
    if (error) return ALL_STAR_CARRIER_LINKS.map((row) => ({ ...row }));
    return (data ?? []).map((row) => ({
      key: String(row.key),
      companyKey: String(row.company_key),
      displayName: String(row.display_name),
      portalUrl: String(row.portal_url),
      sortOrder: Number(row.sort_order),
      showInResources: Boolean(row.show_in_resources),
    }));
  } catch {
    return ALL_STAR_CARRIER_LINKS.map((row) => ({ ...row }));
  }
}
