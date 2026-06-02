import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

// 10-char base36 code, no ambiguous separators. Matches the backfill in
// migration 20260601000700_recruit_signup.sql closely enough; uniqueness is
// enforced by the unique index, and we retry on collision.
function generateCode(): string {
  let out = "";
  while (out.length < 10) {
    out += Math.random().toString(36).slice(2);
  }
  return out.slice(0, 10);
}

/**
 * Returns the builder's referral code, creating one if they don't have it yet
 * (e.g. a builder promoted after the backfill migration ran). Service-role.
 */
export async function getOrCreateReferralCode(
  builderId: string,
): Promise<string | null> {
  const admin = createServiceRoleClient();

  const { data: existing } = await admin
    .from("builder_referral")
    .select("code")
    .eq("builder_id", builderId)
    .maybeSingle();
  if (existing?.code) return existing.code;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { error } = await admin
      .from("builder_referral")
      .insert({ builder_id: builderId, code });
    if (!error) return code;
    // 23505 = unique_violation: builder row appeared (race) or code clash.
    const { data: again } = await admin
      .from("builder_referral")
      .select("code")
      .eq("builder_id", builderId)
      .maybeSingle();
    if (again?.code) return again.code;
  }
  return null;
}

/**
 * Resolve a public referral code to the builder it belongs to. Returns null if
 * the code is unknown or the owner is no longer a builder. Service-role so it
 * works on the unauthenticated /join page.
 */
export async function resolveBuilderByCode(
  code: string,
): Promise<{ id: string; full_name: string } | null> {
  const clean = code.trim();
  if (!clean) return null;

  const admin = createServiceRoleClient();
  const { data: ref } = await admin
    .from("builder_referral")
    .select("builder_id")
    .eq("code", clean)
    .maybeSingle();
  if (!ref) return null;

  const { data: person } = await admin
    .from("person")
    .select("id, full_name, is_builder, status")
    .eq("id", ref.builder_id)
    .maybeSingle();
  if (!person || !person.is_builder || person.status !== "active") return null;

  return { id: person.id, full_name: person.full_name };
}
