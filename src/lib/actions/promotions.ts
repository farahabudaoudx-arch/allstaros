"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

type RoleFlags = { is_producer?: boolean; is_builder?: boolean };

/**
 * Builder-only: flip a downline member's role flags.
 *
 * We confirm the caller is a builder and can actually SEE the target before
 * touching anything: the read runs through the caller's RLS-scoped client, so
 * `can_view` returns the row only when the target is in their downline. The
 * flag write then goes through the service role because RLS forbids ordinary
 * users from updating other people's `person` rows.
 */
async function setRoleFlags(
  targetPersonId: string,
  flags: RoleFlags,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const caller = await getCurrentPerson();
  if (!caller) return { ok: false, error: "Not signed in." };
  if (!caller.is_builder) return { ok: false, error: "Builders only." };
  if (!targetPersonId) return { ok: false, error: "Missing person." };
  if (targetPersonId === caller.id) {
    return { ok: false, error: "You can't change your own role." };
  }

  const supabase = await createClient();
  const { data: visible } = await supabase
    .from("person")
    .select("id")
    .eq("id", targetPersonId)
    .maybeSingle();
  if (!visible) return { ok: false, error: "Not in your downline." };

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("person")
    .update(flags)
    .eq("id", targetPersonId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Recruit → producer. Sets is_producer, which moves them off the recruit portal
// and onto the producer dashboard on their next load.
export async function promoteToProducerForm(formData: FormData) {
  const personId = String(formData.get("personId") ?? "");
  const recruitId = String(formData.get("recruitId") ?? "");
  const back = `/dashboard/recruits/${recruitId}`;
  const result = await setRoleFlags(personId, { is_producer: true });
  if (!result.ok) {
    redirect(`${back}?error=${encodeURIComponent(result.error)}`);
  }
  revalidatePath(back);
  revalidatePath("/dashboard");
  redirect(`${back}?ok=promoted`);
}

// Producer → builder. Roles are additive, so a builder is always a producer too
// — we set both flags to keep that invariant.
export async function promoteToBuilderForm(formData: FormData) {
  const personId = String(formData.get("personId") ?? "");
  const back = `/producer/team/${personId}`;
  const result = await setRoleFlags(personId, {
    is_builder: true,
    is_producer: true,
  });
  if (!result.ok) {
    redirect(`${back}?error=${encodeURIComponent(result.error)}`);
  }
  revalidatePath(back);
  revalidatePath("/producer/team");
  redirect(`${back}?ok=promoted`);
}
