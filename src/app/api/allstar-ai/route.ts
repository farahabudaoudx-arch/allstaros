import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth";
import { askCoach, SIDEKICK_MODEL } from "@/lib/kb/coach";
import { checkAiRateLimit, recordAiUsage } from "@/lib/ai/usage";
import { logSidekickConversation } from "@/lib/ai/conversation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const person = await getCurrentPerson();
  if (!person) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const limit = await checkAiRateLimit(person.id, "sidekick");
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: limit.reason },
      {
        status: 429,
        headers: limit.retryAfterSeconds
          ? { "Retry-After": String(limit.retryAfterSeconds) }
          : undefined,
      },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.message !== "string") {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }

  const message = body.message.slice(0, 4000).trim();
  if (!message) {
    return NextResponse.json({ ok: false, error: "empty message" }, { status: 400 });
  }

  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const history = rawHistory
    .filter(
      (h: unknown): h is { role: "user" | "assistant"; content: string } =>
        !!h &&
        typeof h === "object" &&
        (("role" in h && (h.role === "user" || h.role === "assistant")) as boolean) &&
        "content" in h &&
        typeof (h as { content: unknown }).content === "string",
    )
    .slice(-12)
    .map((h: { role: "user" | "assistant"; content: string }) => ({
      role: h.role,
      content: String(h.content).slice(0, 4000),
    }));

  const result = await askCoach({ question: message, history });
  if (!result.ok) {
    console.error("[api/allstar-ai] failed:", result.error);
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  // Record usage only when a model call actually happened (the underwriting
  // redirect short-circuits with no usage).
  if (result.usage) {
    await recordAiUsage({
      personId: person.id,
      tool: "sidekick",
      model: SIDEKICK_MODEL,
      usage: result.usage,
    });
  }

  // Compliance log (#9): keep a reviewable record of Sidekick Q&A. Covers both
  // real answers and the underwriting-redirect (flagged), neither of which holds
  // client medical data.
  await logSidekickConversation({
    personId: person.id,
    question: message,
    answer: result.answer,
    redirected: result.underwriting === true,
  });

  return NextResponse.json(result);
}
