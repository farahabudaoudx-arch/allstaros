import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScorecardPeriod } from "./period";
import {
  chicagoDateOfInstant,
  gatewayPeriodRequirements,
  summarizePersonalGatewayEvidence,
  type PersonalGatewayImportEvidence,
  type PersonalGatewayPremiumRow,
} from "./gateway-completeness";

export type GatewayCoverageScope = "all" | "producer" | "builder";

export type GatewayCoverageEntry = {
  personId: string;
  fullName: string;
  email: string;
  cardType: "producer" | "builder";
  covered: boolean;
  connectedByPeriodEnd: boolean;
  currentlyConnected: boolean;
  finalWeekReady: boolean;
  missingReportDates: string[];
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
type ConnectionRow = { person_id: string; first_connected_at: string | null; status: string };
type ImportRow = PersonalGatewayImportEvidence;
type PremiumRow = PersonalGatewayPremiumRow;

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
  connections: ConnectionRow[];
  imports: ImportRow[];
  premiumRows: PremiumRow[];
}): GatewayCoverageReport {
  const latestRoleByPerson = new Map<string, HistoricalRoleRow>();
  for (const role of input.roles) {
    if (!latestRoleByPerson.has(role.person_id)) latestRoleByPerson.set(role.person_id, role);
  }
  const peopleById = new Map(input.people.map((person) => [person.id, person]));
  const connectionsByPerson = new Map(input.connections.map((row) => [row.person_id, row]));
  const requirements = gatewayPeriodRequirements(input.imports, input.period);
  const evidence = summarizePersonalGatewayEvidence({
    personIds: latestRoleByPerson.keys(),
    requiredWeeks: requirements.requiredWeeks,
    imports: input.imports,
    premiumRows: input.premiumRows,
  });

  const entries: GatewayCoverageEntry[] = [];
  for (const role of latestRoleByPerson.values()) {
    if (role.status !== "active") continue;
    const person = peopleById.get(role.person_id);
    if (!person) continue;
    const connection = connectionsByPerson.get(role.person_id);
    const firstConnectedDate = chicagoDateOfInstant(connection?.first_connected_at);
    const connectedByPeriodEnd = firstConnectedDate != null && firstConnectedDate <= input.period.end;
    const currentlyConnected = connection?.status === "connected";
    const personEvidence = evidence.byPerson.get(role.person_id) ?? {
      complete: false,
      finalWeekReady: false,
      missingDates: [],
      missingWeeks: requirements.requiredWeeks,
    };
    const covered = requirements.ready && connectedByPeriodEnd && currentlyConnected &&
      personEvidence.complete && personEvidence.finalWeekReady;
    const missingReportDates = personEvidence.missingWeeks.map((week) =>
      `${week.periodStart}:week-${week.weekOrdinal}`);
    if ((input.scope === "all" || input.scope === "producer") && role.is_producer) {
      entries.push({
        personId: role.person_id,
        fullName: person.full_name,
        email: person.email ?? "",
        cardType: "producer",
        covered,
        connectedByPeriodEnd,
        currentlyConnected,
        finalWeekReady: personEvidence.finalWeekReady,
        missingReportDates,
      });
    }
    if ((input.scope === "all" || input.scope === "builder") && role.is_builder) {
      entries.push({
        personId: role.person_id,
        fullName: person.full_name,
        email: person.email ?? "",
        cardType: "builder",
        covered,
        connectedByPeriodEnd,
        currentlyConnected,
        finalWeekReady: personEvidence.finalWeekReady,
        missingReportDates,
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
  const [roles, people, connections, imports, premiumRows] = await Promise.all([
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
    loadAllPages<ConnectionRow>(async (from, to) => {
      const result = await supabase
        .from("gateway_connection")
        .select("person_id, first_connected_at, status")
        .order("person_id", { ascending: true })
        .range(from, to);
      return result as CoveragePage<ConnectionRow>;
    }, "Gateway connection coverage"),
    loadAllPages<ImportRow>(async (from, to) => {
      const result = await supabase
        .from("gateway_issued_premium_import")
        .select("id, person_id, source_kind, pull_kind, period_type, status, report_date, period_start, gateway_label, source_checksum, scorecard_period_start, scorecard_period_end, gateway_week_ordinal, gateway_period_final, matched_count, unmatched_count, ambiguous_count, summary, created_at")
        .not("person_id", "is", null)
        .eq("source_kind", "personal_gateway")
        .eq("period_type", "wtd")
        .gte("scorecard_period_start", `${period.start.slice(0, 7)}-01`)
        .lte("scorecard_period_start", period.end)
        .order("person_id", { ascending: true })
        .order("report_date", { ascending: true })
        .order("created_at", { ascending: true })
        .range(from, to);
      return result as CoveragePage<ImportRow>;
    }, "Gateway report coverage"),
    loadAllPages<PremiumRow>(async (from, to) => {
      const result = await supabase
        .from("producer_issued_premium")
        .select("id, import_id, person_id, source_kind, report_date, period_start, scorecard_period_start, scorecard_period_end, gateway_week_ordinal, gateway_period_final, personal_ip_cents, team_ip_cents, first_leg_percent")
        .eq("source_kind", "personal_gateway")
        .eq("period_type", "wtd")
        .gte("scorecard_period_start", `${period.start.slice(0, 7)}-01`)
        .lte("scorecard_period_start", period.end)
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
    connections,
    imports,
    premiumRows,
  });
}
