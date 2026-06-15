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

  revalidatePath("/producer/downline");
  redirect("/producer/downline?ok=removed");
}

/**
 * Edit a direct downline producer's profile — name, phone, and licensed state.
 * Name/phone live on the person row; state lives on the recruit row (created on
 * the fly for producers that don't have one yet). Direct-upline-only.
 */
export async function updateProducerInfo(formData: FormData) {
  const personId = String(formData.get("personId") ?? "");
  const back = `/producer/downline/${personId}`;
  const guard = await guardTarget(personId);
  if (!guard.ok) redirect(`${back}?error=${encodeURIComponent(guard.error)}`);

  const fullName = String(formData.get("fullName") ?? "").replace(/\s+/g, " ").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim().toUpperCase();

  if (!fullName) {
    redirect(`${back}?error=${encodeURIComponent("Please enter their name.")}`);
  }
  if (phone && (phone.match(/\d/g)?.length ?? 0) < 10) {
    redirect(`${back}?error=${encodeURIComponent("Please enter a valid phone number.")}`);
  }
  if (state && !US_STATE_CODES.has(state)) {
    redirect(`${back}?error=${encodeURIComponent("Please choose a valid state.")}`);
  }

  const caller = await getCurrentPerson(); // guard confirmed the direct upline
  const admin = createServiceRoleClient();

  const { error: personErr } = await admin
    .from("person")
    .update({ full_name: fullName, phone: phone || null })
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
 * with the first invite), so we mint a fresh magic-link token and route it
 * through our /auth/confirm interstitial to /welcome. Direct-upline-only.
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

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${getAppUrl()}/auth/callback?next=/welcome` },
  });
  const tokenHash = link?.properties?.hashed_token;
  const setupUrl = tokenHash
    ? `${getAppUrl()}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent("/welcome")}`
    : null;
  if (linkErr || !setupUrl) {
    redirect(`${back}?error=${encodeURIComponent(linkErr?.message ?? "Could not generate a new invite link.")}`);
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
