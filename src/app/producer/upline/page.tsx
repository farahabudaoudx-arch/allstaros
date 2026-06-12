import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import MessageThread from "@/app/portal/_components/message-thread";
import type { Message, Recruit } from "@/lib/db/types";

/**
 * Producer ↔ upline chat. A producer talks to the builder who recruited them
 * using their own recruit row's "builder" channel — the same realtime thread the
 * recruit portal uses. The upline sees and replies from /producer/messages, and
 * RLS lets both ends read/write because the producer is in the upline's downline.
 */
export default async function ProducerUplineMessagesPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/upline");
  if (!person.is_producer && !person.is_builder) redirect("/portal");

  const supabase = await createClient();
  const { data: recruitRow } = await supabase
    .from("recruit")
    .select("*")
    .eq("person_id", person.id)
    .maybeSingle();
  const recruit = recruitRow as Recruit | null;

  // Resolve the upline's name for the thread header / bubble labels. RLS won't
  // let a producer read UP the tree, so resolve the name with the service role
  // (same pattern as /welcome) — otherwise it falls back to "Your upline".
  let uplineName = "Your upline";
  if (recruit) {
    const admin = createServiceRoleClient();
    const { data: builderRow } = await admin
      .from("person")
      .select("full_name")
      .eq("id", recruit.builder_id)
      .maybeSingle();
    uplineName =
      (builderRow as { full_name: string } | null)?.full_name?.trim() || uplineName;
  }

  let messages: Message[] = [];
  if (recruit) {
    const { data: messagesRows } = await supabase
      .from("message")
      .select("*")
      .eq("recruit_id", recruit.id)
      .eq("channel", "builder")
      .order("created_at", { ascending: true });
    messages = (messagesRows ?? []) as Message[];
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-3xl flex-1 flex-col px-5 py-10 md:px-10 md:py-14">
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
          Producer
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Messages
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-subtle">
          {recruit
            ? `Chat directly with your upline, ${uplineName}.`
            : "Direct line to your upline."}
        </p>
      </div>

      {recruit ? (
        <div className="min-h-0 flex-1">
          <MessageThread
            recruitId={recruit.id}
            currentPersonId={person.id}
            initialMessages={messages}
            otherLabel={uplineName}
            placeholder={`Message ${uplineName}…`}
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-hairline bg-card p-10 text-center text-sm text-mute">
          You don&apos;t have an upline assigned yet. Once you&apos;re placed
          under an upline, your conversation will appear here.
        </div>
      )}
    </main>
  );
}
