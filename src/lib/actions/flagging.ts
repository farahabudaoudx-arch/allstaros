"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function computeStalls() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("compute_stalls");
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, affected: (data as number) ?? 0 };
}

export async function removeRecruitForm(formData: FormData) {
  const recruitId = String(formData.get("recruitId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!recruitId) redirect("/dashboard");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_recruit", {
    p_recruit: recruitId,
    p_reason: reason,
  });
  if (error) {
    redirect(
      `/dashboard/recruits/${recruitId}?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/flagged");
  revalidatePath(`/dashboard/recruits/${recruitId}`);
  redirect(`/dashboard/recruits/${recruitId}?ok=removed`);
}
