"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireSuperAdmin } from "@/lib/admin/guard";
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

function done(backPath: string, query: string): never {
  revalidatePath(backPath);
  redirect(`${backPath}?${query}`);
}

function backOf(formData: FormData): string {
  return String(formData.get("back") ?? BACK) || BACK;
}

/** Toggle is_producer / is_builder. Roles are additive: builder implies producer. */
export async function adminSetRoleFlags(formData: FormData) {
  const b = backOf(formData);
  const targetPersonId = String(formData.get("personId") ?? "");
  const role = String(formData.get("role") ?? ""); // "producer" | "builder"
  const next = String(formData.get("next") ?? "") === "true";

  const g = await guard(targetPersonId);
  if (!g.ok) done(b, `error=${encodeURIComponent(g.error)}`);

  const flags: { is_producer?: boolean; is_builder?: boolean } = {};
  if (role === "producer") {
    flags.is_producer = next;
    // Removing producer can't leave a dangling builder flag.
    if (!next) flags.is_builder = false;
  } else if (role === "builder") {
    flags.is_builder = next;
    if (next) flags.is_producer = true; // builder implies producer
  } else {
    done(b, `error=${encodeURIComponent("Unknown role.")}`);
  }

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("person")
    .update(flags)
    .eq("id", targetPersonId);
  if (error) done(b, `error=${encodeURIComponent(error.message)}`);
  await writeAudit({
    actorId: g.caller.id,
    action: `set_role_${role}`,
    targetId: targetPersonId,
    detail: { role, next },
  });
  done(b, "ok=role");
}

/** Activate / deactivate a person (status active | removed). */
export async function adminSetStatus(formData: FormData) {
  const b = backOf(formData);
  const targetPersonId = String(formData.get("personId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "active" && status !== "removed") {
    done(b, `error=${encodeURIComponent("Invalid status.")}`);
  }

  const g = await guard(targetPersonId);
  if (!g.ok) done(b, `error=${encodeURIComponent(g.error)}`);

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("person")
    .update({ status })
    .eq("id", targetPersonId);
  if (error) done(b, `error=${encodeURIComponent(error.message)}`);
  await writeAudit({
    actorId: g.caller.id,
    action: `set_status_${status}`,
    targetId: targetPersonId,
    detail: { status },
  });
  done(b, "ok=status");
}

/** Edit basic profile fields: full_name, email, phone. */
export async function adminUpdateProfile(formData: FormData) {
  const b = backOf(formData);
  const targetPersonId = String(formData.get("personId") ?? "");
  const full_name = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();

  if (!full_name) done(b, `error=${encodeURIComponent("Name is required.")}`);
  if (!email) done(b, `error=${encodeURIComponent("Email is required.")}`);

  const g = await guard(targetPersonId);
  if (!g.ok) done(b, `error=${encodeURIComponent(g.error)}`);

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("person")
    .update({ full_name, email, phone: phoneRaw || null })
    .eq("id", targetPersonId);
  if (error) done(b, `error=${encodeURIComponent(error.message)}`);
  done(b, "ok=profile");
}

/**
 * Permanently delete a person — the reserved super-admin "hard delete".
 *
 * Unlike adminSetStatus (which only flips status to 'removed') or the recruit
 * soft-remove (which sets recruit.removed_at), this erases the person and
 * everything that hangs off them: their recruit record, all sales/client data
 * (via FK cascade), and their auth login. Irreversible. The owner and your own
 * row are protected. Always lands back on the recruits list — the profile page
 * would 404 once the person is gone.
 */
export async function adminDeletePerson(formData: FormData) {
  const dest = "/admin/people/recruits";
  const caller = await requireSuperAdmin();
  const targetPersonId = String(formData.get("personId") ?? "");
  if (!targetPersonId) done(dest, `error=${encodeURIComponent("Missing person.")}`);
  if (targetPersonId === caller.id) {
    done(dest, `error=${encodeURIComponent("You can't delete your own account.")}`);
  }

  const admin = createServiceRoleClient();
  const { data: target } = await admin
    .from("person")
    .select("id, full_name, email, auth_user_id, is_owner")
    .eq("id", targetPersonId)
    .maybeSingle();
  if (!target) done(dest, `error=${encodeURIComponent("Person not found.")}`);
  if (target.is_owner) {
    done(dest, `error=${encodeURIComponent("The owner can't be deleted.")}`);
  }

  // Clear the three on-delete-restrict foreign keys before the person row goes.
  // 1. Anyone who rolls up to them loses their upline (person.upline_id).
  await admin.from("person").update({ upline_id: null }).eq("upline_id", targetPersonId);
  // 2. Their own recruit record, plus any recruit rows where they're the builder
  //    (recruit.person_id / recruit.builder_id).
  await admin.from("recruit").delete().eq("person_id", targetPersonId);
  await admin.from("recruit").delete().eq("builder_id", targetPersonId);
  // 3. The person — sales, clients, deposits, projections, etc. all cascade here.
  const { error } = await admin.from("person").delete().eq("id", targetPersonId);
  if (error) done(dest, `error=${encodeURIComponent(error.message)}`);

  // 4. Their auth login (best-effort — the person row is already gone).
  if (target.auth_user_id) {
    await admin.auth.admin.deleteUser(target.auth_user_id).catch(() => {});
  }

  // targetId stays null: the person row no longer exists, so the audit FK would
  // dangle. The id/name/email live in detail for the trail.
  await writeAudit({
    actorId: caller.id,
    action: "delete_person",
    targetId: null,
    detail: {
      deleted_person_id: targetPersonId,
      full_name: target.full_name,
      email: target.email,
    },
  });
  done(dest, "ok=deleted");
}
