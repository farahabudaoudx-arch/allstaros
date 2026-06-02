import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendMessageForm } from "@/lib/actions/messages";
import MessageList from "@/app/portal/_components/message-list";
import type { Message, Person, Recruit } from "@/lib/db/types";
import { Card, Textarea, Button } from "@/components/ui";

type RecruitWithPerson = Recruit & {
  person: Pick<Person, "full_name" | "email">;
};

export default async function BuilderMessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
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
    .order("created_at", { ascending: true });
  const messages = (messagesRows ?? []) as Message[];
  const params2 = await searchParams;

  return (
    <div>
      <Link
        href={`/dashboard/recruits/${recruit.id}`}
        className="text-sm text-mute transition hover:text-ink"
      >
        ← Back to {recruit.person.full_name}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
        Thread with {recruit.person.full_name}
      </h1>

      {params2.error ? (
        <div className="mt-4 rounded-xl border border-neg/40 bg-neg/[0.08] px-4 py-3 text-sm text-neg">
          {decodeURIComponent(params2.error)}
        </div>
      ) : null}

      <section className="mt-6">
        <MessageList messages={messages} currentPersonId={me.id} />
      </section>

      <Card className="mt-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.16em] text-mute">
          Reply
        </h2>
        <form action={sendMessageForm} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="recruitId" value={recruit.id} />
          <input
            type="hidden"
            name="returnTo"
            value={`/dashboard/recruits/${recruit.id}/messages`}
          />
          <Textarea name="body" rows={3} required />
          <Button type="submit" variant="primary" className="self-start">
            Send
          </Button>
        </form>
      </Card>
    </div>
  );
}
