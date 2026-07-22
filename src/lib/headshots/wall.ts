/**
 * The one place that decides "does this person need a headshot" and "should
 * this person be behind the wall right now." The login-gate popup and the
 * signup step both ask these, never their own copy.
 */

export type WallPerson = {
  is_builder: boolean;
  is_producer: boolean;
  photo_review_status: string | null;
};

/** Builders and producers must have a headshot. Pure recruits are exempt. */
export function isPhotoRequired(person: {
  is_builder: boolean;
  is_producer: boolean;
}): boolean {
  return person.is_builder || person.is_producer;
}

/**
 * True when the person must be stopped and sent to upload. They are walled when
 * a headshot is required AND they have no photo that counts (nothing uploaded,
 * or their last photo was rejected). Uploading (which sets 'pending') and being
 * 'approved' both clear the wall, so a fresh upload lets them straight back in
 * while their face keeps showing initials until an admin approves it.
 */
export function isBehindHeadshotWall(person: WallPerson): boolean {
  if (!isPhotoRequired(person)) return false;
  return person.photo_review_status !== "pending" && person.photo_review_status !== "approved";
}
