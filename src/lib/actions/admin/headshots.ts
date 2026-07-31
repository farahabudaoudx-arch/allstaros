"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/admin/audit";
import { sendEmail } from "@/lib/email";
import { headshotRejectedEmail } from "@/lib/emails/headshot-rejected";

const BACK = "/admin/headshots";

// Where a rejected person goes to fix it: Settings → Account Details (which holds
// the profile photo). Hardcoded to the production host (like the other email
// templates) so the link is correct no matter where the action runs.
const SETTINGS_PHOTO_URL =
  "https://app.allstarlifegroup.com/producer?settings=account";

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
    .select("id, photo_url, full_name, email")
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
          // The admin's typed message doubles as the reason shown on their wall.
          photo_rejection_reason: reason,
          photo_reviewed_by: caller.id,
          photo_reviewed_at: stamp,
        };

  const { error } = await admin
    .from("person")
    .update(update)
    .eq("id", targetPersonId);
  if (error) done(`error=${encodeURIComponent(error.message)}`);

  // On reject, email the person their fix-it note + a link back to Settings.
  // Best-effort: a mail hiccup must not undo the rejection, but we do flag it so
  // the admin knows to follow up by hand.
  let emailFailed = false;
  if (decision === "reject" && target.email) {
    const { subject, html, text } = headshotRejectedEmail({
      firstName: target.full_name?.trim().split(/\s+/)[0],
      message: reason,
      settingsUrl: SETTINGS_PHOTO_URL,
    });
    const sent = await sendEmail({ to: target.email, subject, html, text });
    emailFailed = !sent.ok;
  }

  await writeAudit({
    actorId: caller.id,
    action: decision === "approve" ? "headshot_approved" : "headshot_rejected",
    targetId: targetPersonId,
    detail: decision === "approve" ? {} : { reason, emailFailed },
  });

  if (decision === "approve") done(`ok=approved`);
  done(emailFailed ? `ok=rejected&warn=email` : `ok=rejected`);
}

/**
 * Approve many headshots in one shot. This is the fast path for clearing the
 * queue: the admin ticks a batch on the pending screen and submits once, so
 * it's a single write and a single page refresh instead of one per photo.
 * Same guardrails as the single approve — admin-only, only touches rows that
 * actually have a photo, stamps the reviewer, and writes one audit row.
 */
export async function adminBulkApproveHeadshots(formData: FormData) {
  const caller = await requireAdmin();

  const ids = formData
    .getAll("personId")
    .map((v) => String(v))
    .filter(Boolean);
  if (ids.length === 0) done(`error=${encodeURIComponent("Nothing selected.")}`);

  const admin = createServiceRoleClient();
  const stamp = new Date().toISOString();

  const { data: updated, error } = await admin
    .from("person")
    .update({
      photo_review_status: "approved",
      photo_rejection_reason: null,
      photo_reviewed_by: caller.id,
      photo_reviewed_at: stamp,
    })
    .in("id", ids)
    .not("photo_url", "is", null)
    .select("id");
  if (error) done(`error=${encodeURIComponent(error.message)}`);

  const count = updated?.length ?? 0;
  await writeAudit({
    actorId: caller.id,
    action: "headshot_bulk_approved",
    targetId: null,
    detail: { count, ids },
  });

  done(`ok=approved&n=${count}`);
}
