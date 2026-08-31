import type { ScorecardPeriodKind } from "./run";

export type ScorecardPeriod = {
  kind: ScorecardPeriodKind;
  start: string;
  end: string;
  label: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isoDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

export function periodFactor(kind: ScorecardPeriodKind): 1 | 3 | 12 {
  if (kind === "monthly") return 1;
  if (kind === "quarterly") return 3;
  if (kind === "annual") return 12;
  throw new Error(`Unsupported Scorecard period kind: ${String(kind)}`);
}

export function comparisonForPeriod(kind: ScorecardPeriodKind): "mom" | "qoq" | "yoy" {
  if (kind === "monthly") return "mom";
  if (kind === "quarterly") return "qoq";
  if (kind === "annual") return "yoy";
  throw new Error(`Unsupported Scorecard period kind: ${String(kind)}`);
}

export function scaleCumulativeThreshold(baseMonthlyThreshold: number, kind: ScorecardPeriodKind): number {
  return baseMonthlyThreshold * periodFactor(kind);
}

export function scorecardPeriodFromStart(kind: ScorecardPeriodKind, start: string): ScorecardPeriod {
  if (!validIsoDate(start)) throw new Error("Enter a valid ISO Scorecard period start date.");
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const year = startDate.getUTCFullYear();
  const month = startDate.getUTCMonth();
  if (isoDate(year, month, 1) !== start) {
    throw new Error("Scorecard periods must start on a calendar boundary.");
  }

  if (kind === "monthly") {
    return {
      kind,
      start,
      end: isoDate(year, month + 1, 0),
      label: new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(startDate),
    };
  }

  if (kind === "quarterly") {
    if (month % 3 !== 0) throw new Error("Quarterly runs require an exact calendar quarter.");
    return {
      kind,
      start,
      end: isoDate(year, month + 3, 0),
      label: `Q${month / 3 + 1} ${year}`,
    };
  }

  if (kind === "annual") {
    if (month !== 0) throw new Error("Annual runs require an exact calendar year.");
    return { kind, start, end: `${year}-12-31`, label: String(year) };
  }

  throw new Error(`Unsupported Scorecard period kind: ${String(kind)}`);
}

export function previousEquivalentPeriod(period: Pick<ScorecardPeriod, "kind" | "start" | "end">): ScorecardPeriod {
  const current = scorecardPeriodFromStart(period.kind, period.start);
  if (period.end !== current.end) {
    throw new Error("Current Scorecard period must be an exact calendar period before deriving its comparison period.");
  }

  const startDate = new Date(`${current.start}T00:00:00.000Z`);
  const year = startDate.getUTCFullYear();
  const month = startDate.getUTCMonth();
  if (period.kind === "monthly") return scorecardPeriodFromStart("monthly", isoDate(year, month - 1, 1));
  if (period.kind === "quarterly") return scorecardPeriodFromStart("quarterly", isoDate(year, month - 3, 1));
  return scorecardPeriodFromStart("annual", `${year - 1}-01-01`);
}

export function validateClosedScorecardPeriod({
  kind,
  start,
  end,
  today,
}: {
  kind: ScorecardPeriodKind;
  start: string;
  end: string;
  today: string;
}): ScorecardPeriod {
  if (!validIsoDate(end) || !validIsoDate(today)) throw new Error("Enter valid ISO period dates.");
  const period = scorecardPeriodFromStart(kind, start);
  if (end !== period.end) {
    throw new Error(`The selected dates do not form an exact calendar ${kind === "quarterly" ? "quarter" : kind === "annual" ? "year" : "month"}.`);
  }
  if (end >= today) throw new Error("Scorecard runs can only start after the period is closed.");
  return period;
}
