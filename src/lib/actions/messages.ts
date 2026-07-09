"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { askAssistant } from "@/lib/ai/assistant";
import type { Message, Recruit } from "@/lib/db/types";

/**
 * A thread belongs to the recruit and their CURRENT direct upline, read live
 * off person.upline_id. recruit.builder_id is the original-inviter stamp and
 * goes stale when a team is rewired, so it is deliberately not consulted.
 * Indirect uplines can read a thread (RLS allows the whole subtree) but may
 * not post. Returns null when RLS hides the recruit from this caller.
 */
async function canPostToThread(
  supabase: Awaited<ReturnType<typeof createClient>>,
  personId: string,
  recruitId: string,
): Promise<{ found: boolean; allowed: boolean }> {
  const { data } = await supabase
    .from("recruit")
    .select("person_id, person:person_id(upline_id)")
    .eq("id", recruitId)
    .maybeSingle();
  if (!data) return { found: false, allowed: false };
  const r = data as unknown as {
    person_id: string;
    person: { upline_id: string | null } | null;
  };
  return {
    found: true,
    allowed: personId === r.person_id || personId === (r.person?.upline_id ?? null),
  };
}

export async function sendMessageForm(formData: FormData) {
  const recruitId = String(formData.get("recruitId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "/portal");
  if (!recruitId || !body) {
    redirect(`${returnTo}?error=empty-message`);
  }

  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin");

  const supabase = await createClient();

  const access = await canPostToThread(supabase, person.id, recruitId);
  if (!access.found) redirect(`${returnTo}?error=recruit-not-found`);
  if (!access.allowed) {
    redirect(`${returnTo}?error=not-allowed`);
  }

  const { error } = await supabase.from("message").insert({
    recruit_id: recruitId,
    sender_person_id: person.id,
    body,
    is_ai: false,
    channel: "builder",
  });
  if (error) redirect(`${returnTo}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=sent`);
}

/**
 * Structured-result sibling of sendMessageForm: same authorization and insert,
 * but returns the inserted row instead of redirecting. Used by MessageThread
 * so chat sends go through the server (browser-direct Supabase calls fail on
 * filtered networks).
 */
export async function sendMessage(
  recruitId: string,
  body: string,
): Promise<{ ok: true; message: Message } | { ok: false; error: string }> {
  const text = body.trim();
  if (!recruitId || !text) {
    return { ok: false, error: "Message is empty." };
  }

  const person = await getCurrentPerson();
  if (!person) return { ok: false, error: "Not signed in." };

  const supabase = await createClient();

  const access = await canPostToThread(supabase, person.id, recruitId);
  if (!access.found) return { ok: false, error: "Recruit not found." };
  if (!access.allowed) {
    return {
      ok: false,
      error: "Only this person's direct upline can message them.",
    };
  }

  const { data, error } = await supabase
    .from("message")
    .insert({
      recruit_id: recruitId,
      sender_person_id: person.id,
      body: text,
      is_ai: false,
      channel: "builder",
    })
    .select()
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert failed." };
  }

  return { ok: true, message: data as Message };
}

/**
 * Polling fallback for MessageThread when the Realtime websocket can't connect
 * (filtered networks block the Supabase host). Returns builder-channel messages
 * for a thread newer than sinceIso (or the whole thread when sinceIso is null),
 * oldest first. Reads are scoped by RLS (can_view_recruit), so a signed-in
 * check is the only authorization needed here.
 */
export async function fetchMessagesSince(
  recruitId: string,
  sinceIso: string | null,
): Promise<{ ok: true; messages: Message[] } | { ok: false; error: string }> {
  if (!recruitId) return { ok: false, error: "Missing recruit id." };

  const person = await getCurrentPerson();
  if (!person) return { ok: false, error: "Not signed in." };

  const supabase = await createClient();
  let query = supabase
    .from("message")
    .select("*")
    .eq("recruit_id", recruitId)
    .eq("channel", "builder")
    .order("created_at", { ascending: true });
  if (sinceIso) query = query.gt("created_at", sinceIso);

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };

  return { ok: true, messages: (data ?? []) as Message[] };
}

/**
 * Stamp the current person's read receipt for a thread to now(). Called when
 * they open a thread (MessageThread mount + on each new message while viewing),
 * so the unread dot clears only once every message has been seen.
 */
export async function markThreadRead(recruitId: string) {
  if (!recruitId) return;
  const person = await getCurrentPerson();
  if (!person) return;
  const supabase = await createClient();
  await supabase.from("message_read").upsert(
    {
      person_id: person.id,
      recruit_id: recruitId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "person_id,recruit_id" },
  );
  // The nav unread dots are computed in the producer/portal layouts (persistent
  // server components). Revalidate them so the dot clears right after reading,
  // instead of lingering until a full page reload.
  revalidatePath("/producer", "layout");
  revalidatePath("/portal", "layout");
}

export async function askAssistantForm(formData: FormData) {
  const recruitId = String(formData.get("recruitId") ?? "");
  const question = String(formData.get("question") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "/portal/help");
  if (!recruitId || !question) {
    redirect(`${returnTo}?error=empty-question`);
  }

  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin");

  const supabase = await createClient();
  const { data: recruitRow } = await supabase
    .from("recruit")
    .select("*")
    .eq("id", recruitId)
    .maybeSingle();
  const recruit = recruitRow as Recruit | null;
  if (!recruit) redirect(`${returnTo}?error=recruit-not-found`);

  // Load last 6 message turns for short-term context.
  const { data: recent } = await supabase
    .from("message")
    .select("body, is_ai, sender_person_id")
    .eq("recruit_id", recruitId)
    .eq("channel", "assistant")
    .order("created_at", { ascending: false })
    .limit(6);

  const recentMessages = ((recent ?? []) as Array<{
    body: string;
    is_ai: boolean;
    sender_person_id: string | null;
  }>)
    .reverse()
    .map((m) => ({
      role: m.is_ai ? ("assistant" as const) : ("user" as const),
      content: m.body,
    }));

  // Post the recruit's question as a normal message first.
  await supabase.from("message").insert({
    recruit_id: recruitId,
    sender_person_id: person.id,
    body: question,
    is_ai: false,
    channel: "assistant",
  });

  const result = await askAssistant({
    recruit: {
      phase: recruit!.phase,
      phase_step: recruit!.phase_step,
      exam_date: recruit!.exam_date,
      bootcamp_started_at: recruit!.bootcamp_started_at,
    },
    recentMessages,
    question,
  });

  // AI message must be inserted with service role (RLS blocks is_ai=true otherwise).
  const admin = createServiceRoleClient();
  await admin.from("message").insert({
    recruit_id: recruitId,
    sender_person_id: null,
    body: result.ok ? result.answer : `(assistant error: ${result.error})`,
    is_ai: true,
    channel: "assistant",
  });

  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=assistant`);
}
