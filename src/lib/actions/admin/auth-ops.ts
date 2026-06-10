"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/site-url";
import { welcomeEmail } from "@/lib/emails/welcome";
import { passwordResetEmail } from "@/lib/emails/password-reset";

const BACK = "/admin/auth-ops";

function done(query: string): never {
  revalidatePath(BACK);
  redirect(`${BACK}?${query}`);
}

function firstNameOf(full: string | null): string | undefined {
  const f = (full ?? "").trim().split(/\s+/)[0];
  return f || undefined;
}

async function personEmail(personId: string) {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("person")
    .select("id, full_name, email")
    .eq("id", personId)
    .maybeSingle();
  return data as { id: string; full_name: string | null; email: string } | null;
}

/** Re-mint the one-time setup link and re-send the branded invite email. */
export async function adminResendInvite(formData: FormData) {
  await requireAdmin();
  const personId = String(formData.get("personId") ?? "");
  const person = await personEmail(personId);
  if (!person?.email) done(`error=${encodeURIComponent("No email on file.")}`);

  const admin = createServiceRoleClient();
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: person.email,
    options: { redirectTo: `${getAppUrl()}/auth/callback?next=/welcome` },
  });
  const setupUrl = link?.properties?.action_link;
  if (error || !setupUrl) {
    done(`error=${encodeURIComponent(error?.message ?? "Could not mint link.")}`);
  }

  const mail = welcomeEmail({ firstName: firstNameOf(person.full_name), setupUrl });
  const sent = await sendEmail({
    to: person.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
  if (!sent.ok) done(`error=${encodeURIComponent(`Email failed: ${sent.error}`)}`);
  done("ok=invited");
}

/** Mint a recovery link and send the branded password-reset email. */
export async function adminSendPasswordReset(formData: FormData) {
  await requireAdmin();
  const personId = String(formData.get("personId") ?? "");
  const person = await personEmail(personId);
  if (!person?.email) done(`error=${encodeURIComponent("No email on file.")}`);

  const admin = createServiceRoleClient();
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: person.email,
    options: {
      redirectTo: `${getAppUrl()}/auth/callback?next=/auth/reset/confirm`,
    },
  });
  const resetUrl = link?.properties?.action_link;
  if (error || !resetUrl) {
    done(`error=${encodeURIComponent(error?.message ?? "Could not mint link.")}`);
  }

  const mail = passwordResetEmail({
    firstName: firstNameOf(person.full_name),
    resetUrl,
  });
  const sent = await sendEmail({
    to: person.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
  if (!sent.ok) done(`error=${encodeURIComponent(`Email failed: ${sent.error}`)}`);
  done("ok=reset");
}
