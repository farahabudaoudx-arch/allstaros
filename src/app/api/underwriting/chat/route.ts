import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth";
import { searchConditionsByTerms } from "@/lib/underwriting/data";
import {
  addUsage,
  buildRulesContext,
  extractConditions,
  generateChatResponse,
  UNDERWRITING_MODEL,
} from "@/lib/underwriting/llm";
import { checkAiRateLimit, recordAiUsage } from "@/lib/ai/usage";
import type { ChatResponse, Toolkit } from "@/lib/underwriting/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TOOLKITS: ReadonlySet<Toolkit> = new Set(["FEX", "SIUL"]);

export async function POST(req: Request) {
  const person = await getCurrentPerson();
  if (!person) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const limit = await checkAiRateLimit(person.id, "underwriting_chat");
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

  const message: string = body.message.slice(0, 8000).trim();
  if (!message) {
    return NextResponse.json({ ok: false, error: "empty message" }, { status: 400 });
  }

  const toolkit: Toolkit = TOOLKITS.has(body.toolkit) ? body.toolkit : "FEX";

  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const history = rawHistory
    .filter((h: any) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
    .slice(-20)
    .map((h: any) => ({ role: h.role as "user" | "assistant", content: String(h.content).slice(0, 4000) }));

  let extracted;
  try {
    extracted = await extractConditions(message);
  } catch (e: any) {
    console.error("[underwriting/chat] extraction failed:", e);
    return NextResponse.json({ ok: false, error: `extraction: ${e?.message ?? "unknown"}` }, { status: 502 });
  }

  let carrierResults: ChatResponse["carrierResults"] = [];
  if (extracted.conditions.length > 0) {
    carrierResults = searchConditionsByTerms(toolkit, extracted.conditions);
  }

  const rulesContext = carrierResults.length > 0 ? buildRulesContext(carrierResults) : "";

  let chat;
  try {
    chat = await generateChatResponse({
      toolkit,
      rulesContext,
      history,
      userMessage: message,
    });
  } catch (e: any) {
    console.error("[underwriting/chat] chat failed:", e);
    return NextResponse.json({ ok: false, error: `chat: ${e?.message ?? "unknown"}` }, { status: 502 });
  }
  const aiMessage = chat.reply;

  // One request = two Opus calls (extract + generate); record their combined spend.
  await recordAiUsage({
    personId: person.id,
    tool: "underwriting_chat",
    model: UNDERWRITING_MODEL,
    usage: addUsage(extracted.usage, chat.usage),
  });

  const payload: ChatResponse = {
    aiMessage,
    extractedConditions: extracted.conditions,
    timings: extracted.timings,
    severity: extracted.severity,
    medications: extracted.medications,
    carrierResults,
  };
  return NextResponse.json({ ok: true, ...payload });
}
