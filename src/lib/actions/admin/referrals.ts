"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getOrCreateReferralCode } from "@/lib/referral";

const BACK = "/admin/builder-codes";

function done(query: string): never {
  revalidatePath(BACK);
  redirect(`${BACK}?${query}`);
}

/** Generate (or fetch existing) referral code for a builder. */
export async function adminGenerateCode(formData: FormData) {
  await requireAdmin();
  const builderId = String(formData.get("builderId") ?? "");
  if (!builderId) done(`error=${encodeURIComponent("Missing builder.")}`);

  const code = await getOrCreateReferralCode(builderId);
  if (!code) done(`error=${encodeURIComponent("Could not generate a code.")}`);
  done("ok=generated");
}

/** Revoke a builder's referral code (deletes the row; a new one can be minted). */
export async function adminRevokeCode(formData: FormData) {
  await requireAdmin();
  const builderId = String(formData.get("builderId") ?? "");
  if (!builderId) done(`error=${encodeURIComponent("Missing builder.")}`);

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("builder_referral")
    .delete()
    .eq("builder_id", builderId);
  if (error) done(`error=${encodeURIComponent(error.message)}`);
  done("ok=revoked");
}
