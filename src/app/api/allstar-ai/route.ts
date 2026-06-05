import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { askCoach } from "@/lib/kb/coach";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
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

  return NextResponse.json(result);
}
