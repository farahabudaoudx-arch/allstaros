"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import type { LeadPurchase } from "@/lib/lead-spend/types";

// Result shapes returned to the browser. These actions never throw across the
// wire; they always resolve to one of these so the form can show a controlled
// message instead of a raw transport error.
export type SaveLeadPurchaseResult =
  | { ok: true; row: LeadPurchase }
  | { ok: false; error: string };

export type MutateResult =
  | { ok: true }
  | { ok: false; error: string };

export type LeadPurchaseDraft = {
  vendor: string;
  amount: number;
  lead_count: number;
  lead_type: string | null;
  purchase_date: string;
};

// Create OR update a lead purchase through OUR server instead of the browser
// talking to Supabase directly. The producer's browser only ever reaches
// app.allstarlifegroup.com (the page they're already on); this server then
// makes the database write. That removes the browser's fragile cross-origin
// dependency on api.allstarlifegroup.com, the source of "Failed to fetch"
// on filtered networks (same fix as the clients page).
//
// Security is unchanged: the server client forwards the logged-in user's
// session from their cookies, so RLS and the auth_person_id() column default
// behave exactly as they did from the browser. person_id is still filled by
// the column default on insert and pinned by RLS on update, never set here.
export async function saveLeadPurchase(
  draft: LeadPurchaseDraft,
  purchaseId?: string,
): Promise<SaveLeadPurchaseResult> {
  const supabase = await createServerSupabase();

  const query = purchaseId
    ? supabase.from("lead_purchases").update(draft).eq("id", purchaseId).select().single()
    : supabase.from("lead_purchases").insert(draft).select().single();

  const { data, error } = await query;
  if (error) {
    console.error("[saveLeadPurchase] failed", {
      purchaseId,
      code: error.code,
      message: error.message,
      details: error.details,
    });
    return { ok: false, error: error.message };
  }

  revalidatePath("/producer/lead-spend");
  return { ok: true, row: data as LeadPurchase };
}

// Delete a lead purchase through the server (same reachability fix as save).
export async function deleteLeadPurchase(purchaseId: string): Promise<MutateResult> {
  if (!purchaseId) return { ok: false, error: "Missing purchase id" };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("lead_purchases").delete().eq("id", purchaseId);
  if (error) {
    console.error("[deleteLeadPurchase] failed", {
      purchaseId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: error.message };
  }
  revalidatePath("/producer/lead-spend");
  return { ok: true };
}
