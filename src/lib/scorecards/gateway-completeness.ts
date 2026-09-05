import { createHash } from "node:crypto";
import type { ScorecardPeriod } from "./period";
import type { GatewayReport } from "./run";

export type PersonalGatewayImportEvidence = {
  id: string;
  person_id: string | null;
  source_kind?: string | null;
  pull_kind?: string | null;
  period_type: string;
  status: string;
  report_date: string | null;
  period_start?: string | null;
  gateway_label: string | null;
  source_checksum: string | null;
  scorecard_period_start?: string | null;
  scorecard_period_end?: string | null;
  gateway_week_ordinal?: number | string | null;
  gateway_period_final?: boolean | null;
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
  source_kind?: string | null;
  report_date: string;
  period_start?: string | null;
  scorecard_period_start?: string | null;
  scorecard_period_end?: string | null;
  gateway_week_ordinal?: number | string | null;
  gateway_period_final?: boolean | null;
  personal_ip_cents: number | string | null;
  team_ip_cents: number | string | null;
  first_leg_percent: number | string | null;
};

export type ResolvedPersonalGatewayEvidence = {
  audit: PersonalGatewayImportEvidence;
  sourceAudit: PersonalGatewayImportEvidence;
  kind: "matched" | "verified_zero";
  premiumRow: PersonalGatewayPremiumRow | null;
  identity: GatewayWeekIdentity;
};

export type GatewayWeekIdentity = {
  periodStart: string | null;
  periodEnd: string | null;
  weekOrdinal: number | null;
  periodFinal: boolean;
  weekDate: string;
  weekStart?: string | null;
  scoped: boolean;
};

export type GatewayWeekRequirement = {
  periodStart: string;
  periodEnd: string;
  weekOrdinal: number;
  periodFinal?: boolean;
};

export function canonicalGatewayReportIdentity(report: GatewayReport): string {
  if (
    report.periodType === "wtd" &&
    report.scorecardPeriodStart &&
    Number.isInteger(report.gatewayWeekOrdinal) &&
    (report.gatewayWeekOrdinal ?? 0) > 0
  ) {
    return `coverage:${report.scorecardPeriodStart}:w${report.gatewayWeekOrdinal}`;
  }
  return `date:${report.reportDate}`;
}

export function canonicalGatewayReportSortKey(report: GatewayReport): string {
  if (report.scorecardPeriodStart && Number.isInteger(report.gatewayWeekOrdinal)) {
    return `${report.scorecardPeriodStart}:${String(report.gatewayWeekOrdinal).padStart(2, "0")}:${report.reportDate}`;
  }
  return `${report.reportDate}:legacy`;
}

export function gatewayReportInScorecardPeriod(
  report: GatewayReport,
  period: Pick<ScorecardPeriod, "start" | "end">,
): boolean {
  if (report.scorecardPeriodStart) {
    const coveredEnd = report.scorecardPeriodEnd ?? report.scorecardPeriodStart;
    return coveredEnd >= period.start && report.scorecardPeriodStart <= period.end;
  }
  return report.reportDate >= period.start && report.reportDate <= period.end;
}

export function latestCanonicalGatewayReports(
  reports: GatewayReport[],
  through: string,
  limit = 6,
): GatewayReport[] {
  const unique = new Map<string, GatewayReport>();
  for (const report of reports) {
    if (report.periodType !== "wtd" || report.status !== "published") continue;
    const effectiveStart = report.scorecardPeriodStart ?? report.reportDate;
    if (effectiveStart > through) continue;
    unique.set(canonicalGatewayReportIdentity(report), report);
  }
  return [...unique.values()]
    .sort((left, right) => canonicalGatewayReportSortKey(right).localeCompare(canonicalGatewayReportSortKey(left)))
    .slice(0, limit);
}

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

function isoDay(value: string | null | undefined): string | null {
  const day = value?.slice(0, 10) ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function sourceIsPersonal(sourceKind: string | null | undefined): boolean {
  // Tests and pre-hardening in-memory fixtures do not carry source_kind. The
  // persisted migration makes the column non-null, so an explicit legacy value
  // is always rejected while undefined remains backwards-compatible for pure tests.
  return sourceKind == null || sourceKind === "personal_gateway";
}

function coverageKey(personId: string, periodStart: string, weekOrdinal: number): string {
  return `${personId}:coverage:${periodStart}:w${weekOrdinal}`;
}

function fallbackEvidenceKey(personId: string, weekDate: string): string {
  return `${personId}:unscoped:${weekDate}`;
}

function syntheticWeekDate(periodStart: string, weekOrdinal: number): string {
  const date = new Date(`${periodStart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + (weekOrdinal - 1) * 7);
  return date.toISOString().slice(0, 10);
}

function isCalendarMonday(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.getUTCDay() === 1;
}

function weekIdentity(row: {
  summary?: unknown;
  period_start?: string | null;
  report_date: string | null;
  scorecard_period_start?: string | null;
  scorecard_period_end?: string | null;
  gateway_week_ordinal?: number | string | null;
  gateway_period_final?: boolean | null;
}): GatewayWeekIdentity | null {
  const suppliedWeekStart = record(row.summary)?.gatewayWeekStart;
  const periodStart = isoDay(row.scorecard_period_start);
  const periodEnd = isoDay(row.scorecard_period_end);
  const weekOrdinalRaw = numeric(row.gateway_week_ordinal);
  const weekOrdinal = weekOrdinalRaw != null && Number.isInteger(weekOrdinalRaw) && weekOrdinalRaw > 0
    ? weekOrdinalRaw
    : null;
  const filePeriodStart = isoDay(row.period_start);
  const acquisitionDate = isoDay(row.report_date);
  if (periodStart && periodEnd && weekOrdinal != null) {
    return {
      periodStart,
      periodEnd,
      weekOrdinal,
      periodFinal: row.gateway_period_final === true,
      weekStart: typeof suppliedWeekStart === "string" ? isoDay(suppliedWeekStart) : null,
      weekDate: filePeriodStart ?? syntheticWeekDate(periodStart, weekOrdinal),
      scoped: true,
    };
  }
  const weekDate = filePeriodStart ?? acquisitionDate;
  if (!weekDate) return null;
  return {
    periodStart: null,
    periodEnd: null,
    weekOrdinal: null,
    periodFinal: false,
    weekDate,
    scoped: false,
  };
}

function identityKey(personId: string, identity: GatewayWeekIdentity): string {
  return identity.scoped
    ? coverageKey(personId, identity.periodStart!, identity.weekOrdinal!)
    : fallbackEvidenceKey(personId, identity.weekDate);
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
  const latestByIdentity = new Map<string, PersonalGatewayImportEvidence>();
  for (const row of imports) {
    if (!row.person_id || row.period_type !== "wtd" || !sourceIsPersonal(row.source_kind)) continue;
    const identity = weekIdentity(row);
    if (!identity) continue;
    const key = identityKey(row.person_id, identity);
    latestByIdentity.set(key, laterAudit(latestByIdentity.get(key), row));
  }

  const premiumByIdentity = new Map<string, PersonalGatewayPremiumRow>();
  for (const row of premiumRows) {
    if (!sourceIsPersonal(row.source_kind)) continue;
    const identity = weekIdentity(row);
    if (!identity) continue;
    premiumByIdentity.set(identityKey(row.person_id, identity), row);
  }
  const result = new Map<string, ResolvedPersonalGatewayEvidence>();

  for (const [key, latest] of latestByIdentity) {
    const latestIdentity = weekIdentity(latest);
    if (!latestIdentity || !latest.person_id) continue;
    let sourceAudit = latest;
    if (latest.status === "no_new_report") {
      const referencedId = existingImportId(latest.summary);
      const referenced = referencedId ? importsById.get(referencedId) : null;
      const referencedIdentity = referenced ? weekIdentity(referenced) : null;
      if (
        !referenced ||
        referenced.status !== "imported" ||
        referenced.person_id !== latest.person_id ||
        referenced.period_type !== "wtd" ||
        !sourceIsPersonal(referenced.source_kind) ||
        !referencedIdentity ||
        identityKey(referenced.person_id, referencedIdentity) !== key
      ) continue;
      sourceAudit = referenced;
    } else if (latest.status !== "imported") {
      continue;
    }

    if (numeric(sourceAudit.ambiguous_count) !== 0) continue;
    const reason = personalGatewayMatchReason(sourceAudit.summary);
    if (reason === "target_npn_not_present") {
      result.set(key, {
        audit: latest,
        sourceAudit,
        kind: "verified_zero",
        premiumRow: null,
        identity: latestIdentity,
      });
      continue;
    }
    if (reason != null) continue;
    if (numeric(sourceAudit.matched_count) !== 1) continue;

    const premium = premiumByIdentity.get(key);
    if (!validPremiumRow(premium) || premium.import_id !== sourceAudit.id) continue;
    result.set(key, {
      audit: latest,
      sourceAudit,
      kind: "matched",
      premiumRow: premium,
      identity: latestIdentity,
    });
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

function addMonths(monthStart: string, delta: number): string {
  const date = new Date(`${monthStart}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + delta, 1);
  return date.toISOString().slice(0, 10);
}

function canonicalMonthEnd(monthStart: string): string {
  const next = new Date(`${addMonths(monthStart, 1)}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() - 1);
  return next.toISOString().slice(0, 10);
}

function calendarMonthStarts(start: string, end: string): string[] {
  const first = `${start.slice(0, 7)}-01`;
  const result: string[] = [];
  for (let month = first; month <= end; month = addMonths(month, 1)) result.push(month);
  return result;
}

export type GatewayPeriodRequirements = {
  ready: boolean;
  requiredWeeks: GatewayWeekRequirement[];
  finalWeeks: GatewayWeekRequirement[];
  missingMonthStarts: string[];
};

/**
 * Derive the actual Gateway week count for each calendar month from explicit
 * period-final metadata supplied by the runner. A first-connect backfill may
 * populate history, but it is never enough to discover an automatic publishing
 * trigger on its own.
 */
export function gatewayPeriodRequirements(
  imports: PersonalGatewayImportEvidence[],
  period: Pick<ScorecardPeriod, "start" | "end">,
  options: { ongoingOnly?: boolean } = {},
): GatewayPeriodRequirements {
  const ongoingOnly = options.ongoingOnly === true;
  const finalOrdinalByMonth = new Map<string, number>();
  for (const row of imports) {
    if (
      row.period_type !== "wtd" ||
      !sourceIsPersonal(row.source_kind) ||
      !["imported", "no_new_report"].includes(row.status) ||
      row.gateway_period_final !== true ||
      (ongoingOnly && row.pull_kind === "first_connect")
    ) continue;
    const monthStart = isoDay(row.scorecard_period_start);
    const monthEnd = isoDay(row.scorecard_period_end);
    const ordinalRaw = numeric(row.gateway_week_ordinal);
    if (
      !monthStart || !monthEnd || monthStart < period.start || monthStart > period.end ||
      monthEnd !== canonicalMonthEnd(monthStart) || ordinalRaw == null ||
      !Number.isInteger(ordinalRaw) || ordinalRaw < 1 || ordinalRaw > 8
    ) continue;
    finalOrdinalByMonth.set(monthStart, Math.max(finalOrdinalByMonth.get(monthStart) ?? 0, ordinalRaw));
  }

  const requiredWeeks: GatewayWeekRequirement[] = [];
  const finalWeeks: GatewayWeekRequirement[] = [];
  const missingMonthStarts: string[] = [];
  for (const monthStart of calendarMonthStarts(period.start, period.end)) {
    const finalOrdinal = finalOrdinalByMonth.get(monthStart);
    if (!finalOrdinal) {
      missingMonthStarts.push(monthStart);
      continue;
    }
    const periodEnd = canonicalMonthEnd(monthStart);
    for (let weekOrdinal = 1; weekOrdinal <= finalOrdinal; weekOrdinal += 1) {
      const requirement = {
        periodStart: monthStart,
        periodEnd,
        weekOrdinal,
        periodFinal: weekOrdinal === finalOrdinal,
      };
      requiredWeeks.push(requirement);
      if (requirement.periodFinal) finalWeeks.push(requirement);
    }
  }
  return {
    ready: missingMonthStarts.length === 0 && finalWeeks.length > 0,
    requiredWeeks,
    finalWeeks,
    missingMonthStarts,
  };
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
  requiredDates?: string[];
  requiredWeeks?: GatewayWeekRequirement[];
  imports: PersonalGatewayImportEvidence[];
  premiumRows: PersonalGatewayPremiumRow[];
}) {
  const index = buildPersonalGatewayEvidenceIndex(input.imports, input.premiumRows);
  const requiredDates = input.requiredDates ?? [];
  const requiredWeeks = input.requiredWeeks ?? [];
  const finalRequiredDate = requiredDates.at(-1) ?? null;
  const byPerson = new Map<string, {
    complete: boolean;
    finalWeekReady: boolean;
    missingDates: string[];
    missingWeeks: GatewayWeekRequirement[];
  }>();
  for (const personId of input.personIds) {
    const missingWeeks = requiredWeeks.filter((week) =>
      !index.has(coverageKey(personId, week.periodStart, week.weekOrdinal)));
    const missingDates = requiredDates.filter((date) =>
      !index.has(fallbackEvidenceKey(personId, date)) &&
      ![...index.values()].some((evidence) =>
        evidence.audit.person_id === personId && evidence.identity.weekDate === date));
    const finalWeeks = requiredWeeks.filter((week) => week.periodFinal === true);
    const finalWeeksReady = finalWeeks.length > 0 && finalWeeks.every((week) =>
      index.has(coverageKey(personId, week.periodStart, week.weekOrdinal)));
    const legacyFinalReady = finalRequiredDate != null && (
      index.has(fallbackEvidenceKey(personId, finalRequiredDate)) ||
      [...index.values()].some((evidence) =>
        evidence.audit.person_id === personId && evidence.identity.weekDate === finalRequiredDate)
    );
    const hasRequirements = requiredWeeks.length > 0 || requiredDates.length > 0;
    byPerson.set(personId, {
      complete: hasRequirements && missingWeeks.length === 0 && missingDates.length === 0,
      finalWeekReady: requiredWeeks.length > 0 ? finalWeeksReady : legacyFinalReady,
      missingDates,
      missingWeeks,
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

/** Aggregate current personal audits into canonical WTD buckets by the covered
 * Gateway week. report_date remains acquisition metadata in storage and is never
 * used as the Scorecard bucket identity here. */
export function aggregatePersonalGatewayReports(input: {
  imports: PersonalGatewayImportEvidence[];
  premiumRows: PersonalGatewayPremiumRow[];
  personIds: Iterable<string>;
  start: string;
  end: string;
}): GatewayReport[] {
  const people = new Set(input.personIds);
  const index = buildPersonalGatewayEvidenceIndex(input.imports, input.premiumRows);
  const byIdentity = new Map<string, {
    reportDate: string;
    identity: GatewayWeekIdentity;
    evidenceRows: Array<[string, ResolvedPersonalGatewayEvidence]>;
  }>();
  for (const evidence of index.values()) {
    const personId = evidence.audit.person_id;
    const reportDate = evidence.identity.weekDate;
    const insideCoverage = evidence.identity.scoped
      ? evidence.identity.periodEnd! >= input.start && evidence.identity.periodStart! <= input.end
      : reportDate >= input.start && reportDate <= input.end;
    // Historical personal rows written before coverage metadata retain their
    // old Monday-only interpretation. New scoped rows never use this fallback.
    if (
      !personId || !people.has(personId) || !insideCoverage ||
      (!evidence.identity.scoped && !isCalendarMonday(reportDate))
    ) continue;
    const bucketKey = evidence.identity.scoped
      ? `coverage:${evidence.identity.periodStart}:w${evidence.identity.weekOrdinal}`
      : `date:${reportDate}`;
    const bucket = byIdentity.get(bucketKey) ?? {
      reportDate,
      identity: { ...evidence.identity },
      evidenceRows: [],
    };
    // File/acquisition dates are metadata, not identity. Keep one deterministic
    // display date even if two people received the same canonical week on
    // different days.
    if (reportDate < bucket.reportDate) bucket.reportDate = reportDate;
    if (bucket.identity.weekStart !== evidence.identity.weekStart) bucket.identity.weekStart = null;
    bucket.evidenceRows.push([personId, evidence]);
    byIdentity.set(bucketKey, bucket);
  }

  return [...byIdentity.entries()]
    .sort(([, left], [, right]) => {
      const leftStart = left.identity.periodStart ?? left.reportDate;
      const rightStart = right.identity.periodStart ?? right.reportDate;
      return leftStart.localeCompare(rightStart)
        || (left.identity.weekOrdinal ?? 0) - (right.identity.weekOrdinal ?? 0)
        || left.reportDate.localeCompare(right.reportDate);
    })
    .map(([bucketKey, bucket]) => {
      const { reportDate, evidenceRows, identity } = bucket;
      evidenceRows.sort(([left], [right]) => left.localeCompare(right));
      const hash = createHash("sha256");
      for (const [personId, evidence] of evidenceRows) {
        hash.update(`${personId}:${evidence.audit.id}:${evidence.audit.source_checksum ?? ""}:${evidence.kind}|`);
      }
      const checksum = hash.digest("hex");
      return {
        id: `personal-wtd:${bucketKey}:${checksum.slice(0, 16)}`,
        periodType: "wtd" as const,
        reportDate,
        scorecardPeriodStart: identity.periodStart,
        scorecardPeriodEnd: identity.periodEnd,
        gatewayWeekOrdinal: identity.weekOrdinal,
        gatewayWeekStart: identity.weekStart ?? null,
        gatewayPeriodFinal: identity.periodFinal,
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
  return fallbackEvidenceKey(personId, reportDate);
}

export function personalGatewayCoverageEvidenceKey(
  personId: string,
  periodStart: string,
  weekOrdinal: number,
): string {
  return coverageKey(personId, periodStart, weekOrdinal);
}
