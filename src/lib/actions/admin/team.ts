"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/site-url";
import { welcomeEmail } from "@/lib/emails/welcome";

type Role = "builder" | "producer" | "recruit";

function pageFor(role: Role): string {
  return role === "builder"
    ? "/admin/people/builders"
    : role === "producer"
      ? "/admin/people/producers"
      : "/admin/people/recruits";
}

function back(path: string, query: string): never {
  revalidatePath(path);
  redirect(`${path}?${query}`);
}

function roleFlags(role: Role): { is_builder: boolean; is_producer: boolean } {
  return {
    is_builder: role === "builder",
    is_producer: role === "builder" || role === "producer",
  };
}

/** Reassign a person to a new upline (or clear it). */
export async function adminReassignUpline(formData: FormData) {
  await requireAdmin();
  const personId = String(formData.get("personId") ?? "");
  const uplineId = String(formData.get("uplineId") ?? "").trim() || null;
  const backPath = String(formData.get("back") ?? `/admin/people/${personId}`);

  if (!personId) back(backPath, `error=${encodeURIComponent("Missing person.")}`);
  if (uplineId === personId) {
    back(backPath, `error=${encodeURIComponent("A person can't be their own upline.")}`);
  }

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("person")
    .update({ upline_id: uplineId })
    .eq("id", personId);
  if (error) back(backPath, `error=${encodeURIComponent(error.message)}`);
  back(backPath, "ok=upline");
}

type ParsedPerson = { name: string; email: string };

// Accept one person per line, in any of:
//   "Jane Doe, jane@x.com"   |   "Jane Doe <jane@x.com>"   |   "jane@x.com"
function parseRoster(text: string): ParsedPerson[] {
  const out: ParsedPerson[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const angle = line.match(/^(.*?)<([^>]+)>$/);
    let name = "";
    let email = "";
    if (angle) {
      name = angle[1].trim();
      email = angle[2].trim();
    } else if (line.includes(",")) {
      const [a, b] = line.split(",").map((s) => s.trim());
      if (/@/.test(b ?? "")) {
        name = a;
        email = b;
      } else {
        email = a;
        name = b ?? "";
      }
    } else {
      email = line;
    }
    email = email.toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      out.push({ name: name || email.split("@")[0], email });
    }
  }
  return out;
}

// Create one person under an upline with the role's flags and email them a
// branded invite. Returns true if the invite was sent.
async function invitePerson(
  admin: SupabaseClient,
  p: { name: string; email: string; uplineId: string | null; role: Role },
): Promise<boolean> {
  const { data: existing } = await admin
    .from("person")
    .select("id")
    .ilike("email", p.email)
    .maybeSingle();
  if (existing) return false;

  const flags = roleFlags(p.role);
  const { data: person, error: personErr } = await admin
    .from("person")
    .insert({
      full_name: p.name,
      email: p.email,
      upline_id: p.uplineId,
      is_builder: flags.is_builder,
      is_producer: flags.is_producer,
    })
    .select("id")
    .single();
  if (personErr || !person) return false;

  if (p.role === "recruit") {
    await admin.from("recruit").insert({
      person_id: person.id,
      builder_id: p.uplineId ?? person.id,
      phase: "licensing",
    });
  }

  // Roll back the new rows if we can't actually deliver the invite, so a failure
  // never leaves an un-invitable ghost account.
  async function rollback() {
    await admin.from("recruit").delete().eq("person_id", person!.id);
    await admin.from("person").delete().eq("id", person!.id);
  }

  const { data: link } = await admin.auth.admin.generateLink({
    type: "invite",
    email: p.email,
    options: { redirectTo: `${getAppUrl()}/auth/callback?next=/welcome` },
  });
  const setupUrl = link?.properties?.action_link;
  if (!setupUrl) {
    await rollback();
    return false;
  }

  const mail = welcomeEmail({ firstName: p.name.split(/\s+/)[0], setupUrl });
  const sent = await sendEmail({
    to: p.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
  if (!sent.ok) {
    const authUserId = link?.user?.id;
    if (authUserId) await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    await rollback();
    return false;
  }
  return true;
}

function readRole(formData: FormData): Role {
  const r = String(formData.get("role") ?? "recruit");
  return r === "builder" || r === "producer" ? r : "recruit";
}

/** Add a single person under an upline and send their invite. */
export async function adminAddPerson(formData: FormData) {
  await requireAdmin();
  const role = readRole(formData);
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const uplineId = String(formData.get("uplineId") ?? "").trim() || null;
  const backPath = String(formData.get("back") ?? pageFor(role));

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    back(backPath, `error=${encodeURIComponent("Enter a valid email.")}`);
  }

  const admin = createServiceRoleClient();
  const ok = await invitePerson(admin, {
    name: name || email.split("@")[0],
    email,
    uplineId,
    role,
  });
  if (!ok) {
    back(backPath, `error=${encodeURIComponent("Couldn't add — they may already exist, or the email failed.")}`);
  }
  back(backPath, "ok=1&skipped=0");
}

/** Bulk-add a roster of people under one upline + role; invite them all. */
export async function adminBulkInvite(formData: FormData) {
  await requireAdmin();
  const role = readRole(formData);
  const uplineId = String(formData.get("uplineId") ?? "").trim() || null;
  const backPath = String(formData.get("back") ?? pageFor(role));
  const roster = parseRoster(String(formData.get("roster") ?? ""));

  if (roster.length === 0) {
    back(backPath, `error=${encodeURIComponent("No valid name/email rows found.")}`);
  }

  const admin = createServiceRoleClient();
  let invited = 0;
  let skipped = 0;
  for (const p of roster) {
    const ok = await invitePerson(admin, { ...p, uplineId, role });
    if (ok) invited++;
    else skipped++;
  }
  back(backPath, `ok=${invited}&skipped=${skipped}`);
}
