// Shared types + limit for bulk invites. Kept in a plain module (NOT the
// "use server" action file) so both the server action and the client component
// can import them — a "use server" file may only export async functions.

/**
 * What a new person is added as:
 *  - recruit:  no license yet — enters the recruiting pipeline
 *  - producer: already licensed — joins the team, skips the pipeline
 *  - builder:  licensed AND runs their own team — can grow their own downline
 */
export type InviteRole = "recruit" | "producer" | "builder";

/** One person in a bulk invite. */
export type BatchInviteRow = {
  name: string;
  email: string;
  role: InviteRole;
};

/** What happened to one row: sent, or skipped with a human-readable reason. */
export type BatchInviteRowResult = {
  email: string;
  ok: boolean;
  error?: string;
};

export type BatchInviteResult =
  | { ok: true; results: BatchInviteRowResult[] }
  | { ok: false; error: string };

/**
 * Most people you can invite in one batch. Kept well under the email provider's
 * hourly cap so a full batch actually goes through.
 */
export const MAX_BATCH_INVITES = 50;
