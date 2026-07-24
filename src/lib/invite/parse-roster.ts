// Parse a free-text roster into name/email rows. Shared by the admin bulk-invite
// (src/lib/actions/admin/team.ts) and the builder's "Add someone to your team"
// box (src/components/producer/AddPerson.tsx). Lives in a plain module (NOT a
// "use server" file) so the client component can import it too.
//
// Accepts, one entry per line:
//   - "Full Name, email@x.com"   (either column order — we detect which has the @)
//   - "Full Name <email@x.com>"
//   - "email@x.com"              (bare; name falls back to the email prefix)
// A CSV pasted or read from a file is the comma form, so this parses CSV rows as
// well. A header row like "name,email" has no valid email in it and is dropped
// naturally. Blank lines and rows without a valid email are skipped.

import type { InviteRole } from "@/lib/invite/batch";

export type ParsedPerson = { name: string; email: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_RE = /^(recruit|producer|builder)$/i;

export function parseRoster(text: string): ParsedPerson[] {
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
    if (EMAIL_RE.test(email)) {
      out.push({ name: name || email.split("@")[0], email });
    }
  }
  return out;
}

export type ParsedInviteRow = { name: string; email: string; role: InviteRole };

/**
 * Parse a role-aware invite list for the builder's bulk-invite box. Each line
 * may carry an email, an optional role word (recruit | producer | builder), and
 * an optional name, in any column order — we detect each by shape rather than
 * position. Lines without a valid email (including a header like
 * "email,role") are dropped; a missing role defaults to recruit.
 *
 * Accepts, one entry per line:
 *   bob@example.com
 *   bob@example.com, producer
 *   Bob Smith, bob@example.com, builder
 *   Bob Smith <bob@example.com>, recruit
 */
export function parseInviteRows(text: string): ParsedInviteRow[] {
  const out: ParsedInviteRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    // Pull "Name <email>" apart into comma-splittable tokens first.
    const angle = line.match(/^(.*?)<([^>]+)>(.*)$/);
    const tokens = (
      angle
        ? [angle[1], angle[2], ...angle[3].split(",")]
        : line.split(",")
    )
      .map((t) => t.trim())
      .filter(Boolean);

    let email = "";
    let role: InviteRole = "recruit";
    const rest: string[] = [];
    for (const t of tokens) {
      const lower = t.toLowerCase();
      if (!email && EMAIL_RE.test(lower)) {
        email = lower;
      } else if (ROLE_RE.test(t)) {
        role = lower as InviteRole;
      } else {
        rest.push(t);
      }
    }
    if (!email) continue;
    out.push({ name: rest[0] || email.split("@")[0], email, role });
  }
  return out;
}
