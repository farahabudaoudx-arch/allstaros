"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";

const BACK = "/admin/goals";

function dollarsToCents(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/** Upsert a producer's standing targets (AP/IP in dollars → cents; sales count). */
export async function adminUpsertGoal(formData: FormData) {
  await requireAdmin();
  const personId = String(formData.get("personId") ?? "");
  if (!personId) {
    revalidatePath(BACK);
    redirect(`${BACK}?error=${encodeURIComponent("Missing person.")}`);
  }

  const ap_cents = dollarsToCents(String(formData.get("ap") ?? "0"));
  const ip_cents = dollarsToCents(String(formData.get("ip") ?? "0"));
  const salesNum = Number(String(formData.get("sales") ?? "0"));
  const sales = Number.isFinite(salesNum) && salesNum >= 0 ? Math.round(salesNum) : 0;

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("producer_goal")
    .upsert({ person_id: personId, ap_cents, ip_cents, sales });

  revalidatePath(BACK);
  if (error) redirect(`${BACK}?error=${encodeURIComponent(error.message)}`);
  redirect(`${BACK}?ok=saved`);
}
