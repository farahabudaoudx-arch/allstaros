import { createHash } from "node:crypto";
import type { ScorecardPeriod } from "./period";
import type { GatewayReport } from "./run";

export type PersonalGatewayImportEvidence = {
  id: string;
  person_id: string | null;
  period_type: string;
  status: string;
  report_date: string | null;
  gateway_label: string | null;
  source_checksum: string | null;
  matched_count: number | string | null;
  unmatched_count: number | string | null;
  ambiguous_count: number | string | null;
  summary: unknown;
  created_at: string;
};

export type PersonalGatewayPremiumRow = {
  id?: string;
  import_id: string | null;
  person_id: string;
  report_date: string;
  personal_ip_cents: number | string | null;
  team_ip_cents: number | string | null;
  first_leg_percent: number | string | null;
};

export type ResolvedPersonalGatewayEvidence = {
  audit: PersonalGatewayImportEvidence;
  sourceAudit: PersonalGatewayImportEvidence;
  kind: "matched" | "verified_zero";
  premiumRow: PersonalGatewayPremiumRow | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function numeric(value: number | string | null | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function personalGatewayMatchReason(summary: unknown): string | null {
  const root = record(summary);
  const samples = record(root?.samples);
  const value = samples?.matchReason;
  return typeof value === "string" && value ? value : null;
}

function existingImportId(summary: unknown): string | null {
  const value = record(summary)?.existingImportId;
  return typeof value === "string" && value ? value : null;
}

function evidenceKey(personId: string, reportDate: string): string {
  return `${personId}:${reportDate}`;
}

function laterAudit(
  left: PersonalGatewayImportEvidence | undefined,
  right: PersonalGatewayImportEvidence,
): PersonalGatewayImportEvidence {
  if (!left) return right;
  const dateOrder = right.created_at.localeCompare(left.created_at);
  if (dateOrder > 0) return right;
  if (dateOrder < 0) return left;
  return right.id.localeCompare(left.id) > 0 ? right : left;
}

function validPremiumRow(row: PersonalGatewayPremiumRow | null | undefined): row is PersonalGatewayPremiumRow {
  const personal = numeric(row?.personal_ip_cents);
  const team = numeric(row?.team_ip_cents);
  const firstLeg = row?.first_leg_percent == null ? null : numeric(row.first_leg_percent);
  return Boolean(
    row &&
    personal != null && personal >= 0 && Number.isInteger(personal) &&
    team != null && team >= 0 && Number.isInteger(team) &&
    (firstLeg == null || (firstLeg >= 0 && firstLeg <= 100)),
  );
}

/**
 * Resolve the latest exact-person/exact-date personal Gateway evidence.
 *
 * A missing premium row is zero only when the person's own latest usable audit
 * explicitly says target_npn_not_present. Any other missing/ambiguous state is
 * a hole. no_new_report is usable only through the exact imported audit it
 * references; it never creates evidence by itself.
 */
export function buildPersonalGatewayEvidenceIndex(
  imports: PersonalGatewayImportEvidence[],
  premiumRows: PersonalGatewayPremiumRow[],
): Map<string, ResolvedPersonalGatewayEvidence> {
  const importsById = new Map(imports.map((row) => [row.id, row]));
  const latestByPersonDate = new Map<string, PersonalGatewayImportEvidence>();
  for (const row of imports) {
    if (!row.person_id || !row.report_date || row.period_type !== "wtd") continue;
    const key = evidenceKey(row.person_id, row.report_date);
    latestByPersonDate.set(key, laterAudit(latestByPersonDate.get(key), row));
  }

  const premiumByPersonDate = new Map(
    premiumRows.map((row) => [evidenceKey(row.person_id, row.report_date), row]),
  );
  const result = new Map<string, ResolvedPersonalGatewayEvidence>();

  for (const [key, latest] of latestByPersonDate) {
    let sourceAudit = latest;
    if (latest.status === "no_new_report") {
      const referencedId = existingImportId(latest.summary);
      const referenced = referencedId ? importsById.get(referencedId) : null;
      if (
        !referenced ||
        referenced.status !== "imported" ||
        referenced.person_id !== latest.person_id ||
        referenced.report_date !== latest.report_date ||
        referenced.period_type !== "wtd"
      ) continue;
      sourceAudit = referenced;
    } else if (latest.status !== "imported") {
      continue;
    }

    if (numeric(sourceAudit.ambiguous_count) !== 0) continue;
    const reason = personalGatewayMatchReason(sourceAudit.summary);
    if (reason === "target_npn_not_present") {
      result.set(key, { audit: latest, sourceAudit, kind: "verified_zero", premiumRow: null });
      continue;
    }
    if (reason != null) continue;
    if (numeric(sourceAudit.matched_count) !== 1) continue;

    const premium = premiumByPersonDate.get(key);
    if (!validPremiumRow(premium) || premium.import_id !== sourceAudit.id) continue;
    result.set(key, { audit: latest, sourceAudit, kind: "matched", premiumRow: premium });
  }

  return result;
}

export function requiredGatewayMondays(
  period: Pick<ScorecardPeriod, "start" | "end">,
): string[] {
  const start = new Date(`${period.start}T00:00:00.000Z`);
  const end = new Date(`${period.end}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new Error("Gateway completeness requires a valid ordered Scorecard period.");
  }
  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    if (cursor.getUTCDay() === 1) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function chicagoDateOfInstant(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function summarizePersonalGatewayEvidence(input: {
  personIds: Iterable<string>;
  requiredDates: string[];
  imports: PersonalGatewayImportEvidence[];
  premiumRows: PersonalGatewayPremiumRow[];
}) {
  const index = buildPersonalGatewayEvidenceIndex(input.imports, input.premiumRows);
  const finalRequiredDate = input.requiredDates.at(-1) ?? null;
  const byPerson = new Map<string, {
    complete: boolean;
    finalWeekReady: boolean;
    missingDates: string[];
  }>();
  for (const personId of input.personIds) {
    const missingDates = input.requiredDates.filter((date) => !index.has(evidenceKey(personId, date)));
    byPerson.set(personId, {
      complete: input.requiredDates.length > 0 && missingDates.length === 0,
      finalWeekReady: finalRequiredDate != null && index.has(evidenceKey(personId, finalRequiredDate)),
      missingDates,
    });
  }
  return { byPerson, finalRequiredDate, evidence: index };
}

function integer(value: number | string | null): number {
  const parsed = numeric(value);
  if (parsed == null || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error("Personal Gateway premium contains an invalid integer value.");
  }
  return parsed;
}

/** Aggregate personal audits into one canonical WTD report per date. */
export function aggregatePersonalGatewayReports(input: {
  imports: PersonalGatewayImportEvidence[];
  premiumRows: PersonalGatewayPremiumRow[];
  personIds: Iterable<string>;
  start: string;
  end: string;
}): GatewayReport[] {
  const people = new Set(input.personIds);
  const calendarMondays = new Set(requiredGatewayMondays({ start: input.start, end: input.end }));
  const index = buildPersonalGatewayEvidenceIndex(input.imports, input.premiumRows);
  const byDate = new Map<string, Array<[string, ResolvedPersonalGatewayEvidence]>>();
  for (const evidence of index.values()) {
    const personId = evidence.audit.person_id;
    const reportDate = evidence.audit.report_date;
    if (!personId || !reportDate || !people.has(personId) || !calendarMondays.has(reportDate)) continue;
    const rows = byDate.get(reportDate) ?? [];
    rows.push([personId, evidence]);
    byDate.set(reportDate, rows);
  }

  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([reportDate, evidenceRows]) => {
      evidenceRows.sort(([left], [right]) => left.localeCompare(right));
      const hash = createHash("sha256");
      for (const [personId, evidence] of evidenceRows) {
        hash.update(`${personId}:${evidence.audit.id}:${evidence.audit.source_checksum ?? ""}:${evidence.kind}|`);
      }
      const checksum = hash.digest("hex");
      return {
        id: `personal-wtd:${reportDate}:${checksum.slice(0, 16)}`,
        periodType: "wtd" as const,
        reportDate,
        status: "published" as const,
        sourceChecksum: checksum,
        unmatchedCount: 0,
        ambiguousCount: 0,
        rows: evidenceRows.map(([personId, evidence]) => {
          if (evidence.kind === "verified_zero") {
            return { personId, personalIpCents: 0, teamIpCents: 0, firstLegPercent: null };
          }
          const premium = evidence.premiumRow!;
          const firstLeg = premium.first_leg_percent == null ? null : numeric(premium.first_leg_percent);
          return {
            personId,
            personalIpCents: integer(premium.personal_ip_cents),
            teamIpCents: integer(premium.team_ip_cents),
            firstLegPercent: firstLeg,
          };
        }),
      };
    });
}

export function personalGatewayEvidenceKey(personId: string, reportDate: string): string {
  return evidenceKey(personId, reportDate);
}
