// AI conversation logging (PRE_LAUNCH_ROADMAP §1 #9).
//
// Records Sidekick coaching questions + answers for compliance review (catching
// an off-compliance or wrong answer after the fact). The Underwriting Wizard is
// intentionally NOT logged here — its input is client medical notes we choose
// not to store. Writes go to ai_conversation_log via the service role.
//
// Best-effort: a logging failure must never break the chat, so everything is
// wrapped and swallowed (errors surface in server logs / Sentry, not to users).

import { createServiceRoleClient } from "@/lib/supabase/server";

export async function logSidekickConversation(args: {
  personId: string;
  question: string;
  answer: string;
  redirected?: boolean;
}): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    const { error } = await admin.from("ai_conversation_log").insert({
      person_id: args.personId,
      tool: "sidekick",
      question: args.question.slice(0, 8000),
      answer: args.answer.slice(0, 16000),
      redirected: args.redirected ?? false,
    });
    if (error) throw error;
  } catch (err) {
    console.error("[ai/conversation] failed to log (ignored):", err);
  }
}
