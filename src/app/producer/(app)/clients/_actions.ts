"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { notifyNewClient } from "@/lib/actions/discord";
import type { Client, ClientDeposit, ClientDraft, DepositStatus } from "@/lib/clients/types";

// Invalidate every server-rendered route under /producer/clients so that data
// mutations made from client components (e.g. marking a deposit received)
// don't leave a stale KPI count or filter list when the user navigates back.
export async function revalidateClientsView() {
  revalidatePath("/producer/clients", "layout");
}

// Result shape returned to the browser. The save NEVER throws across the wire;
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
// dependency on api.allstarlifegroup.com (the source of "Failed to fetch").
//
// Security is unchanged: the server client forwards the logged-in user's
// session from their cookies, so RLS and the auth_person_id() column default
// behave exactly as they did from the browser. person_id is still filled by the
// column default on insert and pinned by RLS on update, never set here.
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

export type GetDepositResult =
  | { ok: true; deposit: ClientDeposit | null }
  | { ok: false; error: string };

export type SaveDepositResult =
  | { ok: true; deposit: ClientDeposit }
  | { ok: false; error: string };

export type SaveDepositInput = {
  // Existing deposit row to update; null/undefined inserts a new one.
  depositId?: string | null;
  status: DepositStatus;
  // Snapshot values computed by the panel at the moment the agent first
  // records a status (see ClientDepositsPanel). Only the insert path stores
  // issue_date/estimated_amount; the update path changes status/actual only.
  issue_date: string;
  estimated_amount: number;
  actual_amount: number | null;
};

// Read the latest deposit for a client through OUR server (same reachability
// fix as saveClient). PGRST116 (no rows) is not an error: it means the client
// has no deposit yet.
export async function getClientDeposit(clientId: string): Promise<GetDepositResult> {
  if (!clientId) return { ok: false, error: "Missing client id" };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("client_deposits")
    .select("*")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    console.error("[getClientDeposit] failed", {
      clientId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: error.message };
  }
  return { ok: true, deposit: (data as ClientDeposit | null) ?? null };
}

// Create or update a client's deposit through the server. Covers the panel's
// three writes: update an existing deposit's status, insert a first deposit,
// and backfill clients.issue_date when a deposit is first marked successful.
export async function saveClientDeposit(
  clientId: string,
  input: SaveDepositInput,
): Promise<SaveDepositResult> {
  if (!clientId) return { ok: false, error: "Missing client id" };
  const supabase = await createServerSupabase();

  let saved: ClientDeposit;
  if (input.depositId) {
    const { data, error } = await supabase
      .from("client_deposits")
      .update({ status: input.status, actual_amount: input.actual_amount })
      .eq("id", input.depositId)
      .select()
      .single();
    if (error) {
      console.error("[saveClientDeposit] update failed", {
        clientId,
        depositId: input.depositId,
        code: error.code,
        message: error.message,
      });
      return { ok: false, error: error.message };
    }
    saved = data as ClientDeposit;
  } else {
    // person_id is filled by the column default (auth_person_id()) and pinned
    // by RLS, so the insert doesn't set it.
    const { data, error } = await supabase
      .from("client_deposits")
      .insert({
        client_id: clientId,
        issue_date: input.issue_date,
        estimated_amount: input.estimated_amount,
        actual_amount: input.actual_amount,
        status: input.status,
      })
      .select()
      .single();
    if (error) {
      console.error("[saveClientDeposit] insert failed", {
        clientId,
        code: error.code,
        message: error.message,
      });
      return { ok: false, error: error.message };
    }
    saved = data as ClientDeposit;
  }

  // Marking Received also promotes the client into IP on the dashboard and
  // analytics. Both of those views key off clients.issue_date, so if the agent
  // never typed one in we fill it from the deposit snapshot here. Best-effort:
  // the deposit itself already saved.
  if (input.status === "successful") {
    const { data: clientRow, error: readError } = await supabase
      .from("clients")
      .select("issue_date")
      .eq("id", clientId)
      .maybeSingle();
    if (readError) {
      console.error("[saveClientDeposit] issue_date read failed", {
        clientId,
        code: readError.code,
        message: readError.message,
      });
    } else if (clientRow && !clientRow.issue_date) {
      const { error: backfillError } = await supabase
        .from("clients")
        .update({ issue_date: input.issue_date })
        .eq("id", clientId);
      if (backfillError) {
        console.error("[saveClientDeposit] issue_date backfill failed", {
          clientId,
          code: backfillError.code,
          message: backfillError.message,
        });
      }
    }
  }

  // Invalidate the router cache for /producer/clients and its deposit views so
  // the KPI counts and filter lists pick up this change on the next nav.
  revalidatePath("/producer/clients", "layout");
  return { ok: true, deposit: saved };
}
