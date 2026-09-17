import "server-only";

import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isWhitelabelLocalPilot } from "@/lib/local-pilot";
import type { ProvisioningState, WhitelabelProvisioningRun, WhitelabelProvisioningStep } from "./types";

export type ProvisioningAdminView = {
  available: boolean;
  state: ProvisioningState | null;
  localInitialAdminSetupUrl: string | null;
};

function canonicalizeSetupUrl(raw: string, domain: string): string | null {
  try {
    const source = new URL(raw);
    const target = new URL(`https://${domain.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}`);
    target.pathname = source.pathname;
    target.search = source.search;
    target.hash = source.hash;
    return target.toString();
  } catch {
    return null;
  }
}

export async function loadProvisioningForAdmin(buildId: string): Promise<ProvisioningAdminView> {
  await requireAdmin(`/admin/os-builds/${buildId}`);
  const admin = createServiceRoleClient();
  const { data: run, error } = await admin
    .from("whitelabel_provisioning_run")
    .select("*")
    .eq("build_id", buildId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01" || /whitelabel_provisioning_run/i.test(error.message ?? "")) {
      return { available: false, state: null, localInitialAdminSetupUrl: null };
    }
    throw new Error("Could not load provisioning state.");
  }
  if (!run) return { available: true, state: null, localInitialAdminSetupUrl: null };
  const { data: steps, error: stepsError } = await admin
    .from("whitelabel_provisioning_step")
    .select("*")
    .eq("run_id", run.id)
    .eq("build_id", buildId)
    .order("ordinal", { ascending: true });
  if (stepsError) throw new Error("Could not load provisioning steps.");
  let localInitialAdminSetupUrl: string | null = null;
  if (run.status === "succeeded" && isWhitelabelLocalPilot()) {
    const [secretResult, buildResult] = await Promise.all([
      admin.rpc("get_whitelabel_generated_secret", {
        p_build_id: buildId,
        p_secret_kind: "initial_admin_invite_url",
      }),
      admin.from("whitelabel_build").select("domain").eq("id", buildId).maybeSingle(),
    ]);
    if (!secretResult.error && typeof secretResult.data === "string" && buildResult.data?.domain) {
      localInitialAdminSetupUrl = canonicalizeSetupUrl(secretResult.data, String(buildResult.data.domain));
    }
  }

  return {
    available: true,
    state: {
      run: run as WhitelabelProvisioningRun,
      steps: (steps ?? []) as WhitelabelProvisioningStep[],
    },
    localInitialAdminSetupUrl,
  };
}
