import type { SupabaseClient } from "@supabase/supabase-js";
import { approvedPhotoUrl, type PhotoFields } from "@/lib/headshots/photo";
import {
  computeAnalytics,
  dollarsToCents,
  fetchAllRows,
  isSale,
  saleDay,
  type ClientSaleFields,
} from "@/lib/producer/metrics";
import {
  createProducerOverview,
  type MonthlyProducerSource,
  type ProducerActivityRow,
  type ProducerOverview,
} from "./lifecycle";
import {
  buildPersonalGatewayEvidenceIndex,
  type PersonalGatewayImportEvidence,
  type PersonalGatewayPremiumRow,
} from "./gateway-completeness";
import { previousEquivalentPeriod, type ScorecardPeriod } from "./period";
import { installationTimezone } from "@/lib/installation/runtime";

const SCORECARD_TZ = installationTimezone();

type GatewayWeekRow = {
  person_id: string;
  report_key?: string;
  report_date: string;
  gateway_label: string | null;
  personal_ip_cents: number | null;
};

type GatewayWeekImport = {
  report_key?: string;
  report_date: string;
  gateway_label: string | null;
};

function datePartsInChicago(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCORECARD_TZ,
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function dayOfDateColumn(value: string | null | undefined): string | null {
  const day = value?.slice(0, 10) ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function dayOfInstantInChicago(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCORECARD_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function currentMonthlyPeriod(now = new Date()): {
  start: string;
  end: string;
  label: string;
} {
  const { year, month } = datePartsInChicago(now);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthName = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return {
    start: `${year}-${pad2(month)}-01`,
    end: `${year}-${pad2(month)}-${pad2(lastDay)}`,
    label: `${monthName} ${year}`,
  };
}

export function monthlyProducerSourceFromRows(args: {
  producerId: string;
  period: { start: string; end: string; label: string };
  reportImports: GatewayWeekImport[];
  rows: GatewayWeekRow[];
  generatedAt: string;
}): MonthlyProducerSource {
  const reportByKey = new Map<string, { reportKey?: string; reportDate: string; label: string }>();
  const producerRows: MonthlyProducerSource["producerRows"] = [];

  for (const report of args.reportImports) {
    const reportKey = report.report_key ?? `date:${report.report_date}`;
    if (!reportByKey.has(reportKey)) {
      reportByKey.set(reportKey, {
        ...(report.report_key ? { reportKey: report.report_key } : {}),
        reportDate: report.report_date,
        label: report.gateway_label?.trim() || formatReportDate(report.report_date),
      });
    }
  }
  for (const row of args.rows) {
    if (row.person_id !== args.producerId) continue;
    if (!Number.isInteger(row.personal_ip_cents) || (row.personal_ip_cents ?? -1) < 0) continue;
    producerRows.push({
      ...(row.report_key ? { reportKey: row.report_key } : {}),
      reportDate: row.report_date,
      personalIpCents: row.personal_ip_cents!,
    });
  }

  return {
    producerId: args.producerId,
    periodStart: args.period.start,
    periodEnd: args.period.end,
    periodLabel: args.period.label,
    reportDates: [...reportByKey.values()],
    producerRows,
    generatedAt: args.generatedAt,
  };
}

/** Server-only source adapter. Scorecard WTD dates are personal, Monday-only
 * evidence. Another member's audit can never create a report date or a zero for
 * this producer. */
export async function loadProducerSourceForPeriod(
  supabase: SupabaseClient,
  producerId: string,
  period: Pick<ScorecardPeriod, "start" | "end" | "label">,
  generatedAt = new Date(),
): Promise<MonthlyProducerSource> {
  let importsResult;
  let rowsResult;
  try {
    [importsResult, rowsResult] = await Promise.all([
      supabase
        .from("gateway_issued_premium_import")
        .select("id, person_id, source_kind, pull_kind, period_type, status, report_date, period_start, gateway_label, source_checksum, scorecard_period_start, scorecard_period_end, gateway_week_ordinal, gateway_period_final, matched_count, unmatched_count, ambiguous_count, summary, created_at")
        .eq("person_id", producerId)
        .eq("source_kind", "personal_gateway")
        .eq("period_type", "wtd")
        .order("created_at", { ascending: true }),
      supabase
        .from("producer_issued_premium")
        .select("id, import_id, person_id, source_kind, report_date, period_start, gateway_label, scorecard_period_start, scorecard_period_end, gateway_week_ordinal, gateway_period_final, personal_ip_cents, team_ip_cents, first_leg_percent")
        .eq("person_id", producerId)
        .eq("source_kind", "personal_gateway")
        .eq("period_type", "wtd")
        .order("updated_at", { ascending: true }),
    ]);
  } catch (error) {
    throw scorecardSourceError("Gateway issued premium", error);
  }
  if (importsResult.error) throw scorecardSourceError("Gateway report coverage", importsResult.error);
  if (rowsResult.error) throw scorecardSourceError("Producer personal IP", rowsResult.error);

  const imports = (importsResult.data ?? []) as PersonalGatewayImportEvidence[];
  const premiums = (rowsResult.data ?? []) as Array<PersonalGatewayPremiumRow & { gateway_label?: string | null }>;
  const evidence = buildPersonalGatewayEvidenceIndex(imports, premiums);
  const reportImports: GatewayWeekImport[] = [];
  const rows: GatewayWeekRow[] = [];
  for (const resolved of [...evidence.values()].sort((left, right) =>
    left.identity.weekDate.localeCompare(right.identity.weekDate)
      || (left.identity.weekOrdinal ?? 0) - (right.identity.weekOrdinal ?? 0))) {
    if (resolved.audit.person_id !== producerId) continue;
    const identity = resolved.identity;
    const insidePeriod = identity.scoped
      ? identity.periodStart! >= period.start && identity.periodStart! <= period.end
      : identity.weekDate >= period.start && identity.weekDate <= period.end;
    if (!insidePeriod) continue;
    const reportDate = identity.weekDate;
    const reportKey = identity.scoped
      ? `coverage:${identity.periodStart}:w${identity.weekOrdinal}`
      : `date:${reportDate}`;
    reportImports.push({
      report_key: reportKey,
      report_date: reportDate,
      gateway_label: resolved.audit.gateway_label,
    });
    rows.push({
      person_id: producerId,
      report_key: reportKey,
      report_date: reportDate,
      gateway_label: resolved.audit.gateway_label,
      personal_ip_cents: resolved.kind === "verified_zero"
        ? 0
        : Number(resolved.premiumRow!.personal_ip_cents),
    });
  }

  return monthlyProducerSourceFromRows({
    producerId,
    period,
    reportImports,
    rows,
    generatedAt: generatedAt.toISOString(),
  });
}

export async function loadCurrentMonthlyProducerSource(
  supabase: SupabaseClient,
  producerId: string,
  now = new Date(),
): Promise<MonthlyProducerSource> {
  return loadProducerSourceForPeriod(supabase, producerId, currentMonthlyPeriod(now), now);
}

export function rankForTotal(value: number, totals: Iterable<number>): { rank: number; population: number } {
  const sorted = [...totals].sort((a, b) => b - a);
  const rankIndex = sorted.findIndex((total) => total === value);
  if (rankIndex < 0) throw new Error("Unable to establish organization metric rank.");
  return { rank: rankIndex + 1, population: sorted.length };
}

export function rankForPositiveTotal(value: number, totals: Iterable<number>): { rank: number | null; population: number } {
  const sorted = [...totals].filter((total) => total > 0).sort((a, b) => b - a);
  if (value <= 0) return { rank: null, population: sorted.length };
  const rankIndex = sorted.findIndex((total) => total === value);
  if (rankIndex < 0) throw new Error("Unable to establish organization metric rank.");
  return { rank: rankIndex + 1, population: sorted.length };
}

type LeadSpendRow = {
  person_id: string;
  amount: number | string | null;
  purchase_date: string | null;
  created_at: string | null;
};

export function monthlyLeadSpendTotals(args: {
  activeIds: Iterable<string>;
  period: { start: string; end: string };
  rows: LeadSpendRow[];
}): Map<string, number> {
  const totals = new Map([...args.activeIds].map((id) => [id, 0]));
  for (const row of args.rows) {
    if (!totals.has(row.person_id)) continue;
    const day = dayOfDateColumn(row.purchase_date) ?? dayOfInstantInChicago(row.created_at);
    if (!day || day < args.period.start || day > args.period.end) continue;
    totals.set(row.person_id, (totals.get(row.person_id) ?? 0) + dollarsToCents(row.amount));
  }
  return totals;
}

type ProducerSourcePeriod = { start: string; end: string };

type TrackerSourceRow = {
  person_id: string;
  entry_date: string;
  leads: number | string | null;
  dials: number | string | null;
  contacts: number | string | null;
  appointments: number | string | null;
  presentations: number | string | null;
  sales: number | string | null;
};

function scorecardSourceError(source: string, error: unknown): Error {
  const detail = error instanceof Error
    ? error.message
    : typeof error === "object" && error != null && "message" in error
      ? String((error as { message?: unknown }).message ?? "unknown source error")
      : String(error ?? "unknown source error");
  return new Error(`Unable to load Scorecard ${source}: ${detail}`);
}

function nullableFiniteNumber(value: number | string | null): number | null {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export async function loadProducerTrackingRows(
  supabase: SupabaseClient,
  producerId: string,
  period: ProducerSourcePeriod,
): Promise<ProducerActivityRow[]> {
  let result;
  try {
    result = await supabase
      .from("tracker_entry")
      .select("person_id, entry_date, leads, dials, contacts, appointments, presentations, sales")
      .eq("person_id", producerId)
      .gte("entry_date", period.start)
      .lte("entry_date", period.end);
  } catch (error) {
    throw scorecardSourceError("Tracking", error);
  }
  if (result.error) throw scorecardSourceError("Tracking", result.error);

  const rows = (result.data ?? []) as TrackerSourceRow[];
  return rows.flatMap<ProducerActivityRow>((row) => {
    const entryDate = dayOfDateColumn(row.entry_date);
    if (row.person_id !== producerId || !entryDate || entryDate < period.start || entryDate > period.end) {
      return [];
    }
    return [{
      entryDate,
      leads: nullableFiniteNumber(row.leads),
      dials: nullableFiniteNumber(row.dials),
      contacts: nullableFiniteNumber(row.contacts),
      appointments: nullableFiniteNumber(row.appointments),
      presentations: nullableFiniteNumber(row.presentations),
      sales: nullableFiniteNumber(row.sales),
    }];
  });
}

export async function loadProducerLeadSpendCents(
  supabase: SupabaseClient,
  producerId: string,
  period: ProducerSourcePeriod,
): Promise<number> {
  try {
    const analytics = await computeAnalytics(supabase, producerId, {
      rangeKey: "custom",
      tz: SCORECARD_TZ,
      from: period.start,
      to: period.end,
    });
    const cents = analytics.totals.leadSpend_cents;
    return Number.isFinite(cents) && cents >= 0 ? Math.round(cents) : 0;
  } catch (error) {
    throw scorecardSourceError("Lead Spend", error);
  }
}

export async function loadProducerOverviewForPeriod(
  supabase: SupabaseClient,
  producer: {
    id: string;
    full_name: string;
  } & PhotoFields,
  currentIssuedIpCents: number,
  period: ScorecardPeriod,
  now = new Date(),
): Promise<ProducerOverview> {
  const prior = previousEquivalentPeriod(period);
  const [
    clientRows,
    activityRows,
    priorActivityRows,
    leadSpendCents,
    priorLeadSpendCents,
    organizationClientRows,
    organizationTrackerRows,
    organizationLeadSpendRows,
    currentPremiumRows,
    priorPremiumRows,
    peopleResult,
    scheduleResult,
    currentImportsResult,
    priorImportsResult,
  ] = await Promise.all([
    fetchAllRows<ClientSaleFields & { id: string }>((lo, hi) =>
      supabase
        .from("clients")
        .select("id, annual_premium, sale_status, submit_date, date, created_at")
        .eq("person_id", producer.id)
        .order("id")
        .range(lo, hi),
    ),
    loadProducerTrackingRows(supabase, producer.id, period),
    loadProducerTrackingRows(supabase, producer.id, prior),
    loadProducerLeadSpendCents(supabase, producer.id, period),
    loadProducerLeadSpendCents(supabase, producer.id, prior),
    fetchAllRows<ClientSaleFields & { id: string; person_id: string }>((lo, hi) =>
        supabase
          .from("clients")
          .select("id, person_id, annual_premium, sale_status, submit_date, date, created_at")
          .order("id")
          .range(lo, hi),
      ),
      fetchAllRows<{
        id: string;
        person_id: string;
        entry_date: string;
        dials: number | null;
        contacts: number | null;
        appointments: number | null;
        presentations: number | null;
        sales: number | null;
      }>((lo, hi) =>
        supabase
          .from("tracker_entry")
          .select("id, person_id, entry_date, dials, contacts, appointments, presentations, sales")
          .gte("entry_date", period.start)
          .lte("entry_date", period.end)
          .order("id")
          .range(lo, hi),
      ),
      fetchAllRows<LeadSpendRow & { id: string }>((lo, hi) =>
        supabase
          .from("lead_purchases")
          .select("id, person_id, amount, purchase_date, created_at")
          .order("id")
          .range(lo, hi),
      ),
      fetchAllRows<PersonalGatewayPremiumRow & { id: string }>((lo, hi) =>
        supabase
          .from("producer_issued_premium")
          .select("id, import_id, person_id, source_kind, report_date, period_start, scorecard_period_start, scorecard_period_end, gateway_week_ordinal, gateway_period_final, personal_ip_cents, team_ip_cents, first_leg_percent")
          .eq("source_kind", "personal_gateway")
          .eq("period_type", "wtd")
          .order("id")
          .range(lo, hi),
      ),
      fetchAllRows<PersonalGatewayPremiumRow & { id: string }>((lo, hi) =>
        supabase
          .from("producer_issued_premium")
          .select("id, import_id, person_id, source_kind, report_date, period_start, scorecard_period_start, scorecard_period_end, gateway_week_ordinal, gateway_period_final, personal_ip_cents, team_ip_cents, first_leg_percent")
          .eq("source_kind", "personal_gateway")
          .eq("period_type", "wtd")
          .order("id")
          .range(lo, hi),
      ),
      supabase
        .from("person")
        .select("id")
        .eq("status", "active")
        .eq("is_producer", true),
      supabase
        .from("member_work_schedule")
        .select("id, effective_from, effective_to, working_weekdays, created_at")
        .eq("person_id", producer.id)
        .lte("effective_from", period.end)
        .or(`effective_to.is.null,effective_to.gte.${period.start}`)
        .order("effective_from", { ascending: true })
        .order("created_at", { ascending: true }),
      fetchAllRows<PersonalGatewayImportEvidence & { id: string }>((lo, hi) =>
        supabase.from("gateway_issued_premium_import")
          .select("id, person_id, source_kind, pull_kind, period_type, status, report_date, period_start, gateway_label, source_checksum, scorecard_period_start, scorecard_period_end, gateway_week_ordinal, gateway_period_final, matched_count, unmatched_count, ambiguous_count, summary, created_at")
          .not("person_id", "is", null)
          .eq("source_kind", "personal_gateway")
          .eq("period_type", "wtd")
          .order("id")
          .range(lo, hi),
      ),
      fetchAllRows<PersonalGatewayImportEvidence & { id: string }>((lo, hi) =>
        supabase.from("gateway_issued_premium_import")
          .select("id, person_id, source_kind, pull_kind, period_type, status, report_date, period_start, gateway_label, source_checksum, scorecard_period_start, scorecard_period_end, gateway_week_ordinal, gateway_period_final, matched_count, unmatched_count, ambiguous_count, summary, created_at")
          .not("person_id", "is", null)
          .eq("source_kind", "personal_gateway")
          .eq("period_type", "wtd")
          .order("id")
          .range(lo, hi),
      ),
    ]);
  if (peopleResult.error) throw new Error(`Unable to load rank population: ${peopleResult.error.message}`);

  let submittedApCents = 0;
  let priorSubmittedApCents = 0;
  let submittedApAvailable = true;
  let priorSubmittedApAvailable = true;
  for (const client of clientRows) {
    const day = saleDay(client, SCORECARD_TZ);
    if (isSale(client) && day && day >= period.start && day <= period.end) {
      if (typeof client.annual_premium !== "number" || !Number.isFinite(client.annual_premium)) {
        submittedApAvailable = false;
      } else {
        submittedApCents += dollarsToCents(client.annual_premium);
      }
    }
    if (isSale(client) && day && day >= prior.start && day <= prior.end) {
      if (typeof client.annual_premium !== "number" || !Number.isFinite(client.annual_premium)) {
        priorSubmittedApAvailable = false;
      } else {
        priorSubmittedApCents += dollarsToCents(client.annual_premium);
      }
    }
  }


  const activeIds = new Set(
    ((peopleResult.data ?? []) as Array<{ id: string }>).map((person) => person.id),
  );
  if (!activeIds.has(producer.id)) {
    throw new Error("Producer is not in the active Producer ranking population.");
  }
  const organizationApTotals = new Map([...activeIds].map((id) => [id, 0]));
  for (const client of organizationClientRows) {
    if (!activeIds.has(client.person_id)) continue;
    const day = saleDay(client, SCORECARD_TZ);
    if (!isSale(client) || !day || day < period.start || day > period.end) continue;
    if (typeof client.annual_premium !== "number" || !Number.isFinite(client.annual_premium)) continue;
    organizationApTotals.set(
      client.person_id,
      (organizationApTotals.get(client.person_id) ?? 0) + dollarsToCents(client.annual_premium),
    );
  }
  const activityMetricKeys = ["dials", "contacts", "presentations", "sales"] as const;
  const organizationActivityTotals = Object.fromEntries(
    activityMetricKeys.map((metric) => [metric, new Map([...activeIds].map((id) => [id, 0]))]),
  ) as Record<(typeof activityMetricKeys)[number], Map<string, number>>;
  for (const row of organizationTrackerRows) {
    if (!activeIds.has(row.person_id)) continue;
    for (const metric of activityMetricKeys) {
      const value = row[metric];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      organizationActivityTotals[metric].set(
        row.person_id,
        (organizationActivityTotals[metric].get(row.person_id) ?? 0) + value,
      );
    }
  }
  const organizationTrackedDates = new Map([...activeIds].map((id) => [id, new Set<string>()]));
  for (const row of organizationTrackerRows) {
    if (!activeIds.has(row.person_id)) continue;
    organizationTrackedDates.get(row.person_id)?.add(String(row.entry_date));
  }
  const submittedApRank = rankForPositiveTotal(organizationApTotals.get(producer.id) ?? 0, organizationApTotals.values());
  // Legacy organization-rank context still uses one bulk read here. #012 fixed scoring
  // does not consume these ranks; scored Lead Spend above uses the canonical SQL RPC.
  // Avoid replacing this with per-person RPC calls (N+1) as part of #014.
  const organizationLeadSpendTotals = monthlyLeadSpendTotals({
    activeIds,
    period,
    rows: organizationLeadSpendRows,
  });
  const leadSpendRank = rankForPositiveTotal(
    organizationLeadSpendTotals.get(producer.id) ?? 0,
    organizationLeadSpendTotals.values(),
  );
  const organizationRanks = Object.fromEntries(
    activityMetricKeys.map((metric) => [
      metric,
      rankForPositiveTotal(
        organizationActivityTotals[metric].get(producer.id) ?? 0,
        organizationActivityTotals[metric].values(),
      ),
    ]),
  ) as Omit<ProducerOverview["organizationRanks"], "submittedAp" | "leadSpend" | "trackingConsistency">;
  const trackingConsistencyRank = rankForPositiveTotal(
    organizationTrackedDates.get(producer.id)?.size ?? 0,
    [...organizationTrackedDates.values()].map((dates) => dates.size),
  );
  const totalsByPerson = new Map([...activeIds].map((id) => [id, 0]));
  const currentEvidence = buildPersonalGatewayEvidenceIndex(currentImportsResult, currentPremiumRows);
  for (const resolved of currentEvidence.values()) {
    const personId = resolved.audit.person_id;
    const identity = resolved.identity;
    const insidePeriod = identity.scoped
      ? identity.periodStart! >= period.start && identity.periodStart! <= period.end
      : identity.weekDate >= period.start && identity.weekDate <= period.end;
    if (!personId || !activeIds.has(personId) || !insidePeriod) continue;
    totalsByPerson.set(
      personId,
      (totalsByPerson.get(personId) ?? 0) + (resolved.kind === "verified_zero" ? 0 : Number(resolved.premiumRow!.personal_ip_cents)),
    );
  }
  const rankingIssuedIpCents = totalsByPerson.get(producer.id);
  if (rankingIssuedIpCents == null || rankingIssuedIpCents !== currentIssuedIpCents) {
    throw new Error("Producer rank source does not match the Scorecard issued-IP total.");
  }
  const sortedTotals = [...totalsByPerson.values()].filter((value) => value > 0).sort((a, b) => b - a);
  const rankIndex = sortedTotals.findIndex((value) => value === rankingIssuedIpCents);
  if (rankingIssuedIpCents > 0 && rankIndex < 0) throw new Error("Unable to establish Producer rank.");
  const rank = rankingIssuedIpCents > 0 ? rankIndex + 1 : null;
  const population = sortedTotals.length;
  const percentile = population && rank != null
    ? Math.max(1, Math.round(((population - rank + 1) / population) * 100))
    : 0;
  const priorTotalsByPerson = new Map([...activeIds].map((id) => [id, 0]));
  const priorEvidence = buildPersonalGatewayEvidenceIndex(priorImportsResult, priorPremiumRows);
  let producerHasPriorEvidence = false;
  for (const resolved of priorEvidence.values()) {
    const personId = resolved.audit.person_id;
    const identity = resolved.identity;
    const insidePrior = identity.scoped
      ? identity.periodStart! >= prior.start && identity.periodStart! <= prior.end
      : identity.weekDate >= prior.start && identity.weekDate <= prior.end;
    if (!personId || !activeIds.has(personId) || !insidePrior) continue;
    const amount = resolved.kind === "verified_zero" ? 0 : Number(resolved.premiumRow!.personal_ip_cents);
    priorTotalsByPerson.set(personId, (priorTotalsByPerson.get(personId) ?? 0) + amount);
    if (personId === producer.id) producerHasPriorEvidence = true;
  }
  const priorIssuedIpCents = priorTotalsByPerson.get(producer.id) ?? 0;
  const priorSortedTotals = [...priorTotalsByPerson.values()].filter((value) => value > 0).sort((a, b) => b - a);
  const priorRankIndex = priorSortedTotals.findIndex((value) => value === priorIssuedIpCents);

  let expectedWorkingDates: string[] | null = null;
  if (!scheduleResult.error && scheduleResult.data?.length) {
    const schedules = scheduleResult.data as Array<{
      id: string;
      effective_from: string;
      effective_to: string | null;
      working_weekdays: number[];
      created_at: string;
    }>;
    const { data: exceptionRows, error: exceptionError } = await supabase
      .from("member_work_schedule_exception")
      .select("schedule_id, exception_date, is_working_day, created_at")
      .in("schedule_id", schedules.map((schedule) => schedule.id))
      .gte("exception_date", period.start)
      .lte("exception_date", period.end)
      .order("created_at", { ascending: true });
    if (exceptionError) throw new Error(`Unable to load schedule exceptions: ${exceptionError.message}`);
    const todayParts = datePartsInChicago(now);
    const businessToday = `${todayParts.year}-${pad2(todayParts.month)}-${pad2(todayParts.day)}`;
    expectedWorkingDates = expectedDatesForScheduleHistory({
      periodStart: period.start,
      periodEnd: businessToday < period.end ? businessToday : period.end,
      schedules,
      exceptions: (exceptionRows ?? []) as Array<{
        schedule_id: string;
        exception_date: string;
        is_working_day: boolean;
      }>,
    });
  } else if (scheduleResult.error && !isMissingRelationError(scheduleResult.error)) {
    throw new Error(`Unable to load work schedule: ${scheduleResult.error.message}`);
  }

  return createProducerOverview({
    fullName: producer.full_name,
    photoUrl: approvedPhotoUrl(producer),
    submittedApCents: submittedApAvailable ? submittedApCents : null,
    leadSpendCents,
    priorSubmittedApCents: priorSubmittedApAvailable ? priorSubmittedApCents : null,
    priorLeadSpendCents,
    currentIssuedIpCents,
    priorIssuedIpCents,
    rank: {
      rank,
      population,
      percentile,
      movement:
        !producerHasPriorEvidence || priorRankIndex < 0 || rank == null ? null : priorRankIndex + 1 - rank,
    },
    organizationRanks: {
      submittedAp: submittedApRank,
      leadSpend: leadSpendRank,
      ...organizationRanks,
      trackingConsistency: trackingConsistencyRank,
    },
    activityRows,
    priorActivityRows,
    expectedWorkingDates,
  });
}

/**
 * Bounded one-person Producer source adapter for manual historical Scorecards.
 * It intentionally does not load organization-wide rank populations: #012 ratings
 * are fixed bands and the current Scorecard UI does not consume legacy rank fields.
 */
export async function loadManualProducerOverviewForPeriod(
  supabase: SupabaseClient,
  producer: {
    id: string;
    full_name: string;
  } & PhotoFields,
  currentIssuedIpCents: number,
  priorIssuedIpCents: number | null,
  period: ScorecardPeriod,
): Promise<ProducerOverview> {
  const prior = previousEquivalentPeriod(period);
  const [
    clientRows,
    activityRows,
    priorActivityRows,
    leadSpendCents,
    priorLeadSpendCents,
    scheduleResult,
  ] = await Promise.all([
    fetchAllRows<ClientSaleFields & { id: string }>((lo, hi) =>
      supabase
        .from("clients")
        .select("id, annual_premium, sale_status, submit_date, date, created_at")
        .eq("person_id", producer.id)
        .order("id")
        .range(lo, hi),
    ),
    loadProducerTrackingRows(supabase, producer.id, period),
    loadProducerTrackingRows(supabase, producer.id, prior),
    loadProducerLeadSpendCents(supabase, producer.id, period),
    loadProducerLeadSpendCents(supabase, producer.id, prior),
    supabase
      .from("member_work_schedule")
      .select("id, effective_from, effective_to, working_weekdays, created_at")
      .eq("person_id", producer.id)
      .lte("effective_from", period.end)
      .or(`effective_to.is.null,effective_to.gte.${period.start}`)
      .order("effective_from", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  let submittedApCents = 0;
  let priorSubmittedApCents = 0;
  let submittedApAvailable = true;
  let priorSubmittedApAvailable = true;
  for (const client of clientRows) {
    const day = saleDay(client, SCORECARD_TZ);
    if (isSale(client) && day && day >= period.start && day <= period.end) {
      if (typeof client.annual_premium !== "number" || !Number.isFinite(client.annual_premium)) {
        submittedApAvailable = false;
      } else {
        submittedApCents += dollarsToCents(client.annual_premium);
      }
    }
    if (isSale(client) && day && day >= prior.start && day <= prior.end) {
      if (typeof client.annual_premium !== "number" || !Number.isFinite(client.annual_premium)) {
        priorSubmittedApAvailable = false;
      } else {
        priorSubmittedApCents += dollarsToCents(client.annual_premium);
      }
    }
  }

  let expectedWorkingDates: string[] | null = null;
  if (!scheduleResult.error && scheduleResult.data?.length) {
    const schedules = scheduleResult.data as Array<{
      id: string;
      effective_from: string;
      effective_to: string | null;
      working_weekdays: number[];
      created_at: string;
    }>;
    const { data: exceptionRows, error: exceptionError } = await supabase
      .from("member_work_schedule_exception")
      .select("schedule_id, exception_date, is_working_day, created_at")
      .in("schedule_id", schedules.map((schedule) => schedule.id))
      .gte("exception_date", period.start)
      .lte("exception_date", period.end)
      .order("created_at", { ascending: true });
    if (exceptionError) throw new Error(`Unable to load schedule exceptions: ${exceptionError.message}`);
    expectedWorkingDates = expectedDatesForScheduleHistory({
      periodStart: period.start,
      periodEnd: period.end,
      schedules,
      exceptions: (exceptionRows ?? []) as Array<{
        schedule_id: string;
        exception_date: string;
        is_working_day: boolean;
      }>,
    });
  } else if (scheduleResult.error && !isMissingRelationError(scheduleResult.error)) {
    throw new Error(`Unable to load work schedule: ${scheduleResult.error.message}`);
  }

  const unavailableRank = { rank: null, population: 0 };
  return createProducerOverview({
    fullName: producer.full_name,
    photoUrl: approvedPhotoUrl(producer),
    submittedApCents: submittedApAvailable ? submittedApCents : null,
    leadSpendCents,
    priorSubmittedApCents: priorSubmittedApAvailable ? priorSubmittedApCents : null,
    priorLeadSpendCents,
    currentIssuedIpCents,
    priorIssuedIpCents,
    rank: { rank: null, population: 0, percentile: 0, movement: null },
    organizationRanks: {
      submittedAp: unavailableRank,
      leadSpend: unavailableRank,
      dials: unavailableRank,
      contacts: unavailableRank,
      presentations: unavailableRank,
      sales: unavailableRank,
      trackingConsistency: unavailableRank,
    },
    activityRows,
    priorActivityRows,
    expectedWorkingDates,
  });
}
export async function loadCurrentMonthlyProducerOverview(
  supabase: SupabaseClient,
  producer: {
    id: string;
    full_name: string;
  } & PhotoFields,
  currentIssuedIpCents: number,
  now = new Date(),
): Promise<ProducerOverview> {
  const period = currentMonthlyPeriod(now);
  return loadProducerOverviewForPeriod(
    supabase,
    producer,
    currentIssuedIpCents,
    { kind: "monthly", ...period },
    now,
  );
}

function isMissingRelationError(error: { code?: string; message: string }): boolean {
  return error.code === "PGRST205" ||
    (/member_work_schedule/i.test(error.message) && /not find|does not exist/i.test(error.message));
}

export function expectedDatesForSchedule(args: {
  periodStart: string;
  periodEnd: string;
  workingWeekdays: number[];
  exceptions: Array<{ exception_date: string; is_working_day: boolean }>;
}): string[] {
  const exceptions = new Map(args.exceptions.map((row) => [row.exception_date, row.is_working_day]));
  const weekdays = new Set(args.workingWeekdays);
  const dates: string[] = [];
  const cursor = new Date(`${args.periodStart}T00:00:00Z`);
  const end = new Date(`${args.periodEnd}T00:00:00Z`);
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    const expected = exceptions.get(date) ?? weekdays.has(cursor.getUTCDay());
    if (expected) dates.push(date);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function expectedDatesForScheduleHistory(args: {
  periodStart: string;
  periodEnd: string;
  schedules: Array<{
    id: string;
    effective_from: string;
    effective_to: string | null;
    working_weekdays: number[];
    created_at: string;
  }>;
  exceptions: Array<{
    schedule_id: string;
    exception_date: string;
    is_working_day: boolean;
  }>;
}): string[] {
  const exceptions = new Map(
    args.exceptions.map((row) => [
      `${row.schedule_id}:${row.exception_date}`,
      row.is_working_day,
    ]),
  );
  const dates: string[] = [];
  const cursor = new Date(`${args.periodStart}T00:00:00Z`);
  const end = new Date(`${args.periodEnd}T00:00:00Z`);
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    const applicable = args.schedules.filter(
      (schedule) =>
        schedule.effective_from <= date &&
        (schedule.effective_to == null || schedule.effective_to >= date),
    );
    const schedule = applicable.at(-1);
    if (schedule) {
      const expected =
        exceptions.get(`${schedule.id}:${date}`) ??
        new Set(schedule.working_weekdays).has(cursor.getUTCDay());
      if (expected) dates.push(date);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function formatReportDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
