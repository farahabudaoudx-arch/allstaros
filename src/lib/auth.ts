import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/db/types";

export type Role = "builder" | "producer" | "recruit";

/**
 * Pick the right home for a signed-in user.
 * Roles are additive: a builder is a producer with extra tools, so they share
 * the producer portal — the builder-only sections (Team, Recruiting, Uplevel)
 * surface there based on is_builder. Pure recruits go to the recruit portal.
 * If a person row doesn't exist yet, send them to onboarding.
 */
export async function resolveLandingPath(
  supabase: SupabaseClient,
  authUserId: string,
): Promise<string> {
  const { data: person } = await supabase
    .from("person")
    .select("id, is_builder, is_producer, is_admin, is_super_admin")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (!person) return "/onboarding/pending";
  // Admins/super-admins still log in to their normal home (builders → producer
  // portal). The /admin area is opt-in: reach it by going to /admin directly,
  // where the guard lets admins in and bounces everyone else back to /producer.
  if (person.is_builder || person.is_producer) return "/producer";
  return "/portal";
}

/**
 * Get the person row for the currently signed-in user, or null.
 * Uses the RLS-scoped client, so it only returns rows the user can see —
 * which for their own row is always allowed via can_view.
 */
export async function getCurrentPerson(): Promise<Person | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("person")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return (data as Person | null) ?? null;
}

/**
 * Link a Supabase auth user to their pre-existing person row by email.
 * Called on every sign-in callback. Idempotent.
 * Uses the service-role client because the auth_user_id field is restricted.
 */
export async function linkPersonByEmail(authUserId: string, email: string) {
  if (!email) return;
  const admin = createServiceRoleClient();

  // Look up by case-insensitive email, only if the row is not yet linked.
  const { data: existing } = await admin
    .from("person")
    .select("id, auth_user_id")
    .ilike("email", email)
    .maybeSingle();

  if (!existing) return; // Builder hasn't pre-registered them yet → handled at /onboarding/pending.
  if (existing.auth_user_id === authUserId) return;
  if (existing.auth_user_id && existing.auth_user_id !== authUserId) return; // Already linked to someone else; never overwrite.

  await admin
    .from("person")
    .update({ auth_user_id: authUserId })
    .eq("id", existing.id);

  // If this person has a recruit row in licensing with no phase_step yet, mark logged_in.
  await admin
    .from("recruit")
    .update({ phase_step: "logged_in" })
    .eq("person_id", existing.id)
    .eq("phase", "licensing")
    .is("phase_step", null);
}
