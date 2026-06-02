"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveBuilderByCode } from "@/lib/referral";
import { US_STATE_CODES } from "@/lib/us-states";

export type SignUpInput = {
  code: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
};

export type SignUpResult = { ok: true } | { ok: false; error: string };

/**
 * Public recruit signup via a builder's referral link. No authenticated caller:
 * the referral code identifies the sponsoring builder. Creates the person
 * (upline_id = builder) and recruit (builder_id = builder, phase 'licensing')
 * rows, then sends a Supabase magic-link invite so the recruit can sign in.
 */
export async function signUpViaReferral(
  input: SignUpInput,
): Promise<SignUpResult> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const state = input.state.trim().toUpperCase();

  if (!firstName || !lastName) return { ok: false, error: "Please enter your first and last name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  // Strip formatting and require at least 10 digits.
  if ((phone.match(/\d/g)?.length ?? 0) < 10) {
    return { ok: false, error: "Please enter a valid phone number." };
  }
  if (!US_STATE_CODES.has(state)) {
    return { ok: false, error: "Please select your state." };
  }

  const builder = await resolveBuilderByCode(input.code);
  if (!builder) return { ok: false, error: "This signup link is no longer valid." };

  const admin = createServiceRoleClient();

  // Prevent duplicate person rows by email.
  const { data: existing } = await admin
    .from("person")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error: "An account with that email already exists. Try signing in instead.",
    };
  }

  const fullName = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();

  const { data: person, error: personErr } = await admin
    .from("person")
    .insert({
      full_name: fullName,
      email,
      upline_id: builder.id,
      is_builder: false,
      is_producer: false,
    })
    .select("id")
    .single();

  if (personErr || !person) {
    return { ok: false, error: personErr?.message ?? "Could not create your account." };
  }

  const { error: recruitErr } = await admin.from("recruit").insert({
    person_id: person.id,
    builder_id: builder.id,
    phase: "licensing",
    phone,
    state,
  });

  if (recruitErr) {
    // Roll back the orphaned person row so a retry can succeed.
    await admin.from("person").delete().eq("id", person.id);
    return { ok: false, error: recruitErr.message ?? "Could not create your account." };
  }

  // Send the Supabase invite email so the recruit gets a one-click sign-in.
  // Non-fatal: the recruit can still sign in via the normal magic-link flow.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/auth/callback?next=/portal`,
  });

  return { ok: true };
}
