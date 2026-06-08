"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { PHASES, type Phase } from "@/lib/db/types";

const BACK = "/admin/recruits";

/**
 * Admin recruit override. Unlike the builder RPCs (which require is_builder and
 * enforce forward-only state-machine transitions), these are deliberate admin
 * corrections: any admin can flag/unflag, freely set phase/step, or remove and
 * restore a recruit anywhere in the org. Writes go through the service role.
 */
function done(query: string): never {
  revalidatePath(BACK);
  redirect(`${BACK}?${query}`);
}

async function loadRecruit(recruitId: string) {
  if (!recruitId) return null;
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("recruit")
    .select("id")
    .eq("id", recruitId)
    .maybeSingle();
  return data;
}

export async function adminSetFlag(formData: FormData) {
  await requireAdmin();
  const recruitId = String(formData.get("recruitId") ?? "");
  const flagged = String(formData.get("flagged") ?? "") === "true";
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (!(await loadRecruit(recruitId))) {
    done(`error=${encodeURIComponent("Recruit not found.")}`);
  }

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("recruit")
    .update({ flagged, flag_reason: flagged ? reason : null })
    .eq("id", recruitId);
  if (error) done(`error=${encodeURIComponent(error.message)}`);
  done("ok=flag");
}

export async function adminSetPhase(formData: FormData) {
  await requireAdmin();
  const recruitId = String(formData.get("recruitId") ?? "");
  const phase = String(formData.get("phase") ?? "") as Phase;
  const stepRaw = String(formData.get("phase_step") ?? "").trim();

  if (!PHASES.includes(phase)) {
    done(`error=${encodeURIComponent("Invalid phase.")}`);
  }
  if (!(await loadRecruit(recruitId))) {
    done(`error=${encodeURIComponent("Recruit not found.")}`);
  }

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("recruit")
    .update({ phase, phase_step: stepRaw || null })
    .eq("id", recruitId);
  if (error) done(`error=${encodeURIComponent(error.message)}`);
  done("ok=phase");
}

export async function adminRemoveRecruit(formData: FormData) {
  await requireAdmin();
  const recruitId = String(formData.get("recruitId") ?? "");
  if (!(await loadRecruit(recruitId))) {
    done(`error=${encodeURIComponent("Recruit not found.")}`);
  }

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("recruit")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", recruitId);
  if (error) done(`error=${encodeURIComponent(error.message)}`);
  done("ok=removed");
}

export async function adminRestoreRecruit(formData: FormData) {
  await requireAdmin();
  const recruitId = String(formData.get("recruitId") ?? "");
  if (!(await loadRecruit(recruitId))) {
    done(`error=${encodeURIComponent("Recruit not found.")}`);
  }

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("recruit")
    .update({ removed_at: null })
    .eq("id", recruitId);
  if (error) done(`error=${encodeURIComponent(error.message)}`);
  done("ok=restored");
}
