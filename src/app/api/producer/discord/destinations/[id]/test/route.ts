import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDiscordWebhook } from "@/lib/actions/discord";
import { producerLoadErrorResponse } from "@/lib/producer/api-error";
import { PRODUCER_API_ERROR_COPY } from "@/lib/producer/error-copy";

// POST /api/producer/discord/destinations/[id]/test
// Send a test message to an owned destination's webhook. The stored URL never
// leaves the server; only the delivery result comes back.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  if (!person.is_builder && !person.is_admin && !person.is_super_admin)
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { id } = await params;

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("notification_destinations")
      .select("id, owner_person_id, url")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    const row = data as { id: string; owner_person_id: string; url: string } | null;
    if (!row) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    if (row.owner_person_id !== person.id && !person.is_admin && !person.is_super_admin)
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    // Re-check the stored URL before posting anywhere (never an arbitrary host).
    if (!isDiscordWebhook(row.url))
      return NextResponse.json({ ok: false, error: "stored URL is not a Discord webhook" }, { status: 400 });

    let res: Response;
    try {
      res = await fetch(row.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: "Test message from All Star OS",
          allowed_mentions: { parse: [] },
        }),
      });
    } catch {
      return NextResponse.json({ ok: false, error: "could not reach Discord" }, { status: 502 });
    }
    if (!res.ok)
      return NextResponse.json(
        { ok: false, error: `Discord responded ${res.status} ${res.statusText}`.trim() },
        { status: 502 },
      );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return producerLoadErrorResponse(err, {
      route: "/api/producer/discord/destinations/[id]/test",
      queryPhase: "discord",
      clientMessage: PRODUCER_API_ERROR_COPY,
    });
  }
}
