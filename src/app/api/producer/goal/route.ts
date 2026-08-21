import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import { producerLoadErrorResponse } from "@/lib/producer/api-error";

function clampInt(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// GET /api/producer/goal — the producer's standing goal, or null.
export async function GET() {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("producer_goal")
      .select("ap_cents, ip_cents, sales")
      .eq("person_id", person.id)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ ok: true, goal: data });
  } catch (err) {
    return producerLoadErrorResponse(err, {
      route: "/api/producer/goal",
      roleType: person.is_builder ? "builder" : "producer",
    });
  }
}

// POST /api/producer/goal — upsert the producer's standing goal.
export async function POST(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("producer_goal")
      .upsert(
        {
          person_id: person.id,
          ap_cents: clampInt(body.ap_cents),
          ip_cents: clampInt(body.ip_cents),
          sales: clampInt(body.sales),
        },
        { onConflict: "person_id" },
      );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return producerLoadErrorResponse(err, {
      route: "/api/producer/goal",
      roleType: person.is_builder ? "builder" : "producer",
    });
  }
}
