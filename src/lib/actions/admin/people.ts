"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/admin/audit";
import type { Person } from "@/lib/db/types";

const BACK = "/admin/people";

type Guarded =
  | { ok: true; caller: Person; target: Pick<Person, "id" | "is_admin" | "is_super_admin" | "is_owner"> }
  | { ok: false; error: string };

/**
 * Shared gate for every people mutation. The caller must be an admin; admins
 * already see the whole org via can_view, so the target is always loadable.
 * Leadership rows (admin / super-admin / owner) are protected: only a
 * super-admin may touch them, so a CEO/EA can never demote or deactivate a
 * fellow admin or the owner. Self-edits are blocked here regardless.
 */
async function guard(targetPersonId: string): Promise<Guarded> {
  const caller = await requireAdmin();
  if (!targetPersonId) return { ok: false, error: "Missing person." };
  if (targetPersonId === caller.id) {
    return { ok: false, error: "You can't change your own row here." };
  }

  const admin = createServiceRoleClient();
  const { data: target } = await admin
    .from("person")
    .select("id, is_admin, is_super_admin, is_owner")
    .eq("id", targetPersonId)
    .maybeSingle();
  if (!target) return { ok: false, error: "Person not found." };

  const isLeadership =
    target.is_admin || target.is_super_admin || target.is_owner;
  if (isLeadership && !caller.is_super_admin) {
    return { ok: false, error: "Only a super-admin can modify this person." };
  }

  return { ok: true, caller, target };
}

function done(query: string): never {
  revalidatePath(BACK);
  redirect(`${BACK}?${query}`);
}

/** Toggle is_producer / is_builder. Roles are additive: builder implies producer. */
export async function adminSetRoleFlags(formData: FormData) {
  const targetPersonId = String(formData.get("personId") ?? "");
  const role = String(formData.get("role") ?? ""); // "producer" | "builder"
  const next = String(formData.get("next") ?? "") === "true";

  const g = await guard(targetPersonId);
  if (!g.ok) done(`error=${encodeURIComponent(g.error)}`);

  const flags: { is_producer?: boolean; is_builder?: boolean } = {};
  if (role === "producer") {
    flags.is_producer = next;
    // Removing producer can't leave a dangling builder flag.
    if (!next) flags.is_builder = false;
  } else if (role === "builder") {
    flags.is_builder = next;
    if (next) flags.is_producer = true; // builder implies producer
  } else {
    done(`error=${encodeURIComponent("Unknown role.")}`);
  }

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("person")
    .update(flags)
    .eq("id", targetPersonId);
  if (error) done(`error=${encodeURIComponent(error.message)}`);
  await writeAudit({
    actorId: g.caller.id,
    action: `set_role_${role}`,
    targetId: targetPersonId,
    detail: { role, next },
  });
  done("ok=role");
}

/** Activate / deactivate a person (status active | removed). */
export async function adminSetStatus(formData: FormData) {
  const targetPersonId = String(formData.get("personId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "active" && status !== "removed") {
    done(`error=${encodeURIComponent("Invalid status.")}`);
  }

  const g = await guard(targetPersonId);
  if (!g.ok) done(`error=${encodeURIComponent(g.error)}`);

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("person")
    .update({ status })
    .eq("id", targetPersonId);
  if (error) done(`error=${encodeURIComponent(error.message)}`);
  await writeAudit({
    actorId: g.caller.id,
    action: `set_status_${status}`,
    targetId: targetPersonId,
    detail: { status },
  });
  done("ok=status");
}

/** Edit basic profile fields: full_name, email, phone. */
export async function adminUpdateProfile(formData: FormData) {
  const targetPersonId = String(formData.get("personId") ?? "");
  const full_name = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();

  if (!full_name) done(`error=${encodeURIComponent("Name is required.")}`);
  if (!email) done(`error=${encodeURIComponent("Email is required.")}`);

  const g = await guard(targetPersonId);
  if (!g.ok) done(`error=${encodeURIComponent(g.error)}`);

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("person")
    .update({ full_name, email, phone: phoneRaw || null })
    .eq("id", targetPersonId);
  if (error) done(`error=${encodeURIComponent(error.message)}`);
  done("ok=profile");
}
