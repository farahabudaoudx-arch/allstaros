"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { notifyProducerPromotion } from "@/lib/notifications";
import { getAppUrl } from "@/lib/site-url";
import { sendEmail } from "@/lib/email";
import { welcomeEmail } from "@/lib/emails/welcome";
import { US_STATE_CODES } from "@/lib/us-states";
import { freeRemovedPersonEmail } from "@/lib/free-email";

type Guard = { ok: true } | { ok: false; error: string };

// Confirm the caller is a builder acting on their DIRECT downline only (the
// target's upline is the caller). Promote/remove are direct-upline-only powers;
// indirect uplines can view analytics but not manage people below their leg.
async function guardTarget(targetPersonId: string): Promise<Guard> {
  const caller = await getCurrentPerson();
  if (!caller) return { ok: false, error: "Not signed in." };
  if (!caller.is_builder) return { ok: false, error: "Builders only." };
  if (!targetPersonId) return { ok: false, error: "Missing person." };
  if (targetPersonId === caller.id) {
    return { ok: false, error: "You can't do that to yourself." };
  }
  const supabase = await createClient();
  const { data: visible } = await supabase
    .from("person")
    .select("id, upline_id")
    .eq("id", targetPersonId)
    .maybeSingle();
  if (!visible) return { ok: false, error: "Not in your downline." };
  if (visible.upline_id !== caller.id) {
    return { ok: false, error: "Only their direct upline can do that." };
  }
  return { ok: true };
}

/**
 * Open the message thread for a direct downline member — producer OR recruit.
 *
 * Conversations are stored against a recruit row (message.recruit_id). Recruits
 * already have one; producers added straight to the team don't, so there's no
 * thread to open. Here we reuse their recruit row if it exists, otherwise create
 * a thread anchor (phase 'graduated', so it stays out of the active licensing
 * pipeline), then drop the builder into the conversation.
 */
export async function messageDownline(formData: FormData) {
  const personId = String(formData.get("personId") ?? "");
  const back = `/producer/downline/${personId}`;
  const guard = await guardTarget(personId);
  if (!guard.ok) redirect(`${back}?error=${encodeURIComponent(guard.error)}`);

  const admin = createServiceRoleClient();
  const { data: existing } = await admin
    .from("recruit")
    .select("id")
    .eq("person_id", personId)
    .maybeSingle();

  let recruitId = (existing as { id: string } | null)?.id;
  if (!recruitId) {
    const caller = await getCurrentPerson(); // guard already confirmed the direct upline
    const { data: created, error } = await admin
      .from("recruit")
      .insert({ person_id: personId, builder_id: caller!.id, phase: "graduated" })
      .select("id")
      .single();
    if (error || !created) {
      redirect(`${back}?error=${encodeURIComponent(error?.message ?? "Couldn't open the conversation.")}`);
    }
    recruitId = created.id;
  }

  redirect(`/producer/messages/${recruitId}`);
}

/**
 * Promote a contracted recruit to producer — flips on the producer portal.
 *
 * Allowed once the recruit has submitted their contracting info from the portal
 * (licensing_submitted_at set). Sets is_producer on the person; the recruit
 * portal then redirects them to /producer on their next load. Reserved to the
 * recruit's own builder.
 */
export async function promoteToProducerForm(formData: FormData) {
  const recruitId = String(formData.get("recruitId") ?? "");
  const back = `/producer/recruiting/recruit/${recruitId}`;
  const caller = await getCurrentPerson();
  if (!caller) redirect("/auth/signin?next=/producer/recruiting");
  if (!caller.is_builder) redirect("/producer");
  if (!recruitId) redirect("/producer/recruiting");

  const admin = createServiceRoleClient();
  const { data: recruit } = await admin
    .from("recruit")
    .select("id, person_id, builder_id, licensing_submitted_at")
    .eq("id", recruitId)
    .maybeSingle();
  if (!recruit) redirect(`${back}?error=${encodeURIComponent("Recruit not found.")}`);
  if (recruit.builder_id !== caller.id) {
    redirect(`${back}?error=${encodeURIComponent("Only their builder can promote them.")}`);
  }
  if (!recruit.licensing_submitted_at) {
    redirect(`${back}?error=${encodeURIComponent("They need to submit their contracting info first.")}`);
  }

  const { error } = await admin
    .from("person")
    .update({ is_producer: true })
    .eq("id", recruit.person_id);
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);

  // Congrats → the new producer; heads-up → their builder. Best-effort.
  await notifyProducerPromotion(recruit.person_id);

  revalidatePath(back);
  revalidatePath("/producer/recruiting");
  redirect(`${back}?ok=promoted`);
}

/** Remove a producer from the team — marks the person (and any recruit row) removed. */
export async function removeProducerForm(formData: FormData) {
  const personId = String(formData.get("personId") ?? "");
  const back = `/producer/downline/${personId}`;
  const guard = await guardTarget(personId);
  if (!guard.ok) redirect(`${back}?error=${encodeURIComponent(guard.error)}`);

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("person")
    .update({ status: "removed" })
    .eq("id", personId);
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);

  // Keep any recruit record in sync so the pipeline reflects the removal too.
  await admin
    .from("recruit")
    .update({ removed_at: new Date().toISOString() })
    .eq("person_id", personId)
    .is("removed_at", null);

  // Free their email + login so the builder can add this person again later.
  await freeRemovedPersonEmail(admin, personId);

  revalidatePath("/producer/downline");
  redirect("/producer/downline?ok=removed");
}

/**
 * Find the Supabase auth user id for an email. Pending invitees have an auth
 * user (created by generateLink) but no person.auth_user_id yet — it's only
 * linked when they first click their link — so we may have to look them up by
 * email. Bounded to keep a server action snappy on a large user base.
 */
async function findAuthUserIdByEmail(
  admin: ReturnType<typeof createServiceRoleClient>,
  email: string,
): Promise<string | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/**
 * Edit a direct downline producer's profile — name, email, phone, and licensed
 * state. Name/phone/email live on the person row; state lives on the recruit row
 * (created on the fly for producers that don't have one yet). Changing the email
 * also updates their Supabase auth login, so a corrected address can be re-invited
 * (the common "I typed the wrong email" fix). Direct-upline-only.
 */
export async function updateProducerInfo(formData: FormData) {
  const personId = String(formData.get("personId") ?? "");
  const back = `/producer/downline/${personId}`;
  const guard = await guardTarget(personId);
  if (!guard.ok) redirect(`${back}?error=${encodeURIComponent(guard.error)}`);

  const fullName = String(formData.get("fullName") ?? "").replace(/\s+/g, " ").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim().toUpperCase();

  if (!fullName) {
    redirect(`${back}?error=${encodeURIComponent("Please enter their name.")}`);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(`${back}?error=${encodeURIComponent("Please enter a valid email address.")}`);
  }
  if (phone && (phone.match(/\d/g)?.length ?? 0) < 10) {
    redirect(`${back}?error=${encodeURIComponent("Please enter a valid phone number.")}`);
  }
  if (state && !US_STATE_CODES.has(state)) {
    redirect(`${back}?error=${encodeURIComponent("Please choose a valid state.")}`);
  }

  const caller = await getCurrentPerson(); // guard confirmed the direct upline
  const admin = createServiceRoleClient();

  // If the email changed, keep the auth account in lockstep with the person row,
  // otherwise a resend would target an address with no matching login.
  const { data: current } = await admin
    .from("person")
    .select("email, auth_user_id")
    .eq("id", personId)
    .maybeSingle();
  const emailChanged = !!current && (current.email ?? "").toLowerCase() !== email;
  if (emailChanged) {
    const { data: clash } = await admin
      .from("person")
      .select("id")
      .ilike("email", email)
      .neq("id", personId)
      .maybeSingle();
    if (clash) {
      redirect(`${back}?error=${encodeURIComponent("Another account already uses that email.")}`);
    }
    const authUserId =
      current!.auth_user_id ?? (await findAuthUserIdByEmail(admin, current!.email ?? ""));
    if (authUserId) {
      const { error: authErr } = await admin.auth.admin.updateUserById(authUserId, {
        email,
        email_confirm: true,
      });
      if (authErr) {
        redirect(`${back}?error=${encodeURIComponent(`Couldn't update their login email: ${authErr.message}`)}`);
      }
    }
  }

  const { error: personErr } = await admin
    .from("person")
    .update({ full_name: fullName, email, phone: phone || null })
    .eq("id", personId);
  if (personErr) redirect(`${back}?error=${encodeURIComponent(personErr.message)}`);

  // State is carried on the recruit row. Most downline producers have one; if a
  // producer was added straight to the team without one, create it now.
  const { data: existing } = await admin
    .from("recruit")
    .select("id")
    .eq("person_id", personId)
    .maybeSingle();
  const recruitErr = existing
    ? (await admin.from("recruit").update({ phone: phone || null, state: state || null }).eq("person_id", personId)).error
    : (await admin.from("recruit").insert({ person_id: personId, builder_id: caller!.id, phase: "graduated", phone: phone || null, state: state || null })).error;
  if (recruitErr) redirect(`${back}?error=${encodeURIComponent(recruitErr.message)}`);

  revalidatePath(back);
  revalidatePath("/producer/downline");
  redirect(`${back}?ok=saved`);
}

/**
 * Resend a producer's setup invite. The auth user already exists (it was created
 * with the first invite), so an invite-type link comes back empty for them — we
 * fall back to a recovery link, which signs an existing, not-yet-confirmed user
 * in just the same. Routed through our /auth/confirm interstitial to /welcome.
 * Mirrors the add-person flow in lib/actions/admin/team.ts; we deliberately do
 * NOT use a magic-link here — recovery is the path proven to land stuck invitees.
 * Direct-upline-only.
 */
export async function resendProducerInvite(formData: FormData) {
  const personId = String(formData.get("personId") ?? "");
  const back = `/producer/downline/${personId}`;
  const guard = await guardTarget(personId);
  if (!guard.ok) redirect(`${back}?error=${encodeURIComponent(guard.error)}`);

  const admin = createServiceRoleClient();
  const { data: person } = await admin
    .from("person")
    .select("email")
    .eq("id", personId)
    .maybeSingle();
  if (!person?.email) {
    redirect(`${back}?error=${encodeURIComponent("No email on file for this producer.")}`);
  }
  const email = (person.email as string).toLowerCase();

  const redirectTo = `${getAppUrl()}/auth/callback?next=/welcome`;
  const confirmLink = (hash: string | undefined, type: "invite" | "recovery") =>
    hash
      ? `${getAppUrl()}/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=${type}&next=${encodeURIComponent("/welcome")}`
      : null;

  // invite covers the rare case the auth user is missing; recovery is the normal
  // resend path (the login already exists, so invite returns empty for it).
  const invite = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });
  let setupUrl = confirmLink(invite.data?.properties?.hashed_token, "invite");
  if (!setupUrl) {
    const recovery = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    setupUrl = confirmLink(recovery.data?.properties?.hashed_token, "recovery");
  }
  if (!setupUrl) {
    redirect(`${back}?error=${encodeURIComponent("Could not generate a new invite link.")}`);
  }

  const mail = welcomeEmail({ setupUrl });
  const sent = await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
  if (!sent.ok) {
    redirect(`${back}?error=${encodeURIComponent(`Could not send the invite email: ${sent.error}`)}`);
  }

  redirect(`${back}?ok=resent`);
}

/** Upgrade a producer to a builder (roles are additive, so set both flags). */
export async function upgradeToBuilderForm(formData: FormData) {
  const personId = String(formData.get("personId") ?? "");
  const back = `/producer/downline/${personId}`;
  const guard = await guardTarget(personId);
  if (!guard.ok) redirect(`${back}?error=${encodeURIComponent(guard.error)}`);

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("person")
    .update({ is_builder: true, is_producer: true })
    .eq("id", personId);
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(back);
  revalidatePath("/producer/downline");
  redirect(`${back}?ok=upgraded`);
}
