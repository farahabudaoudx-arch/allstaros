"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

type Guard = { ok: true } | { ok: false; error: string };

// Confirm the caller is a builder acting on their DIRECT downline only (the
// target's upline is the caller). Promote/remove are direct-upline-only powers;
// indirect uplines can view analytics but not manage people below their leg.
async function guardTarget(targetPersonId: string): Promise<Guard> {
  const caller = await getCurrentPerson();
  if (!caller) return { ok: false, error: "Not signed in." };
  if (!caller.is_builder) return { ok: false, error: "Builders only." };
  if (!targetPersonId) return { ok: false, error: "Missing person." };
  if (targetPersonId === caller.id) {
    return { ok: false, error: "You can't do that to yourself." };
  }
  const supabase = await createClient();
  const { data: visible } = await supabase
    .from("person")
    .select("id, upline_id")
    .eq("id", targetPersonId)
    .maybeSingle();
  if (!visible) return { ok: false, error: "Not in your downline." };
  if (visible.upline_id !== caller.id) {
    return { ok: false, error: "Only their direct upline can do that." };
  }
  return { ok: true };
}

/** Remove a producer from the team — marks the person (and any recruit row) removed. */
export async function removeProducerForm(formData: FormData) {
  const personId = String(formData.get("personId") ?? "");
  const back = `/producer/downline/${personId}`;
  const guard = await guardTarget(personId);
  if (!guard.ok) redirect(`${back}?error=${encodeURIComponent(guard.error)}`);

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("person")
    .update({ status: "removed" })
    .eq("id", personId);
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);

  // Keep any recruit record in sync so the pipeline reflects the removal too.
  await admin
    .from("recruit")
    .update({ removed_at: new Date().toISOString() })
    .eq("person_id", personId)
    .is("removed_at", null);

  revalidatePath("/producer/downline");
  redirect("/producer/downline?ok=removed");
}

/** Upgrade a producer to a builder (roles are additive, so set both flags). */
export async function upgradeToBuilderForm(formData: FormData) {
  const personId = String(formData.get("personId") ?? "");
  const back = `/producer/downline/${personId}`;
  const guard = await guardTarget(personId);
  if (!guard.ok) redirect(`${back}?error=${encodeURIComponent(guard.error)}`);

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("person")
    .update({ is_builder: true, is_producer: true })
    .eq("id", personId);
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(back);
  revalidatePath("/producer/downline");
  redirect(`${back}?ok=upgraded`);
}
