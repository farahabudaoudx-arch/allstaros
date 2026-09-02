import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScorecardPeriod } from "./period";

export type GatewayCoverageScope = "all" | "producer" | "builder";

export type GatewayCoverageEntry = {
  personId: string;
  fullName: string;
  email: string;
  cardType: "producer" | "builder";
  covered: boolean;
};

export type GatewayCoverageReport = {
  period: ScorecardPeriod;
  scope: GatewayCoverageScope;
  inScope: number;
  covered: number;
  missing: number;
  coveragePercent: number;
  missingPeople: GatewayCoverageEntry[];
  entries: GatewayCoverageEntry[];
};

type HistoricalRoleRow = {
  person_id: string;
  status: string;
  is_producer: boolean;
  is_builder: boolean;
  effective_from: string;
  effective_to: string | null;
  recorded_at: string;
};

type PersonRow = { id: string; full_name: string; email: string | null };
type ImportRow = { report_date: string };
type PremiumRow = {
  person_id: string;
  report_date: string;
  personal_ip_cents: number | null;
  team_ip_cents: number | null;
};

type CoveragePage<T> = { data: T[] | null; error: { message: string } | null };
const COVERAGE_PAGE_SIZE = 1000;

function timezoneOffsetMs(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const renderedAsUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return renderedAsUtc - date.getTime();
}

function chicagoPeriodEndCutoff(periodEnd: string): string {
  const [year, month, day] = periodEnd.split("-").map(Number);
  const nextLocalMidnight = Date.UTC(year, month - 1, day + 1, 0, 0, 0);
  let instant = nextLocalMidnight;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    instant = nextLocalMidnight - timezoneOffsetMs(new Date(instant), "America/Chicago");
  }
  return new Date(instant - 1).toISOString();
}

async function loadAllPages<T>(
  loadPage: (from: number, to: number) => Promise<CoveragePage<T>>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += COVERAGE_PAGE_SIZE) {
    const result = await loadPage(from, from + COVERAGE_PAGE_SIZE - 1);
    if (result.error) throw new Error(`Unable to load ${label}: ${result.error.message}`);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < COVERAGE_PAGE_SIZE) return rows;
  }
}

export function summarizeGatewayCoverage(input: {
  period: ScorecardPeriod;
  scope: GatewayCoverageScope;
  roles: HistoricalRoleRow[];
  people: PersonRow[];
  importedReportDates: string[];
  premiumRows: PremiumRow[];
}): GatewayCoverageReport {
  const latestRoleByPerson = new Map<string, HistoricalRoleRow>();
  for (const role of input.roles) {
    if (!latestRoleByPerson.has(role.person_id)) latestRoleByPerson.set(role.person_id, role);
  }
  const peopleById = new Map(input.people.map((person) => [person.id, person]));
  const importedDates = new Set(input.importedReportDates);
  const rowsByPerson = new Map<string, PremiumRow[]>();
  for (const row of input.premiumRows) {
    if (row.report_date < input.period.start || row.report_date > input.period.end || !importedDates.has(row.report_date)) continue;
    const current = rowsByPerson.get(row.person_id) ?? [];
    current.push(row);
    rowsByPerson.set(row.person_id, current);
  }

  const entries: GatewayCoverageEntry[] = [];
  for (const role of latestRoleByPerson.values()) {
    if (role.status !== "active") continue;
    const person = peopleById.get(role.person_id);
    if (!person) continue;
    const rows = rowsByPerson.get(role.person_id) ?? [];
    if ((input.scope === "all" || input.scope === "producer") && role.is_producer) {
      entries.push({
        personId: role.person_id,
        fullName: person.full_name,
        email: person.email ?? "",
        cardType: "producer",
        covered: rows.some((row) => row.personal_ip_cents !== null && row.personal_ip_cents !== undefined),
      });
    }
    if ((input.scope === "all" || input.scope === "builder") && role.is_builder) {
      entries.push({
        personId: role.person_id,
        fullName: person.full_name,
        email: person.email ?? "",
        cardType: "builder",
        covered: rows.some((row) => row.team_ip_cents !== null && row.team_ip_cents !== undefined),
      });
    }
  }

  const covered = entries.filter((entry) => entry.covered).length;
  const missingPeople = entries.filter((entry) => !entry.covered)
    .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.cardType.localeCompare(b.cardType));
  return {
    period: input.period,
    scope: input.scope,
    inScope: entries.length,
    covered,
    missing: missingPeople.length,
    coveragePercent: entries.length === 0 ? 0 : Math.round((covered / entries.length) * 1000) / 10,
    missingPeople,
    entries,
  };
}

export async function loadGatewayCoverageReport(
  supabase: SupabaseClient,
  period: ScorecardPeriod,
  scope: GatewayCoverageScope,
): Promise<GatewayCoverageReport> {
  const cutoff = chicagoPeriodEndCutoff(period.end);
  const [roles, people, imports, premiumRows] = await Promise.all([
    loadAllPages<HistoricalRoleRow>(async (from, to) => {
      const result = await supabase
        .from("person_role_status_history")
        .select("person_id, status, is_producer, is_builder, effective_from, effective_to, recorded_at")
        .lte("effective_from", cutoff)
        .or(`effective_to.is.null,effective_to.gt.${cutoff}`)
        .order("person_id", { ascending: true })
        .order("effective_from", { ascending: false })
        .order("recorded_at", { ascending: false })
        .range(from, to);
      return result as CoveragePage<HistoricalRoleRow>;
    }, "Scorecard roster coverage"),
    loadAllPages<PersonRow>(async (from, to) => {
      const result = await supabase.from("person").select("id, full_name, email").order("id", { ascending: true }).range(from, to);
      return result as CoveragePage<PersonRow>;
    }, "Scorecard people coverage"),
    loadAllPages<ImportRow>(async (from, to) => {
      const result = await supabase
        .from("gateway_issued_premium_import")
        .select("report_date")
        .eq("period_type", "wtd")
        .eq("status", "imported")
        .gte("report_date", period.start)
        .lte("report_date", period.end)
        .order("report_date", { ascending: true })
        .range(from, to);
      return result as CoveragePage<ImportRow>;
    }, "Gateway report coverage"),
    loadAllPages<PremiumRow>(async (from, to) => {
      const result = await supabase
        .from("producer_issued_premium")
        .select("person_id, report_date, personal_ip_cents, team_ip_cents")
        .eq("period_type", "wtd")
        .gte("report_date", period.start)
        .lte("report_date", period.end)
        .order("person_id", { ascending: true })
        .order("report_date", { ascending: true })
        .range(from, to);
      return result as CoveragePage<PremiumRow>;
    }, "Gateway producer coverage"),
  ]);

  return summarizeGatewayCoverage({
    period,
    scope,
    roles,
    people,
    importedReportDates: imports.map((row) => row.report_date),
    premiumRows,
  });
}
