/**
 * The only three states a headshot's review can be in. Shared by the upload
 * server action, the login wall, and the admin review queue so the spelling
 * never drifts between the back end and the admin screen.
 *
 * This is deliberately separate from a person's *account* status
 * ('active' | 'removed'). A rejected photo must never read as a deactivated
 * account. See the headshot plan's data-model guardrails.
 */
export const PHOTO_REVIEW_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;

export type PhotoReviewStatus = (typeof PHOTO_REVIEW_STATUSES)[number];

/** Type guard: true only for the three valid review states above. */
export function isPhotoReviewStatus(
  value: unknown,
): value is PhotoReviewStatus {
  return (
    typeof value === "string" &&
    (PHOTO_REVIEW_STATUSES as readonly string[]).includes(value)
  );
}
