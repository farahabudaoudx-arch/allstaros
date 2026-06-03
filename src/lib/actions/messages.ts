"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { askAssistant } from "@/lib/ai/assistant";
import type { Recruit } from "@/lib/db/types";

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
