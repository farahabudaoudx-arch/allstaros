import { installationTimezone } from "@/lib/installation/runtime";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export type LicensedRecruitCandidate = {
  personId: string;
  npn: unknown;
  npnStatus: unknown;
  npnVerifiedAt: unknown;
};

function chicagoDateOfInstant(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: installationTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? null;
  const year = valueOf("year");
  const month = valueOf("month");
  const day = valueOf("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function validPeriodDate(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isLicensedRecruitInPeriod(
  candidate: LicensedRecruitCandidate,
  period: { start: string; end: string },
): boolean {
  if (!validPeriodDate(period.start) || !validPeriodDate(period.end) || period.start > period.end) return false;
  if (candidate.npnStatus !== "verified") return false;
  if (typeof candidate.npn !== "string" || !/^\d{1,10}$/.test(candidate.npn.trim())) return false;
  const verifiedDate = chicagoDateOfInstant(candidate.npnVerifiedAt);
  if (!verifiedDate) return false;
  return verifiedDate >= period.start && verifiedDate <= period.end;
}

export function licensedRecruitPersonIds(
  candidates: Iterable<LicensedRecruitCandidate>,
  period: { start: string; end: string },
): Set<string> {
  const licensed = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate.personId || !isLicensedRecruitInPeriod(candidate, period)) continue;
    licensed.add(candidate.personId);
  }
  return licensed;
}
