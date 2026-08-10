import type { SupabaseClient } from "@supabase/supabase-js";
import type { MonthlyProducerSource } from "./lifecycle";

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

function datePartsInChicago(now: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
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

function formatReportDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
