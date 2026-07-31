import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import MessageThread from "@/app/portal/_components/message-thread";
import type { CheckIn, Message, Person, Recruit } from "@/lib/db/types";

type RecruitWithPerson = Recruit & {
  person: Pick<Person, "full_name" | "email" | "upline_id">;
};

/**
 * Builder ↔ recruit thread, inside the producer area. Reuses the same realtime
 * MessageThread the recruit uses, so messages flow both ways. RLS guarantees the
 * builder can only open threads for recruits in their downline; only the
 * recruit's CURRENT direct upline (person.upline_id) may post, everyone else
 * up the chain gets a read-only view.
 */
export default async function ProducerThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getCurrentPerson();
  if (!me) redirect("/auth/signin?next=/producer/messages");
  if (!me.is_builder) redirect("/producer");

  const supabase = await createClient();
  const { data: recruitRow } = await supabase
    .from("recruit")
    .select("*, person:person_id(full_name, email, upline_id)")
    .eq("id", id)
    .maybeSingle();
  const recruit = recruitRow as unknown as RecruitWithPerson | null;
  if (!recruit) notFound();

  const canPost = recruit.person.upline_id === me.id;

  const [{ data: messagesRows }, { data: checkInRows }] = await Promise.all([
    supabase
      .from("message")
      .select("*")
      .eq("recruit_id", recruit.id)
      .eq("channel", "builder")
      .order("created_at", { ascending: true }),
    supabase
      .from("check_in")
      .select("*")
      .eq("recruit_id", recruit.id)
      .order("check_in_date", { ascending: false })
      .limit(1),
  ]);
  const messages = (messagesRows ?? []) as Message[];
  const latestCheckIn = ((checkInRows ?? []) as CheckIn[])[0] ?? null;

  return (
    <main className="mx-auto flex h-full w-full max-w-3xl flex-1 flex-col px-5 py-8 md:px-10 md:py-10">
      <Link
        href="/producer/messages"
        className="text-sm text-mute transition hover:text-ink"
      >
        ← All messages
      </Link>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
            {recruit.person.full_name}
          </h1>
        </div>
        {latestCheckIn ? (
          <span className="shrink-0 text-sm text-mute">
            Last check-in {latestCheckIn.check_in_date}
          </span>
        ) : null}
      </div>

      <div className="mt-6 min-h-0 flex-1">
        <MessageThread
          recruitId={recruit.id}
          currentPersonId={me.id}
          initialMessages={messages}
          otherLabel={recruit.person.full_name}
          placeholder={`Message ${recruit.person.full_name}…`}
          readOnlyNote={
            canPost
              ? null
              : `Only ${recruit.person.full_name}'s direct upline can send messages here. You can read the thread.`
          }
        />
      </div>
    </main>
  );
}
