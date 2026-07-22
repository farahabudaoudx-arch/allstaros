"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPerson } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { publicStorageUrl } from "@/lib/storage-url";
import {
  HEADSHOT_BUCKET,
  headshotObjectKey,
  headshotStoragePath,
  validateHeadshotUpload,
} from "@/lib/headshots/upload";

export type UploadHeadshotResult = { ok: true; photoUrl: string } | { ok: false; error: string };

/**
 * The ONE doorway for a person setting their own headshot. Every upload resets
 * review state to 'pending' and clears any prior rejection reason, so a fresh
 * photo always goes back into the admin queue (guardrail: no screen pokes the
 * status field directly, and only the admin review action moves it to approved
 * or rejected).
 *
 * Writes with the service role but strictly against the caller's own person id
 * (resolved from the session), so a person can only ever change their own photo.
 */
export async function uploadHeadshot(formData: FormData): Promise<UploadHeadshotResult> {
  const person = await getCurrentPerson();
  if (!person) return { ok: false, error: "You need to be signed in to upload a photo." };

  const file = formData.get("photo");
  if (!(file instanceof File)) {
    return { ok: false, error: "No photo was received. Please try again." };
  }

  const check = validateHeadshotUpload({ type: file.type, size: file.size });
  if (!check.ok) return check;

  const bytes = new Uint8Array(await file.arrayBuffer());

  const supabase = createServiceRoleClient();

  const { error: uploadError } = await supabase.storage
    .from(HEADSHOT_BUCKET)
    .upload(headshotObjectKey(person.id), bytes, {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (uploadError) {
    return { ok: false, error: "We could not save that photo. Please try again." };
  }

  // Cache-bust so a replaced photo shows immediately instead of the old cached
  // image (the object key is stable per person).
  const stamp = new Date().toISOString();
  const photoUrl = `${publicStorageUrl(headshotStoragePath(person.id))}?v=${Date.parse(stamp)}`;

  const { error: updateError } = await supabase
    .from("person")
    .update({
      photo_url: photoUrl,
      photo_review_status: "pending",
      photo_rejection_reason: null,
      photo_updated_at: stamp,
    })
    .eq("id", person.id);
  if (updateError) {
    return { ok: false, error: "Your photo saved but we could not update your profile. Please try again." };
  }

  revalidatePath("/producer/headshot");
  revalidatePath("/producer/settings");
  revalidatePath("/producer/leaderboard");

  return { ok: true, photoUrl };
}
