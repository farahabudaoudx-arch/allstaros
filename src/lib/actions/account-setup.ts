"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { US_STATE_CODES } from "@/lib/us-states";

export type AccountSetupInput = {
  firstName: string;
  lastName: string;
  phone: string;
  state: string;
  password: string;
};

export type AccountSetupResult =
  | { ok: true; next: string }
  | { ok: false; error: string };

/**
 * Completes a recruit's account after they click their invite link. They arrive
 * here already signed in (the invite link created a session via /auth/callback),
 * so we set their password and overwrite the placeholder person/recruit rows
 * with the details they entered. No public sign-up exists — this only ever runs
 * for someone a builder invited.
 */
export async function completeAccountSetup(
  input: AccountSetupInput,
): Promise<AccountSetupResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Your setup link has expired. Ask your upline to invite you again.",
    };
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const phone = input.phone.trim();
  const state = input.state.trim().toUpperCase();
  const { password } = input;

  if (!firstName || !lastName) {
    return { ok: false, error: "Please enter your first and last name." };
  }
  if ((phone.match(/\d/g)?.length ?? 0) < 10) {
    return { ok: false, error: "Please enter a valid phone number." };
  }
  if (!US_STATE_CODES.has(state)) {
    return { ok: false, error: "Please select your state." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const { error: pwErr } = await supabase.auth.updateUser({ password });
  if (pwErr) {
    return { ok: false, error: pwErr.message };
  }

  const fullName = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
  const admin = createServiceRoleClient();

  const { data: person, error: personErr } = await admin
    .from("person")
    .update({ full_name: fullName, phone })
    .eq("auth_user_id", user.id)
    .select("id")
    .maybeSingle();
  if (personErr) {
    return { ok: false, error: personErr.message };
  }

  if (person) {
    const { error: recruitErr } = await admin
      .from("recruit")
      .update({ phone, state })
      .eq("person_id", person.id);
    if (recruitErr) {
      return { ok: false, error: recruitErr.message };
    }
  }

  return { ok: true, next: "/portal" };
}
