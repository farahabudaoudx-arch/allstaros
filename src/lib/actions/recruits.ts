"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/site-url";
import { sendEmail } from "@/lib/email";
import { welcomeEmail } from "@/lib/emails/welcome";

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

export type InviteRecruitResult = { ok: true } | { ok: false; error: string };

/**
 * Builder action: invite a recruit by email only. The recruit fills in their
 * own name, phone, and state — and sets a password — when they accept the
 * invite at /welcome. There is no public sign-up; this admin-issued invite is
 * the only way an account comes into existence.
 *
 * Creates the person (upline_id = builder, placeholder name until they finish
 * setup) and recruit (phase 'licensing') rows, then mints a one-time setup link
 * with the Supabase admin API and sends our own branded welcome email through
 * Resend. We use generateLink (not inviteUserByEmail) so Supabase does NOT also
 * send its default template — the recruit gets exactly one email.
 */
export async function inviteRecruitByEmail(
  email: string,
): Promise<InviteRecruitResult> {
  const caller = await getCurrentPerson();
  if (!caller) return { ok: false, error: "Not signed in." };
  if (!caller.is_builder) return { ok: false, error: "Builders only." };

  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  const admin = createServiceRoleClient();

  // One account per email. If they already exist, the builder shouldn't be able
  // to silently re-issue access.
  const { data: existing } = await admin
    .from("person")
    .select("id")
    .ilike("email", clean)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error: "Someone with that email has already been invited.",
    };
  }

  // Placeholder name — overwritten when the recruit completes setup at /welcome.
  const placeholderName = clean.split("@")[0];

  const { data: person, error: personErr } = await admin
    .from("person")
    .insert({
      full_name: placeholderName,
      email: clean,
      upline_id: caller.id,
      is_builder: false,
      is_producer: false,
    })
    .select("id")
    .single();
  if (personErr || !person) {
    return { ok: false, error: personErr?.message ?? "Could not create the invite." };
  }

  const { error: recruitErr } = await admin.from("recruit").insert({
    person_id: person.id,
    builder_id: caller.id,
    phase: "licensing",
  });
  if (recruitErr) {
    await admin.from("person").delete().eq("id", person.id);
    return { ok: false, error: recruitErr.message ?? "Could not create the invite." };
  }

  // Mint the one-time setup link (this also creates the auth user) WITHOUT
  // sending Supabase's default email — we send our own branded one below.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "invite",
    email: clean,
    options: { redirectTo: `${getAppUrl()}/auth/callback?next=/welcome` },
  });
  const setupUrl = link?.properties?.action_link;
  if (linkErr || !setupUrl) {
    await admin.from("recruit").delete().eq("person_id", person.id);
    await admin.from("person").delete().eq("id", person.id);
    return {
      ok: false,
      error: linkErr?.message ?? "Could not generate the invite link.",
    };
  }

  const mail = welcomeEmail({ setupUrl });
  const sent = await sendEmail({
    to: clean,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
  if (!sent.ok) {
    // Roll everything back so the invite isn't a ghost the builder can't resend.
    const authUserId = link?.user?.id;
    if (authUserId) {
      await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    }
    await admin.from("recruit").delete().eq("person_id", person.id);
    await admin.from("person").delete().eq("id", person.id);
    return { ok: false, error: `Could not send the invite email: ${sent.error}` };
  }

  revalidatePath("/producer/recruiting");
  return { ok: true };
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
