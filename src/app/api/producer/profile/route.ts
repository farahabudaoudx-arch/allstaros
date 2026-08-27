import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getOrCreateReferralCode } from "@/lib/referral";
import { producerLoadErrorResponse } from "@/lib/producer/api-error";
import { PRODUCER_API_ERROR_COPY } from "@/lib/producer/error-copy";

// GET /api/producer/profile — the current producer's contact details, used on
// the policy summary PDF.
export async function GET() {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const profile: Record<string, unknown> = {
    full_name: person.full_name ?? "",
    email: person.email ?? "",
    phone: person.phone ?? "",
    // Policy-summary contact override (blank = falls back to the account fields).
    policy_contact_name: person.policy_contact_name ?? "",
    policy_contact_email: person.policy_contact_email ?? "",
    policy_contact_phone: person.policy_contact_phone ?? "",
    is_builder: person.is_builder,
  };

  // Read-only display of who this producer reports to.
  if (person.upline_id) {
    const admin = createServiceRoleClient();
    const { data: upline } = await admin
      .from("person")
      .select("full_name")
      .eq("id", person.upline_id)
      .maybeSingle();
    profile.upline_name = (upline as { full_name?: string } | null)?.full_name ?? "";
  }

  // Builder-only fields + their (read-only) invite code.
  if (person.is_builder) {
    profile.admin_email = person.admin_email ?? "";
    profile.xcel_code = person.xcel_code ?? "";
    profile.discord_webhook_url = person.discord_webhook_url ?? "";
    profile.invite_code = (await getOrCreateReferralCode(person.id)) ?? "";
  }

  return NextResponse.json({ ok: true, profile });
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

  // Build the update from only the fields present in the body, so the profile
  // form and the builder form can each save independently.
  const update: Record<string, unknown> = {};

  if ("full_name" in body) {
    const full_name = String(body.full_name ?? "").trim();
    if (!full_name) return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
    update.full_name = full_name;
  }
  if ("email" in body) {
    const email = String(body.email ?? "").trim();
    if (!email) return NextResponse.json({ ok: false, error: "Email is required" }, { status: 400 });
    update.email = email;
  }
  if ("phone" in body) update.phone = String(body.phone ?? "").trim() || null;

  // Policy-summary contact override. Blank clears it (summary falls back to the
  // account name/email/phone).
  if ("policy_contact_name" in body) update.policy_contact_name = String(body.policy_contact_name ?? "").trim() || null;
  if ("policy_contact_email" in body) update.policy_contact_email = String(body.policy_contact_email ?? "").trim() || null;
  if ("policy_contact_phone" in body) update.policy_contact_phone = String(body.policy_contact_phone ?? "").trim() || null;

  // Builder-only fields. Ignored for non-builders even if sent.
  if (person.is_builder) {
    if ("admin_email" in body) update.admin_email = String(body.admin_email ?? "").trim() || null;
    if ("xcel_code" in body) update.xcel_code = String(body.xcel_code ?? "").trim() || null;
    if ("discord_webhook_url" in body)
      update.discord_webhook_url = String(body.discord_webhook_url ?? "").trim() || null;
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true });

  try {
    const admin = createServiceRoleClient();
    const { error } = await admin.from("person").update(update).eq("id", person.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return producerLoadErrorResponse(err, {
      route: "/api/producer/profile",
      queryPhase: "people",
      clientMessage: PRODUCER_API_ERROR_COPY,
    });
  }
}
