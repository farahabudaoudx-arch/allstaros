import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import MessageThread from "../_components/message-thread";
import type { Message, Recruit } from "@/lib/db/types";

/**
 * Live recruit↔builder chat. The recruit messages the builder who recruited
 * them; new messages stream in via Supabase Realtime (see MessageThread).
 */
export default async function PortalMessagesPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/portal/messages");
  if (person.is_builder) redirect("/producer");
  if (person.is_producer) redirect("/producer");

  const supabase = await createClient();
  const { data: recruitRow } = await supabase
    .from("recruit")
    .select("*")
    .eq("person_id", person.id)
    .maybeSingle();
  const recruit = recruitRow as Recruit | null;
  if (!recruit) redirect("/onboarding/pending");

  // Resolve the builder's name for the thread header / bubble labels. RLS won't
  // let a recruit read UP the tree, so resolve the name with the service role
  // (same pattern as /welcome) — otherwise it falls back to "Your builder".
  const admin = createServiceRoleClient();
  const { data: builderRow } = await admin
    .from("person")
    .select("full_name")
    .eq("id", recruit.builder_id)
    .maybeSingle();
  const builderName =
    (builderRow as { full_name: string } | null)?.full_name?.trim() || "Your builder";

  const { data: messagesRows } = await supabase
    .from("message")
    .select("*")
    .eq("recruit_id", recruit.id)
    .eq("channel", "builder")
    .order("created_at", { ascending: true });
  const messages = (messagesRows ?? []) as Message[];

  return (
    <main className="mx-auto flex h-full w-full max-w-3xl flex-1 flex-col px-5 py-8 md:px-10 md:py-10">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-accent">
          {"// "}Messages
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-ink md:text-4xl">
          {builderName}
        </h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-subtle">
          Your builder is here to help. Ask questions, share wins, and stay on
          track together.
        </p>
      </div>

      <div className="min-h-0 flex-1">
        <MessageThread
          recruitId={recruit.id}
          currentPersonId={person.id}
          initialMessages={messages}
          otherLabel={builderName}
          placeholder={`Message ${builderName}…`}
        />
      </div>
    </main>
  );
}
