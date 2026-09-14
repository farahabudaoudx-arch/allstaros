import "server-only";

import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ProvisioningState, WhitelabelProvisioningRun, WhitelabelProvisioningStep } from "./types";

export type ProvisioningAdminView = {
  available: boolean;
  state: ProvisioningState | null;
};

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
      return { available: false, state: null };
    }
    throw new Error("Could not load provisioning state.");
  }
  if (!run) return { available: true, state: null };
  const { data: steps, error: stepsError } = await admin
    .from("whitelabel_provisioning_step")
    .select("*")
    .eq("run_id", run.id)
    .eq("build_id", buildId)
    .order("ordinal", { ascending: true });
  if (stepsError) throw new Error("Could not load provisioning steps.");
  return {
    available: true,
    state: {
      run: run as WhitelabelProvisioningRun,
      steps: (steps ?? []) as WhitelabelProvisioningStep[],
    },
  };
}
