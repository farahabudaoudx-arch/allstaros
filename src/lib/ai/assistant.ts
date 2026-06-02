import Anthropic from "@anthropic-ai/sdk";
import type { Phase, PhaseStep, Recruit } from "@/lib/db/types";

const MODEL = "claude-haiku-4-5-20251001";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

const SYSTEM_PROMPT = `You are the All Star OS in-portal help assistant for new insurance agents.

You handle routine "where do I go / what's next" questions during the recruiting pipeline. You are a help layer, not a coach. You are not a licensed agent and you cannot give regulatory or compliance advice. If asked about anything outside the pipeline, redirect them to their human builder.

Style: short. Two or three sentences. Confident. Specific. No hedging, no apologies. Use "you" not "the user". If the recruit's question is already answered by their current phase + step, just say what to do next.

Phases and how to talk about them:
- licensing — exam prep. Steps: logged_in (just signed in), exam_scheduled (booked the state exam), studying (on the daily study plan), exam_passed (waiting on builder to confirm).
- onboarding — learning how to actually do the job. Steps: training (working through assignment lessons), roleplay (booked a roleplay with builder), contracting (carrier checklist).
- bootcamp — 28-day shell where they sell. Goal: 8 submitted policies in 28 days. Daily check-in/check-out.
- graduated — they made it. Road to 40k features land in V2.

When in doubt, tell them: "Open a message thread with your builder."`;

export type AssistantContext = {
  recruit: Pick<Recruit, "phase" | "phase_step" | "exam_date" | "bootcamp_started_at">;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  question: string;
};

export async function askAssistant(
  ctx: AssistantContext,
): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error: "ANTHROPIC_API_KEY is not set on the server.",
    };
  }

  const phaseLine = describePhase(ctx.recruit.phase, ctx.recruit.phase_step);
  const datesLine = [
    ctx.recruit.exam_date ? `exam_date=${ctx.recruit.exam_date}` : null,
    ctx.recruit.bootcamp_started_at
      ? `bootcamp_started_at=${ctx.recruit.bootcamp_started_at}`
      : null,
  ]
    .filter(Boolean)
    .join("; ");

  const userContext = `Recruit state: ${phaseLine}${datesLine ? ` (${datesLine})` : ""}.`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: [
        // Long, stable system prompt → cache it.
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: userContext },
      ],
      messages: [
        ...ctx.recentMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user" as const, content: ctx.question },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { ok: true, answer: text || "(empty response)" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

function describePhase(phase: Phase, step: PhaseStep | null): string {
  if (step) return `${phase}/${step}`;
  return phase;
}
