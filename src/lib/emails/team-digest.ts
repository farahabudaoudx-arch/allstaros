// Daily team digest email — sent to a builder once per day. ONE email
// summarizing their whole team: production, activity, unread messages, stalled
// recruits, and flagged behavior. Each section links into the "My Team" views
// in the app for the per-person breakdown.
//
// Sections degrade gracefully when empty (e.g. "No flags today"), so the digest
// is always a coherent single email.
//
// Returns { subject, html, text } for the Resend sendEmail() helper.

import {
  BRAND,
  shell,
  headingRow,
  paragraphRow,
  buttonRow,
  customRow,
  footerRow,
  escapeHtml,
} from "./_layout";

const B = BRAND;

export type DigestRecruit = {
  name: string; // recruit display name
  detail: string; // reason / note, e.g. "exam not scheduled" or "no check-ins 4 days"
  phase?: string; // current pipeline phase, e.g. "licensing"
};

export type FlaggedBehavior = {
  name: string; // recruit/team member display name
  note: string; // what was flagged, e.g. "no dials logged in 5 days"
};

export type TeamDigestParams = {
  builderFirstName?: string; // builder's first name; optional
  periodLabel?: string; // e.g. "Today" (default) or "This week"
  production: { value: string; caption?: string; url: string }; // team total + "My Team" link
  activity: { value: string; caption?: string; url: string }; // team total + "My Team" link
  unreadMessages: { count: number; url: string }; // unread count + messages link
  stalledRecruits: DigestRecruit[]; // flagged-as-stalled list
  flaggedBehavior: FlaggedBehavior[]; // behavior flags from the team
  dashboardUrl: string; // primary CTA → builder dashboard
};

// ── small inline builders ─────────────────────────────────────────────────────

function eyebrow(text: string): string {
  return `<div style="font-family:${B.FONT};font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${B.MUTE};">${text}</div>`;
}

function bigStat(value: string): string {
  return `<div style="margin-top:8px;font-family:${B.FONT};font-size:28px;line-height:1.1;font-weight:600;color:${B.INK};">${escapeHtml(value)}</div>`;
}

function caption(text?: string): string {
  return text
    ? `<div style="margin-top:4px;font-family:${B.FONT};font-size:13px;line-height:1.5;color:${B.SUBTLE};">${escapeHtml(text)}</div>`
    : "";
}

function viewLink(text: string, url: string): string {
  return `<div style="margin-top:14px;"><a href="${url}" target="_blank" style="font-family:${B.FONT};font-size:13px;font-weight:600;color:${B.GOLD};text-decoration:none;">${text} &rarr;</a></div>`;
}

/** A section wrapper: a top hairline (unless first), an eyebrow label, and body. */
function section(label: string, innerHtml: string, first = false): string {
  const rule = first
    ? ""
    : `<div style="height:1px;background-color:${B.HAIRLINE};line-height:1px;font-size:1px;margin-bottom:26px;">&nbsp;</div>`;
  return customRow(`${rule}${eyebrow(label)}${innerHtml}`, first ? 26 : 26);
}

/** A list of name + detail rows (used for stalled recruits & flags). */
function list(
  items: { name: string; detail: string; phase?: string }[],
  emptyText: string,
): string {
  if (items.length === 0) {
    return `<div style="margin-top:10px;font-family:${B.FONT};font-size:14px;color:${B.SUBTLE};">${emptyText}</div>`;
  }
  const rows = items
    .map((it) => {
      const meta = it.phase
        ? `${escapeHtml(it.detail)} · ${escapeHtml(it.phase)}`
        : escapeHtml(it.detail);
      return `<tr><td style="padding:12px 0;border-bottom:1px solid ${B.HAIRLINE};">
        <div style="font-family:${B.FONT};font-size:15px;font-weight:600;color:${B.INK};">${escapeHtml(it.name)}</div>
        <div style="margin-top:3px;font-family:${B.FONT};font-size:13px;line-height:1.5;color:${B.SUBTLE};">${meta}</div>
      </td></tr>`;
    })
    .join("\n");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;border-top:1px solid ${B.HAIRLINE};">${rows}</table>`;
}

// ── the email ─────────────────────────────────────────────────────────────────

export function teamDigestEmail(params: TeamDigestParams): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    builderFirstName,
    periodLabel = "Today",
    production,
    activity,
    unreadMessages,
    stalledRecruits,
    flaggedBehavior,
    dashboardUrl,
  } = params;

  const heading = builderFirstName
    ? `Your team digest, ${escapeHtml(builderFirstName)}.`
    : "Your team digest.";
  const subject = `Your team digest · ${periodLabel}`;

  const messagesInner =
    unreadMessages.count > 0
      ? `${bigStat(`${unreadMessages.count} unread`)}${viewLink("Open messages", unreadMessages.url)}`
      : `<div style="margin-top:8px;font-family:${B.FONT};font-size:16px;color:${B.SUBTLE};">All caught up — no unread messages.</div>`;

  const rows = [
    headingRow(heading),
    paragraphRow(
      `Here's how your team is doing — ${escapeHtml(periodLabel.toLowerCase())} at a glance.`,
    ),

    section(
      `Team production · ${periodLabel}`,
      `${bigStat(production.value)}${caption(production.caption)}${viewLink("View my team's production", production.url)}`,
      true,
    ),
    section(
      `Team activity · ${periodLabel}`,
      `${bigStat(activity.value)}${caption(activity.caption)}${viewLink("View my team's activity", activity.url)}`,
    ),
    section("Messages", messagesInner),
    section(
      `Stalled recruits${stalledRecruits.length ? ` (${stalledRecruits.length})` : ""}`,
      list(stalledRecruits, "No stalled recruits — your pipeline is moving."),
    ),
    section(
      `Flagged behavior${flaggedBehavior.length ? ` (${flaggedBehavior.length})` : ""}`,
      list(
        flaggedBehavior.map((f) => ({ name: f.name, detail: f.note })),
        "No behavior flags today.",
      ),
    ),

    buttonRow("Open dashboard", dashboardUrl),
    footerRow(
      "You're receiving this daily because you lead a team on All Star. Recruits are flagged automatically; every decision stays yours.",
    ),
  ].join("\n");

  const html = shell({ subject, preheader: "Your daily team digest.", rows });

  // ── plain-text version ──
  const stalledText = stalledRecruits.length
    ? stalledRecruits.map(
        (r) => `  • ${r.name} — ${r.detail}${r.phase ? ` (${r.phase})` : ""}`,
      )
    : ["  None — your pipeline is moving."];
  const flagsText = flaggedBehavior.length
    ? flaggedBehavior.map((f) => `  • ${f.name} — ${f.note}`)
    : ["  None today."];

  const messagesLine =
    unreadMessages.count > 0
      ? [`MESSAGES: ${unreadMessages.count} unread`, `  Open messages: ${unreadMessages.url}`]
      : ["MESSAGES: all caught up"];

  const text = [
    builderFirstName ? `Your team digest, ${builderFirstName}.` : "Your team digest.",
    `Here's how your team is doing — ${periodLabel.toLowerCase()} at a glance.`,
    "",
    `TEAM PRODUCTION (${periodLabel}): ${production.value}${production.caption ? ` — ${production.caption}` : ""}`,
    `  View my team's production: ${production.url}`,
    "",
    `TEAM ACTIVITY (${periodLabel}): ${activity.value}${activity.caption ? ` — ${activity.caption}` : ""}`,
    `  View my team's activity: ${activity.url}`,
    "",
    ...messagesLine,
    "",
    "STALLED RECRUITS:",
    ...stalledText,
    "",
    "FLAGGED BEHAVIOR:",
    ...flagsText,
    "",
    `Open dashboard: ${dashboardUrl}`,
    "",
    "You're receiving this daily because you lead a team on All Star.",
    "© All Star Life Group",
  ].join("\n");

  return { subject, html, text };
}
