"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/admin/audit";

const BACK = "/admin/headshots";

function done(query: string): never {
  revalidatePath(BACK);
  // Also refresh every surface that shows a face, so an approval lights up the
  // person's photo everywhere the moment it lands.
  revalidatePath("/producer/leaderboard");
  redirect(`${BACK}?${query}`);
}

/**
 * The ONLY thing allowed to move a headshot's review status to 'approved' or
 * 'rejected' (uploading is the only other doorway, and it only ever sets
 * 'pending'). Admin-guarded, stamps the reviewer + time for the audit trail,
 * and writes to the shared admin audit log like every other admin action.
 *
 * Approve: photo goes live everywhere (the Avatar only shows approved photos).
 * Reject: person is bounced behind the login wall on their next request and
 * sees the reason; their face reverts to initials until they re-upload.
 */
export async function adminReviewHeadshot(formData: FormData) {
  const caller = await requireAdmin();

  const targetPersonId = String(formData.get("personId") ?? "");
  const decision = String(formData.get("decision") ?? ""); // "approve" | "reject"
  const reason = String(formData.get("reason") ?? "").trim();

  if (!targetPersonId) done(`error=${encodeURIComponent("Missing person.")}`);
  if (decision !== "approve" && decision !== "reject") {
    done(`error=${encodeURIComponent("Unknown decision.")}`);
  }
  if (decision === "reject" && !reason) {
    done(`error=${encodeURIComponent("A rejection needs a reason.")}`);
  }

  const admin = createServiceRoleClient();

  // Guard: the row must actually have a photo to review. Prevents a stale button
  // from approving a person who already cleared their photo.
  const { data: target } = await admin
    .from("person")
    .select("id, photo_url, full_name")
    .eq("id", targetPersonId)
    .maybeSingle();
  if (!target) done(`error=${encodeURIComponent("Person not found.")}`);
  if (!target.photo_url) {
    done(`error=${encodeURIComponent("That person has no photo to review.")}`);
  }

  const stamp = new Date().toISOString();
  const update =
    decision === "approve"
      ? {
          photo_review_status: "approved" as const,
          photo_rejection_reason: null,
          photo_reviewed_by: caller.id,
          photo_reviewed_at: stamp,
        }
      : {
          photo_review_status: "rejected" as const,
          photo_rejection_reason: reason,
          photo_reviewed_by: caller.id,
          photo_reviewed_at: stamp,
        };

  const { error } = await admin
    .from("person")
    .update(update)
    .eq("id", targetPersonId);
  if (error) done(`error=${encodeURIComponent(error.message)}`);

  await writeAudit({
    actorId: caller.id,
    action: decision === "approve" ? "headshot_approved" : "headshot_rejected",
    targetId: targetPersonId,
    detail: decision === "approve" ? {} : { reason },
  });

  done(`ok=${decision === "approve" ? "approved" : "rejected"}`);
}
