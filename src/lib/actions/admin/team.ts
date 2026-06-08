"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/site-url";
import { welcomeEmail } from "@/lib/emails/welcome";

function back(path: string, query: string): never {
  revalidatePath(path);
  redirect(`${path}?${query}`);
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
      // Either "name, email" or "email, name" — pick the part that looks like an email.
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

/**
 * Bulk-add a roster of people (names + emails) under one upline and one role,
 * then send each a branded invite email. Used to bring a new builder's whole
 * downline over at once. Each becomes a separate person. Best-effort per row:
 * rows that already exist or fail to email are reported, the rest still go.
 */
export async function adminBulkInvite(formData: FormData) {
  await requireAdmin();
  const BACK = "/admin/people/builders";
  const uplineId = String(formData.get("uplineId") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "recruit"); // builder | producer | recruit
  const roster = parseRoster(String(formData.get("roster") ?? ""));

  if (roster.length === 0) {
    back(BACK, `error=${encodeURIComponent("No valid name/email rows found.")}`);
  }

  const flags = {
    is_builder: role === "builder",
    is_producer: role === "builder" || role === "producer",
  };

  const admin = createServiceRoleClient();
  let invited = 0;
  let skipped = 0;

  for (const p of roster) {
    // One account per email.
    const { data: existing } = await admin
      .from("person")
      .select("id")
      .ilike("email", p.email)
      .maybeSingle();
    if (existing) {
      skipped++;
      continue;
    }

    const { data: person, error: personErr } = await admin
      .from("person")
      .insert({
        full_name: p.name,
        email: p.email,
        upline_id: uplineId,
        is_builder: flags.is_builder,
        is_producer: flags.is_producer,
      })
      .select("id")
      .single();
    if (personErr || !person) {
      skipped++;
      continue;
    }

    // Recruits get a recruit row so they show in the pipeline.
    if (role === "recruit") {
      await admin.from("recruit").insert({
        person_id: person.id,
        builder_id: uplineId ?? person.id,
        phase: "licensing",
      });
    }

    const { data: link } = await admin.auth.admin.generateLink({
      type: "invite",
      email: p.email,
      options: { redirectTo: `${getAppUrl()}/auth/callback?next=/welcome` },
    });
    const setupUrl = link?.properties?.action_link;
    if (!setupUrl) {
      skipped++;
      continue;
    }

    const mail = welcomeEmail({
      firstName: p.name.split(/\s+/)[0],
      setupUrl,
    });
    const sent = await sendEmail({
      to: p.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    if (sent.ok) invited++;
    else skipped++;
  }

  back(BACK, `ok=${invited}&skipped=${skipped}`);
}
