import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import MessageThread from "@/app/portal/_components/message-thread";
import type { Message, Person, Recruit } from "@/lib/db/types";

type RecruitWithPerson = Recruit & {
  person: Pick<Person, "full_name" | "email">;
};

export default async function BuilderMessagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getCurrentPerson();
  if (!me) notFound();

  const supabase = await createClient();
  const { data: recruitRow } = await supabase
    .from("recruit")
    .select("*, person:person_id(full_name, email)")
    .eq("id", id)
    .maybeSingle();
  const recruit = recruitRow as unknown as RecruitWithPerson | null;
  if (!recruit) notFound();

  const { data: messagesRows } = await supabase
    .from("message")
    .select("*")
    .eq("recruit_id", recruit.id)
    .eq("channel", "builder")
    .order("created_at", { ascending: true });
  const messages = (messagesRows ?? []) as Message[];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Link
        href={`/dashboard/recruits/${recruit.id}`}
        className="text-sm text-mute transition hover:text-ink"
      >
        ← Back to {recruit.person.full_name}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
        Thread with {recruit.person.full_name}
      </h1>

      <section className="mt-6 min-h-0 flex-1">
        <MessageThread
          recruitId={recruit.id}
          currentPersonId={me.id}
          initialMessages={messages}
          otherLabel={recruit.person.full_name}
          placeholder={`Message ${recruit.person.full_name}…`}
        />
      </section>
    </div>
  );
}
