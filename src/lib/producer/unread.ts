import { createClient } from "@/lib/supabase/server";

export type ProducerUnread = {
  /** The person's own thread with their upline (the "Messages" nav item). */
  upline: boolean;
  /** Any downline recruit thread (the builder "Team Messages" nav item). */
  team: boolean;
};

/**
 * Computes whether the producer has unread messages in their own upline thread
 * and/or any of their downline threads. "Unread" = a builder-channel message
 * from someone other than them (and not the AI) that is newer than their last
 * read receipt for that thread. RLS scopes the message read to self + downline,
 * exactly like the Messages pages.
 */
export async function getProducerUnread(personId: string): Promise<ProducerUnread> {
  const supabase = await createClient();

  const [ownRecruitRes, readsRes, incomingRes] = await Promise.all([
    supabase.from("recruit").select("id").eq("person_id", personId).maybeSingle(),
    supabase.from("message_read").select("recruit_id, last_read_at").eq("person_id", personId),
    supabase
      .from("message")
      .select("recruit_id, created_at")
      .eq("channel", "builder")
      .eq("is_ai", false)
      .neq("sender_person_id", personId)
      .order("created_at", { ascending: false }),
  ]);

  const ownRecruitId = (ownRecruitRes.data as { id: string } | null)?.id ?? null;

  const lastRead = new Map<string, string>();
  for (const r of (readsRes.data ?? []) as Array<{ recruit_id: string; last_read_at: string }>) {
    lastRead.set(r.recruit_id, r.last_read_at);
  }

  let upline = false;
  let team = false;
  for (const m of (incomingRes.data ?? []) as Array<{ recruit_id: string; created_at: string }>) {
    const read = lastRead.get(m.recruit_id);
    const isUnread = !read || m.created_at > read;
    if (!isUnread) continue;
    if (m.recruit_id === ownRecruitId) upline = true;
    else team = true;
    if (upline && team) break;
  }

  return { upline, team };
}
