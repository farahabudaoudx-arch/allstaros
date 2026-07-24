"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPerson } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/site-url";
import { sendEmail } from "@/lib/email";
import { welcomeEmail } from "@/lib/emails/welcome";
import type { Phase } from "@/lib/db/types";
import {
  MAX_BATCH_INVITES,
  type BatchInviteRow,
  type BatchInviteResult,
  type BatchInviteRowResult,
  type InviteRole,
} from "@/lib/invite/batch";

export type InviteRecruitResult = { ok: true } | { ok: false; error: string };

type InviteOptions = {
  /** Land them on the team as a producer immediately, or as a pipeline recruit. */
  isProducer: boolean;
  /** Also flag them as a builder — licensed AND able to run their own downline. */
  isBuilder: boolean;
  /** Recruit phase. 'licensing' = active pipeline; 'graduated' = skip it. */
  phase: Phase;
  /** Path to revalidate so the inviter's list reflects the new pending invite. */
  revalidate: string;
};

/** Map a chosen role to the flags + pipeline placement it implies. */
function optionsForRole(role: InviteRole): InviteOptions {
  if (role === "builder") {
    return {
      isProducer: true,
      isBuilder: true,
      phase: "graduated",
      revalidate: "/producer/downline",
    };
  }
  if (role === "producer") {
    return {
      isProducer: true,
      isBuilder: false,
      phase: "graduated",
      revalidate: "/producer/downline",
    };
  }
  return {
    isProducer: false,
    isBuilder: false,
    phase: "licensing",
    revalidate: "/producer/recruiting",
  };
}

/**
 * Shared core for both invite paths. Creates the person (upline_id = builder,
 * placeholder name until they finish setup) and recruit rows, then mints a
 * one-time setup link with the Supabase admin API and sends our own branded
 * welcome email through Resend. We use generateLink (not inviteUserByEmail) so
 * Supabase does NOT also send its default template — the invitee gets exactly
 * one email. Any failure rolls back every row so the invite isn't a ghost.
 *
 * There is no public sign-up; an admin-issued invite is the only way an account
 * comes into existence. The invitee fills in their own name, phone, and state —
 * and sets a password — when they accept at /welcome.
 */
async function createInvitedAccount(
  email: string,
  opts: InviteOptions,
  name?: string,
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

  // Use the name the inviter gave us as the starting name; it's overwritten when
  // they complete setup at /welcome. With no name, fall back to the email prefix.
  const startingName = name?.trim() || clean.split("@")[0];

  const { data: person, error: personErr } = await admin
    .from("person")
    .insert({
      full_name: startingName,
      email: clean,
      upline_id: caller.id,
      is_builder: opts.isBuilder,
      is_producer: opts.isProducer,
    })
    .select("id")
    .single();
  if (personErr || !person) {
    return { ok: false, error: personErr?.message ?? "Could not create the invite." };
  }

  const { error: recruitErr } = await admin.from("recruit").insert({
    person_id: person.id,
    builder_id: caller.id,
    phase: opts.phase,
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
  // Build a CLEAN link on our own domain from the one-time token hash, rather
  // than handing them Supabase's long /auth/v1/verify action_link. Our
  // /auth/confirm route verifies the token server-side (establishing the
  // session) and drops them straight on /welcome.
  const tokenHash = link?.properties?.hashed_token;
  const setupUrl = tokenHash
    ? `${getAppUrl()}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=invite&next=${encodeURIComponent("/welcome")}`
    : null;
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

  revalidatePath(opts.revalidate);
  return { ok: true };
}

/**
 * Builder action: invite a recruit by email. They enter the recruiting pipeline
 * at phase 'licensing' and become a producer once promoted.
 */
export async function inviteRecruitByEmail(
  email: string,
): Promise<InviteRecruitResult> {
  return createInvitedAccount(email, optionsForRole("recruit"));
}

/**
 * Builder action: invite a producer straight onto the team. They show up in My
 * Downline immediately as "Invite Sent" and flip to an active profile once they
 * accept and finish setup. phase 'graduated' keeps them OUT of the recruiting
 * pipeline — an invited producer skips licensing.
 */
export async function inviteProducerByEmail(
  email: string,
): Promise<InviteRecruitResult> {
  return createInvitedAccount(email, optionsForRole("producer"));
}

/**
 * Builder action: invite a whole list of people at once. Each row picks its own
 * type — a licensed producer (skips the pipeline) or a recruit (enters it). We
 * send them one at a time so we stay friendly to the email provider's rate limit
 * and keep the results in the same order as the input. One bad row never aborts
 * the others: it comes back with a reason so the caller can fix and resend just
 * that one. A duplicate email inside the same list is collapsed to one invite.
 */
export async function inviteTeamBatch(
  rows: BatchInviteRow[],
): Promise<BatchInviteResult> {
  const caller = await getCurrentPerson();
  if (!caller) return { ok: false, error: "Not signed in." };
  if (!caller.is_builder) return { ok: false, error: "Builders only." };
  if (rows.length === 0) return { ok: false, error: "Add at least one person." };
  if (rows.length > MAX_BATCH_INVITES) {
    return {
      ok: false,
      error: `You can invite up to ${MAX_BATCH_INVITES} people at a time. Remove ${rows.length - MAX_BATCH_INVITES} and send the rest in another batch.`,
    };
  }

  const results: BatchInviteRowResult[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.email.trim().toLowerCase();
    if (seen.has(key)) {
      results.push({ email: row.email, ok: false, error: "Duplicate in this list." });
      continue;
    }
    seen.add(key);

    const res = await createInvitedAccount(
      row.email,
      optionsForRole(row.role),
      row.name,
    );
    results.push({
      email: row.email,
      ok: res.ok,
      error: res.ok ? undefined : res.error,
    });
  }
  return { ok: true, results };
}
