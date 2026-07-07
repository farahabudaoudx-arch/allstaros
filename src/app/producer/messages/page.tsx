import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CheckIn, Message, Person, Recruit } from "@/lib/db/types";
import { MessagesList, type MessageListItem } from "@/components/producer/MessagesList";

type Row = Recruit & { person: Pick<Person, "full_name" | "email" | "status"> };

/**
 * Builder Messages hub. Lists the builder's downline recruits (RLS scopes the
 * recruit query to self + downline) with a preview of the latest message and
 * their most recent check-in, each opening the full two-way thread.
 */
export default async function ProducerMessagesPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/messages");
  if (!person.is_builder) redirect("/producer");

  const supabase = await createClient();
  const { data: recruitData } = await supabase
    .from("recruit")
    .select("*, person:person_id(full_name, email, status)")
    .order("created_at", { ascending: false });
  const rows = (recruitData ?? []) as unknown as Row[];

  const recruitIds = rows.map((r) => r.id);

  // Latest builder-channel message per recruit (one query, group client-side).
  const lastMessage = new Map<string, Message>();
  // Latest check-in date per recruit.
  const lastCheckIn = new Map<string, string>();
  if (recruitIds.length > 0) {
    const [{ data: msgRows }, { data: checkInRows }] = await Promise.all([
      supabase
        .from("message")
        .select("*")
        .in("recruit_id", recruitIds)
        .eq("channel", "builder")
        .order("created_at", { ascending: false }),
      supabase
        .from("check_in")
        .select("recruit_id, check_in_date")
        .in("recruit_id", recruitIds)
        .order("check_in_date", { ascending: false }),
    ]);
    for (const m of (msgRows ?? []) as Message[]) {
      if (!lastMessage.has(m.recruit_id)) lastMessage.set(m.recruit_id, m);
    }
    for (const c of (checkInRows ?? []) as Pick<
      CheckIn,
      "recruit_id" | "check_in_date"
    >[]) {
      if (!lastCheckIn.has(c.recruit_id)) {
        lastCheckIn.set(c.recruit_id, c.check_in_date);
      }
    }
  }

  // Float the most recently active conversations to the top.
  const sorted = [...rows].sort((a, b) => {
    const am = lastMessage.get(a.id)?.created_at ?? "";
    const bm = lastMessage.get(b.id)?.created_at ?? "";
    return bm.localeCompare(am);
  });

  const items: MessageListItem[] = sorted.map((row) => {
    const last = lastMessage.get(row.id);
    return {
      recruitId: row.id,
      name: row.person.full_name,
      searchText: `${row.person.full_name} ${row.person.email}`.toLowerCase(),
      flagged: row.flagged,
      removed: Boolean(row.person.status === "removed" || row.removed_at),
      // "Unread" = the most recent message came from the recruit (not you,
      // not the AI) and is still awaiting your reply.
      unread: Boolean(last && last.sender_person_id !== person.id && !last.is_ai),
      lastBody: last?.body ?? null,
      lastAt: last?.created_at ?? null,
      checkIn: lastCheckIn.get(row.id) ?? null,
    };
  });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
          Builder
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Messages
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-subtle">
          Chat with your downline. Check-ins from your recruits show up here too.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-hairline bg-card p-10 text-center text-sm text-mute">
          No recruits in your downline yet.
        </div>
      ) : (
        <MessagesList items={items} />
      )}
    </main>
  );
}
