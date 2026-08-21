import { createClient } from "@/lib/supabase/server";
import { ProducerQueryError } from "@/lib/producer/query-error";

export type ProducerUnread = {
  /** The person's own thread with their upline (the "Messages" nav item). */
  upline: boolean;
  /** Any downline recruit thread (the builder "Team Messages" nav item). */
  team: boolean;
};

/**
 * Whether the producer has unread messages in their upline thread and/or any
 * downline (team) thread. Delegates to `producer_unread_flags()` so we do not
 * transfer the full visible message list — EXISTS stops at the first match.
 *
 * Failures throw (never silently report all-read). Callers that need a soft
 * badge must catch explicitly; menu chrome lets the error surface so Ticket
 * #003's boundary / logs see it.
 */
export async function getProducerUnread(_personId: string): Promise<ProducerUnread> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("producer_unread_flags");
  if (error) throw new ProducerQueryError(error.message, "unread");

  // rpc() may return a one-row array or a single object depending on client version.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw new ProducerQueryError("producer_unread_flags returned no row", "unread");
  }

  const r = row as { upline?: boolean | null; team?: boolean | null };
  return {
    upline: !!r.upline,
    team: !!r.team,
  };
}
