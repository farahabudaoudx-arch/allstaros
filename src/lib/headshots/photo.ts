import type { PhotoReviewStatus } from "./status";

/** The photo fields any person-shaped row needs to carry for display. */
export type PhotoFields = {
  photo_url: string | null;
  photo_review_status: PhotoReviewStatus | string | null;
};

/**
 * The URL to actually show, or null. A photo only shows once an admin has
 * approved it. Pending and rejected photos revert to the initials circle
 * everywhere, so this is the single gate the Avatar is fed from.
 */
export function approvedPhotoUrl(person: PhotoFields): string | null {
  if (!person.photo_url) return null;
  if (person.photo_review_status !== "approved") return null;
  return person.photo_url;
}
