"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { notifyNewClient } from "@/lib/actions/discord";
import type { Client, ClientDraft } from "@/lib/clients/types";

// Invalidate every server-rendered route under /producer/clients so that data
// mutations made from client components (e.g. marking a deposit received)
// don't leave a stale KPI count or filter list when the user navigates back.
export async function revalidateClientsView() {
  revalidatePath("/producer/clients", "layout");
}

// Result shape returned to the browser. The save NEVER throws across the wire —
// it always resolves to one of these so the form can show a controlled message
// instead of a raw transport error.
export type SaveClientResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export type MutateResult =
  | { ok: true }
  | { ok: false; error: string };

// Create OR update a client through OUR server instead of the browser talking
// to Supabase directly. The producer's browser only ever reaches
// app.allstarlifegroup.com (the page they're already on); this server then
// makes the database write. That removes the browser's fragile cross-origin
// dependency on api.allstarlifegroup.com — the source of "Failed to fetch".
//
// Security is unchanged: the server client forwards the logged-in user's
// session from their cookies, so RLS and the auth_person_id() column default
// behave exactly as they did from the browser. person_id is still filled by the
// column default on insert and pinned by RLS on update — never set here.
export async function saveClient(
  draft: ClientDraft,
  clientId?: string,
): Promise<SaveClientResult> {
  const supabase = await createServerSupabase();

  if (clientId) {
    const { error } = await supabase
      .from("clients")
      .update(draft)
      .eq("id", clientId);
    if (error) {
      console.error("[saveClient] update failed", {
        clientId,
        code: error.code,
        message: error.message,
        details: error.details,
      });
      return { ok: false, error: error.message };
    }
    revalidatePath("/producer/clients", "layout");
    return { ok: true, id: clientId };
  }

  const { data, error } = await supabase
    .from("clients")
    .insert(draft)
    .select()
    .single();

  if (error) {
    console.error("[saveClient] insert failed", {
      code: error.code,
      message: error.message,
      details: error.details,
    });
    return { ok: false, error: error.message };
  }

  const savedId = (data as Client).id;

  // Ping the upline's Discord channel on a new signed client (no PII). Never
  // block or fail the save on a notification problem.
  try {
    await notifyNewClient(savedId);
  } catch {
    /* notification is best-effort */
  }

  revalidatePath("/producer/clients", "layout");
  return { ok: true, id: savedId };
}

// Delete a client through the server (same reachability fix as saveClient).
export async function deleteClient(clientId: string): Promise<MutateResult> {
  if (!clientId) return { ok: false, error: "Missing client id" };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("clients").delete().eq("id", clientId);
  if (error) {
    console.error("[deleteClient] failed", {
      clientId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: error.message };
  }
  revalidatePath("/producer/clients", "layout");
  return { ok: true };
}
