"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/site-url";

type CreateRecruitInput = {
  fullName: string;
  email: string;
};

export type CreateRecruitResult =
  | { ok: true; recruitId: string; personId: string }
  | { ok: false; error: string };

/**
 * Builder action: mark interview passed → create the person and recruit rows.
 * - person.upline_id = caller's person id (the builder)
 * - recruit.builder_id = caller's person id
 * - phase = 'licensing' (phase_step is set to 'logged_in' on first sign-in)
 *
 * The login is "issued" simply by creating the person with their email. The
 * recruit will sign in with Google using that email; the callback links the
 * auth user to the person row.
 */
export async function createRecruit(
  input: CreateRecruitInput,
): Promise<CreateRecruitResult> {
  const caller = await getCurrentPerson();
  if (!caller) return { ok: false, error: "Not signed in." };
  if (!caller.is_builder) return { ok: false, error: "Builders only." };

  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  if (!fullName) return { ok: false, error: "Name is required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Valid email is required." };
  }

  const admin = createServiceRoleClient();

  // Prevent duplicate person rows by email.
  const { data: existing } = await admin
    .from("person")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (existing) {
    return { ok: false, error: "A person with that email already exists." };
  }

  const { data: person, error: personErr } = await admin
    .from("person")
    .insert({
      full_name: fullName,
      email,
      upline_id: caller.id,
      is_builder: false,
      is_producer: false,
    })
    .select("id")
    .single();

  if (personErr || !person) {
    return { ok: false, error: personErr?.message ?? "Could not create person." };
  }

  const { data: recruit, error: recruitErr } = await admin
    .from("recruit")
    .insert({
      person_id: person.id,
      builder_id: caller.id,
      phase: "licensing",
    })
    .select("id")
    .single();

  if (recruitErr || !recruit) {
    return {
      ok: false,
      error: recruitErr?.message ?? "Could not create recruit.",
    };
  }

  // Send the Supabase invite email so the recruit gets a one-click sign-in.
  // Non-fatal: if the auth user already exists or the invite fails, the
  // recruit can still sign in via the normal magic-link flow.
  await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${getAppUrl()}/auth/callback?next=/portal`,
  });

  revalidatePath("/dashboard");
  return { ok: true, recruitId: recruit.id, personId: person.id };
}

export async function createRecruitAndRedirect(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "");
  const email = String(formData.get("email") ?? "");
  const result = await createRecruit({ fullName, email });
  if (!result.ok) {
    redirect(`/dashboard/recruits/new?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`/dashboard?created=${result.recruitId}`);
}
