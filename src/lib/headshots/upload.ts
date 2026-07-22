/**
 * Shared upload rules for headshots. Imported by the upload server action (the
 * one doorway that writes a new photo) so the storage location and the accepted
 * file rules live in exactly one place.
 */

/** The public storage bucket created in 20260722000100_person_headshot.sql. */
export const HEADSHOT_BUCKET = "headshots";

/**
 * Uploads are re-encoded to a small square JPEG in the browser before they are
 * sent, so this cap only needs to stop obviously-wrong files, not size real
 * photos. 5 MB is comfortably above a 512px JPEG.
 */
export const MAX_HEADSHOT_BYTES = 5 * 1024 * 1024;

export const ALLOWED_HEADSHOT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** Object key within the bucket. One image per person, overwritten on replace. */
export function headshotObjectKey(personId: string): string {
  return `${personId}.jpg`;
}

/** Bucket-qualified path, for building the public URL. */
export function headshotStoragePath(personId: string): string {
  return `${HEADSHOT_BUCKET}/${headshotObjectKey(personId)}`;
}

export type UploadCheck = { ok: true } | { ok: false; error: string };

/** Server-side guard mirroring the browser checks. */
export function validateHeadshotUpload(file: { type: string; size: number }): UploadCheck {
  if (!ALLOWED_HEADSHOT_TYPES.has(file.type)) {
    return { ok: false, error: "Please choose an image file (JPG, PNG, or WebP)." };
  }
  if (file.size <= 0) {
    return { ok: false, error: "That file looks empty. Please choose a photo." };
  }
  if (file.size > MAX_HEADSHOT_BYTES) {
    return { ok: false, error: "That image is too large. Please choose a smaller photo." };
  }
  return { ok: true };
}
