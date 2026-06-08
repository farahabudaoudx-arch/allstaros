"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/admin/audit";

const BACK = "/admin/minting";

function done(query: string): never {
  revalidatePath(BACK);
  redirect(`${BACK}?${query}`);
}

/**
 * Grant or revoke a privilege flag. Reserved to super-admins (requireSuperAdmin),
 * so a plain admin (CEO/EA) can never reach this path — the core anti-escalation
 * guard. We additionally block acting on your own row to avoid accidental
 * self-lockout, and never expose is_super_admin here (set manually in the DB).
 */
async function setFlag(
  formData: FormData,
  column: "is_admin" | "is_owner",
) {
  const caller = await requireSuperAdmin();
  const targetPersonId = String(formData.get("personId") ?? "");
  const next = String(formData.get("next") ?? "") === "true";

  if (!targetPersonId) done(`error=${encodeURIComponent("Missing person.")}`);
  if (targetPersonId === caller.id) {
    done(`error=${encodeURIComponent("You can't change your own privileges here.")}`);
  }

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("person")
    .update({ [column]: next })
    .eq("id", targetPersonId);
  if (error) done(`error=${encodeURIComponent(error.message)}`);

  await writeAudit({
    actorId: caller.id,
    action: `${next ? "grant" : "revoke"}_${column}`,
    targetId: targetPersonId,
    detail: { column, value: next },
  });
  done("ok=minted");
}

export async function adminSetAdminFlag(formData: FormData) {
  await setFlag(formData, "is_admin");
}

export async function adminSetOwnerFlag(formData: FormData) {
  await setFlag(formData, "is_owner");
}
