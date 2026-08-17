import type { SupabaseClient } from "@supabase/supabase-js";
import { approvedPhotoUrl, type PhotoFields } from "@/lib/headshots/photo";
import {
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

type GatewayWeekRow = {
  person_id: string;
  report_date: string;
  gateway_label: string | null;
  personal_ip_cents: number;
};

type GatewayWeekImport = {
  report_date: string;
  gateway_label: string | null;
};

function datePartsInChicago(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
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
    timeZone: "America/Chicago",
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
  const reportByDate = new Map<string, { reportDate: string; label: string }>();
  const producerRows: MonthlyProducerSource["producerRows"] = [];

  for (const report of args.reportImports) {
    if (!reportByDate.has(report.report_date)) {
      reportByDate.set(report.report_date, {
        reportDate: report.report_date,
        label: report.gateway_label?.trim() || formatReportDate(report.report_date),
      });
    }
  }
  for (const row of args.rows) {
    if (row.person_id === args.producerId) {
      producerRows.push({
        reportDate: row.report_date,
        personalIpCents: row.personal_ip_cents,
      });
    }
  }

  return {
    producerId: args.producerId,
    periodStart: args.period.start,
    periodEnd: args.period.end,
    periodLabel: args.period.label,
    reportDates: [...reportByDate.values()],
    producerRows,
    generatedAt: args.generatedAt,
  };
}

/** Server-only source adapter. The caller must pass an authorized service-role
 * client: organization report dates are needed even when this producer has no
 * row, while the returned source includes only the requested member's value. */
export async function loadCurrentMonthlyProducerSource(
  supabase: SupabaseClient,
  producerId: string,
  now = new Date(),
): Promise<MonthlyProducerSource> {
  const period = currentMonthlyPeriod(now);
  const [importsResult, rowsResult] = await Promise.all([
    supabase
      .from("gateway_issued_premium_import")
      .select("report_date, gateway_label")
      .eq("period_type", "wtd")
      .eq("status", "imported")
      .gte("report_date", period.start)
      .lte("report_date", period.end)
      .order("report_date", { ascending: true }),
    supabase
      .from("producer_issued_premium")
      .select("person_id, report_date, gateway_label, personal_ip_cents")
      .eq("person_id", producerId)
      .eq("period_type", "wtd")
      .gte("report_date", period.start)
      .lte("report_date", period.end)
      .order("report_date", { ascending: true }),
  ]);
  if (importsResult.error) {
    throw new Error(`Unable to load Gateway report coverage: ${importsResult.error.message}`);
  }
  if (rowsResult.error) {
    throw new Error(`Unable to load producer Gateway values: ${rowsResult.error.message}`);
  }

  return monthlyProducerSourceFromRows({
    producerId,
    period,
    reportImports: (importsResult.data ?? []) as GatewayWeekImport[],
    rows: (rowsResult.data ?? []) as GatewayWeekRow[],
    generatedAt: now.toISOString(),
  });
}

function previousMonth(periodStart: string): { start: string; end: string } {
  const [year, month] = periodStart.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  const previousYear = previous.getUTCFullYear();
  const previousMonthNumber = previous.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(previousYear, previousMonthNumber, 0)).getUTCDate();
  return {
    start: `${previousYear}-${pad2(previousMonthNumber)}-01`,
    end: `${previousYear}-${pad2(previousMonthNumber)}-${pad2(lastDay)}`,
  };
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
  const prior = previousMonth(period.start);
  const [clientRows, trackerResult, priorTrackerResult, leadSpendResult, organizationClientRows, organizationTrackerRows, organizationLeadSpendRows, currentPremiumRows, priorPremiumRows, peopleResult, scheduleResult, currentImportsResult, priorImportsResult] =
    await Promise.all([
      fetchAllRows<ClientSaleFields & { id: string }>((lo, hi) =>
        supabase
          .from("clients")
          .select("id, annual_premium, sale_status, submit_date, date, created_at")
          .eq("person_id", producer.id)
          .order("id")
          .range(lo, hi),
      ),
      supabase
        .from("tracker_entry")
        .select("entry_date, leads, dials, contacts, appointments, presentations, sales")
        .eq("person_id", producer.id)
        .gte("entry_date", period.start)
        .lte("entry_date", period.end),
      supabase
        .from("tracker_entry")
        .select("entry_date, leads, dials, contacts, appointments, presentations, sales")
        .eq("person_id", producer.id)
        .gte("entry_date", prior.start)
        .lte("entry_date", prior.end),
      supabase
        .from("lead_purchases")
        .select("amount, purchase_date, created_at")
        .eq("person_id", producer.id),
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
      fetchAllRows<{ id: string; person_id: string; report_date: string; personal_ip_cents: number }>((lo, hi) =>
        supabase
          .from("producer_issued_premium")
          .select("id, person_id, report_date, personal_ip_cents")
          .eq("period_type", "wtd")
          .gte("report_date", period.start)
          .lte("report_date", period.end)
          .order("id")
          .range(lo, hi),
      ),
      fetchAllRows<{ id: string; person_id: string; report_date: string; personal_ip_cents: number }>((lo, hi) =>
        supabase
          .from("producer_issued_premium")
          .select("id, person_id, report_date, personal_ip_cents")
          .eq("period_type", "wtd")
          .gte("report_date", prior.start)
          .lte("report_date", prior.end)
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
      supabase.from("gateway_issued_premium_import").select("report_date").eq("period_type", "wtd").eq("status", "imported").gte("report_date", period.start).lte("report_date", period.end),
      supabase.from("gateway_issued_premium_import").select("report_date").eq("period_type", "wtd").eq("status", "imported").gte("report_date", prior.start).lte("report_date", prior.end),
    ]);
  if (trackerResult.error || priorTrackerResult.error) throw new Error(`Unable to load activity: ${trackerResult.error?.message ?? priorTrackerResult.error?.message}`);
  if (leadSpendResult.error) throw new Error(`Unable to load Lead Spend: ${leadSpendResult.error.message}`);
  if (peopleResult.error) throw new Error(`Unable to load rank population: ${peopleResult.error.message}`);
  if (currentImportsResult.error || priorImportsResult.error) throw new Error("Unable to load imported Gateway coverage for ranking.");

  let submittedApCents = 0;
  let priorSubmittedApCents = 0;
  let leadSpendCents = 0;
  let priorLeadSpendCents = 0;
  let submittedApAvailable = true;
  let priorSubmittedApAvailable = true;
  for (const client of clientRows) {
    const day = saleDay(client, "America/Chicago");
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

  for (const purchase of (leadSpendResult.data ?? []) as Array<{
    amount: number | string | null;
    purchase_date: string | null;
    created_at: string | null;
  }>) {
    const day = dayOfDateColumn(purchase.purchase_date) ?? dayOfInstantInChicago(purchase.created_at);
    if (!day) continue;
    if (day >= period.start && day <= period.end) {
      leadSpendCents += dollarsToCents(purchase.amount);
    }
    if (day >= prior.start && day <= prior.end) {
      priorLeadSpendCents += dollarsToCents(purchase.amount);
    }
  }

  const mapActivityRows = (rows: Array<Record<string, number | string | null>>) => rows.map<ProducerActivityRow>(
    (row) => ({
      entryDate: String(row.entry_date),
      leads: row.leads == null ? null : Number(row.leads),
      dials: row.dials == null ? null : Number(row.dials),
      contacts: row.contacts == null ? null : Number(row.contacts),
      appointments: row.appointments == null ? null : Number(row.appointments),
      presentations: row.presentations == null ? null : Number(row.presentations),
      sales: row.sales == null ? null : Number(row.sales),
    }),
  );
  const activityRows = mapActivityRows((trackerResult.data ?? []) as Array<Record<string, number | string | null>>);
  const priorActivityRows = mapActivityRows((priorTrackerResult.data ?? []) as Array<Record<string, number | string | null>>);

  const activeIds = new Set(
    ((peopleResult.data ?? []) as Array<{ id: string }>).map((person) => person.id),
  );
  if (!activeIds.has(producer.id)) {
    throw new Error("Producer is not in the active Producer ranking population.");
  }
  const organizationApTotals = new Map([...activeIds].map((id) => [id, 0]));
  for (const client of organizationClientRows) {
    if (!activeIds.has(client.person_id)) continue;
    const day = saleDay(client, "America/Chicago");
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
  const currentImportedDates = new Set((currentImportsResult.data ?? []).map((row) => String(row.report_date)));
  for (const row of currentPremiumRows) {
    if (!activeIds.has(row.person_id) || !currentImportedDates.has(row.report_date)) continue;
    totalsByPerson.set(
      row.person_id,
      (totalsByPerson.get(row.person_id) ?? 0) + row.personal_ip_cents,
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
  const priorImportedDates = new Set((priorImportsResult.data ?? []).map((row) => String(row.report_date)));
  const priorTotalsByPerson = new Map([...activeIds].map((id) => [id, 0]));
  for (const row of priorPremiumRows) {
    if (!activeIds.has(row.person_id) || !priorImportedDates.has(row.report_date)) continue;
    priorTotalsByPerson.set(row.person_id, (priorTotalsByPerson.get(row.person_id) ?? 0) + row.personal_ip_cents);
  }
  const priorIssuedIpCents = priorPremiumRows
    .filter((row) => row.person_id === producer.id && priorImportedDates.has(row.report_date))
    .reduce((total, row) => total + row.personal_ip_cents, 0);
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
        priorImportedDates.size === 0 || priorRankIndex < 0 || rank == null ? null : priorRankIndex + 1 - rank,
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
