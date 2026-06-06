import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";

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

// GET /api/producer/profile — the current producer's contact details, used on
// the policy summary PDF.
export async function GET() {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  return NextResponse.json({
    ok: true,
    profile: {
      full_name: person.full_name ?? "",
      email: person.email ?? "",
      phone: person.phone ?? "",
    },
  });
}

// POST /api/producer/profile — update the current producer's contact details.
// person has no client-side write policy (writes are service-role only), so we
// use the service-role client here, pinned to the authenticated person's id.
export async function POST(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const full_name = String(body.full_name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const phone = String(body.phone ?? "").trim();

  if (!full_name) return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
  if (!email) return NextResponse.json({ ok: false, error: "Email is required" }, { status: 400 });

  try {
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("person")
      .update({ full_name, email, phone: phone || null })
      .eq("id", person.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: errMessage(err) }, { status: 500 });
  }
}
