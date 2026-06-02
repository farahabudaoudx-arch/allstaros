import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendMessageForm, askAssistantForm } from "@/lib/actions/messages";
import PortalShell, { PortalHeading } from "../_components/portal-shell";
import MessageList from "../_components/message-list";
import { portalFeaturesUnlocked } from "@/lib/portal/access";
import type { Message, Recruit } from "@/lib/db/types";
import { Card, Textarea, Button } from "@/components/ui";

const RETURN_TO = "/portal/help";

export default async function PortalHelpPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/portal/help");
  if (person.is_builder) redirect("/dashboard");
  if (person.is_producer) redirect("/producer");

  const supabase = await createClient();
  const { data: recruitRow } = await supabase
    .from("recruit")
    .select("*")
    .eq("person_id", person.id)
    .maybeSingle();
  const recruit = recruitRow as Recruit | null;
  if (!recruit) redirect("/onboarding/pending");
  if (!portalFeaturesUnlocked(recruit)) redirect("/portal");

  const { data: messagesRows } = await supabase
    .from("message")
    .select("*")
    .eq("recruit_id", recruit.id)
    .order("created_at", { ascending: true });

  const messages = (messagesRows ?? []) as Message[];
  const params = await searchParams;

  return (
    <PortalShell
      heading={
        <PortalHeading
          eyebrow="Get Help"
          title="Stuck on something?"
          subtitle="Ask Casey first — she knows where you are in your journey. Still stuck? Message your builder directly."
        />
      }
    >
      {params.error ? (
        <div className="mb-6 rounded-xl border border-neg/40 bg-neg/[0.08] px-4 py-3 text-sm text-neg">
          {decodeURIComponent(params.error)}
        </div>
      ) : null}

      <MessageList messages={messages} currentPersonId={person.id} />

      <Card className="mt-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.16em] text-mute">
          Ask Casey
        </h2>
        <p className="mt-1 text-xs text-subtle">
          Knows your phase and step. Three sentences max.
        </p>
        <form action={askAssistantForm} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="recruitId" value={recruit.id} />
          <input type="hidden" name="returnTo" value={RETURN_TO} />
          <Textarea
            name="question"
            rows={2}
            required
            placeholder="e.g. What do I do after the exam?"
          />
          <Button type="submit" variant="primary" className="self-start">
            Ask
          </Button>
        </form>
      </Card>

      <Card className="mt-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.16em] text-mute">
          Message your builder
        </h2>
        <form action={sendMessageForm} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="recruitId" value={recruit.id} />
          <input type="hidden" name="returnTo" value={RETURN_TO} />
          <Textarea name="body" rows={2} required />
          <Button type="submit" className="self-start">
            Send
          </Button>
        </form>
      </Card>
    </PortalShell>
  );
}
