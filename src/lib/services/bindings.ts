import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";

export type InstallationServiceKind = "video" | "ai";

export type InstallationServiceBinding = {
  serviceKind: InstallationServiceKind;
  providerKey: string;
  status: "configured" | "missing" | "failed" | "not_required";
  accountRef: string | null;
  configuration: Record<string, unknown>;
  lastCheckedAt: string | null;
};

type BindingRow = {
  service_kind: InstallationServiceKind;
  provider_key: string;
  status: InstallationServiceBinding["status"];
  account_ref: string | null;
  configuration: Record<string, unknown> | null;
  last_checked_at: string | null;
};

/**
 * Customer-local, non-secret provider selection. Missing-table errors are
 * tolerated so the existing All Star installation can keep using its env-based
 * configuration until the Ticket 4 migration is applied.
 */
export async function getInstallationServiceBinding(
  kind: InstallationServiceKind,
): Promise<InstallationServiceBinding | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("installation_service_binding")
    .select("service_kind, provider_key, status, account_ref, configuration, last_checked_at")
    .eq("service_kind", kind)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as BindingRow;
  return {
    serviceKind: row.service_kind,
    providerKey: row.provider_key,
    status: row.status,
    accountRef: row.account_ref,
    configuration: row.configuration ?? {},
    lastCheckedAt: row.last_checked_at,
  };
}
