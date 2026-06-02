import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function clampInt(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// GET /api/producer/projection?date=YYYY-MM-DD — today's projection, or null.
export async function GET(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const date = new URL(req.url).searchParams.get("date");
  if (!date || !ISO_DATE.test(date)) {
    return NextResponse.json({ ok: false, error: "bad date (expected YYYY-MM-DD)" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("daily_projection")
      .select("dials, contacts, appointments, presentations, sales, ap_cents")
      .eq("person_id", person.id)
      .eq("entry_date", date)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ ok: true, projection: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// POST /api/producer/projection — upsert a day's projected activity + AP.
export async function POST(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const date = body.date;
  if (typeof date !== "string" || !ISO_DATE.test(date)) {
    return NextResponse.json({ ok: false, error: "bad date (expected YYYY-MM-DD)" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("daily_projection")
      .upsert(
        {
          person_id: person.id,
          entry_date: date,
          dials: clampInt(body.dials),
          contacts: clampInt(body.contacts),
          appointments: clampInt(body.appointments),
          presentations: clampInt(body.presentations),
          sales: clampInt(body.sales),
          ap_cents: clampInt(body.ap_cents),
        },
        { onConflict: "person_id,entry_date" },
      );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
