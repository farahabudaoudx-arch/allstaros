import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPerson } from "@/lib/auth";
import { producerLoadErrorResponse } from "@/lib/producer/api-error";
import { PRODUCER_API_ERROR_COPY } from "@/lib/producer/error-copy";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function clampInt(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// GET /api/producer/tracker?date=YYYY-MM-DD — prefill the Add Data modal.
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
      .from("tracker_entry")
      .select("dials, contacts, appointments, presentations, sales, leads")
      .eq("person_id", person.id)
      .eq("entry_date", date)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ ok: true, entry: data });
  } catch (err) {
    return producerLoadErrorResponse(err, {
      route: "/api/producer/tracker",
      queryPhase: "tracker",
      clientMessage: PRODUCER_API_ERROR_COPY,
    });
  }
}

// POST /api/producer/tracker — upsert a day's manual activity counts.
// NOTE: `sales` is intentionally NOT written here. Policies sold are driven
// solely by the Clients book (see the clients_sync_tracker DB trigger), so the
// tracker only owns the activity counters a producer taps in by hand.
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
      .from("tracker_entry")
      .upsert(
        {
          person_id: person.id,
          entry_date: date,
          dials: clampInt(body.dials),
          contacts: clampInt(body.contacts),
          appointments: clampInt(body.appointments),
          presentations: clampInt(body.presentations),
          leads: clampInt(body.leads),
        },
        { onConflict: "person_id,entry_date" },
      );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return producerLoadErrorResponse(err, {
      route: "/api/producer/tracker",
      queryPhase: "tracker",
      clientMessage: PRODUCER_API_ERROR_COPY,
    });
  }
}
