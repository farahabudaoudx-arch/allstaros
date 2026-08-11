import type { ScorecardPeriodKind } from "./run";

function isoDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
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
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw new Error("Enter valid ISO period dates.");
  }
  const startDate = new Date(`${start}T00:00:00Z`);
  const year = startDate.getUTCFullYear();
  const month = startDate.getUTCMonth();
  if (isoDate(year, month, 1) !== start) throw new Error("Scorecard periods must start on a calendar boundary.");

  let expectedEnd: string;
  let label: string;
  if (kind === "monthly") {
    expectedEnd = isoDate(year, month + 1, 0);
    label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(startDate);
  } else if (kind === "quarterly") {
    if (month % 3 !== 0) throw new Error("Quarterly runs require an exact calendar quarter.");
    expectedEnd = isoDate(year, month + 3, 0);
    label = `Q${month / 3 + 1} ${year}`;
  } else {
    if (month !== 0) throw new Error("Annual runs require an exact calendar year.");
    expectedEnd = `${year}-12-31`;
    label = String(year);
  }
  if (end !== expectedEnd) throw new Error(`The selected dates do not form an exact calendar ${kind === "quarterly" ? "quarter" : kind === "annual" ? "year" : "month"}.`);
  if (end >= today) throw new Error("Scorecard runs can only start after the period is closed.");
  return { kind, start, end, label };
}
