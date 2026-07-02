import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { DISCORD_LEADERBOARD_TZ } from "@/lib/producer/submitted-ap-leaderboard";
import { zonedParts } from "@/lib/producer/time";
import { isLeaderboardExcluded } from "@/lib/producer/leaderboardExclusions";

// Supabase throws PostgrestError objects (not Error instances); surface their
// real message + code instead of a generic "unknown error".
function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as { message?: unknown; code?: unknown };
    if (typeof e.message === "string") {
      return e.code ? `${e.message} (${String(e.code)})` : e.message;
    }
  }
  return "unknown error";
}

// All Discord leaderboards run on Chicago time, so baselines key off the
// current Chicago year.
function currentChicagoYear(): number {
  return zonedParts(new Date(), DISCORD_LEADERBOARD_TZ).y;
}

type BaselineRow = {
  id: string;
  person_id: string;
  submitted_ap_cents: number;
  sales_count: number;
  baseline_through_date: string;
  notes: string | null;
  updated_at: string;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// GET /api/producer/discord/ap-baselines
// Every producer the caller can edit (RLS scopes the roster to self plus
// downline), merged with any manual YTD baseline for the current Chicago year.
export async function GET() {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  if (!person.is_builder && !person.is_admin && !person.is_super_admin)
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  try {
    // Roster via the AUTHED client so RLS clips it to the caller's downline.
    const supabase = await createClient();
    const { data: roster, error: rosterErr } = await supabase
      .from("person")
      .select("id, full_name, is_builder, is_producer, status")
      .eq("status", "active")
      .or("is_producer.eq.true,is_builder.eq.true");
    if (rosterErr) throw rosterErr;
    // Drop internal/test/owner rows so this matches the leaderboards.
    const visible = (roster ?? []).filter((p) => !isLeaderboardExcluded(p.id));

    // Baselines via the service role (the table has no authenticated read policy).
    const year = currentChicagoYear();
    const admin = createServiceRoleClient();
    const baselineByPerson = new Map<string, BaselineRow>();
    for (const part of chunk(visible.map((p) => p.id), 100)) {
      const { data, error } = await admin
        .from("leaderboard_ap_baselines")
        .select("id, person_id, submitted_ap_cents, sales_count, baseline_through_date, notes, updated_at")
        .eq("year", year)
        .in("person_id", part);
      if (error) throw error;
      for (const b of (data ?? []) as BaselineRow[]) baselineByPerson.set(b.person_id, b);
    }

    const rows = visible
      .map((p) => {
        const b = baselineByPerson.get(p.id);
        return {
          person_id: p.id,
          full_name: p.full_name ?? "Unknown",
          baseline: b
            ? {
                id: b.id,
                submitted_ap_cents: b.submitted_ap_cents,
                sales_count: b.sales_count,
                baseline_through_date: b.baseline_through_date,
                notes: b.notes,
                updated_at: b.updated_at,
              }
            : null,
        };
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name));

    return NextResponse.json({ ok: true, year, rows });
  } catch (err) {
    return NextResponse.json({ ok: false, error: errMessage(err) }, { status: 500 });
  }
}

// POST /api/producer/discord/ap-baselines
// Upsert one producer's manual YTD baseline. Body:
// { person_id, year?, baseline_through_date, submitted_ap_dollars, sales_count, notes? }.
export async function POST(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  if (!person.is_builder && !person.is_admin && !person.is_super_admin)
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const personId = String(body.person_id ?? "").trim();
  if (!personId) return NextResponse.json({ ok: false, error: "person_id is required" }, { status: 400 });

  const year = "year" in body ? Number(body.year) : currentChicagoYear();
  if (!Number.isInteger(year) || year < 2000 || year > 2100)
    return NextResponse.json({ ok: false, error: "invalid year" }, { status: 400 });

  const throughDate = String(body.baseline_through_date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(throughDate) || isNaN(new Date(`${throughDate}T12:00:00Z`).getTime()))
    return NextResponse.json(
      { ok: false, error: "baseline_through_date must be a valid YYYY-MM-DD date" },
      { status: 400 },
    );

  const dollars = Number(body.submitted_ap_dollars);
  if (!Number.isFinite(dollars) || dollars < 0)
    return NextResponse.json({ ok: false, error: "submitted_ap_dollars must be 0 or more" }, { status: 400 });
  const cents = Math.round(dollars * 100);

  const salesCount = Number(body.sales_count);
  if (!Number.isInteger(salesCount) || salesCount < 0)
    return NextResponse.json({ ok: false, error: "sales_count must be a whole number, 0 or more" }, { status: 400 });

  const notes = String(body.notes ?? "").trim() || null;

  try {
    // AUTHORIZATION: the target producer must be visible to the caller. RLS on
    // person returns null for anyone outside self plus downline (admins see all).
    const supabase = await createClient();
    const { data: visible, error: visErr } = await supabase
      .from("person")
      .select("id")
      .eq("id", personId)
      .maybeSingle();
    if (visErr) throw visErr;
    if (!visible) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("leaderboard_ap_baselines")
      .upsert(
        {
          person_id: personId,
          year,
          baseline_through_date: throughDate,
          submitted_ap_cents: cents,
          sales_count: salesCount,
          notes,
          entered_by: person.id,
        },
        { onConflict: "person_id,year" },
      )
      .select("id, person_id, year, submitted_ap_cents, sales_count, baseline_through_date, notes, updated_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, baseline: data });
  } catch (err) {
    return NextResponse.json({ ok: false, error: errMessage(err) }, { status: 500 });
  }
}
