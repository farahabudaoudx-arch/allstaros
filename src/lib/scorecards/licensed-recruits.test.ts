import { describe, expect, it } from "vitest";
import { isLicensedRecruitInPeriod, licensedRecruitPersonIds } from "./licensed-recruits";

const august = { start: "2026-08-01", end: "2026-08-31" };

function candidate(overrides: Partial<{
  personId: string;
  npn: unknown;
  npnStatus: unknown;
  npnVerifiedAt: unknown;
}> = {}) {
  return {
    personId: "licensed-person",
    npn: "12345678",
    npnStatus: "verified",
    npnVerifiedAt: "2026-08-15T18:00:00.000Z",
    ...overrides,
  };
}

describe("licensed recruit qualification", () => {
  it.each([
    "missing",
    "submitted",
    "pending_license",
    "pending_sale",
    "pending_transfer",
    "unknown_state",
    null,
    undefined,
  ])("excludes non-authoritative NPN state %s", (npnStatus) => {
    expect(isLicensedRecruitInPeriod(candidate({ npnStatus }), august)).toBe(false);
  });

  it("counts only verified NPNs with a usable NPN and verification timestamp", () => {
    expect(isLicensedRecruitInPeriod(candidate(), august)).toBe(true);
    expect(isLicensedRecruitInPeriod(candidate({ npn: null }), august)).toBe(false);
    expect(isLicensedRecruitInPeriod(candidate({ npn: "   " }), august)).toBe(false);
    expect(isLicensedRecruitInPeriod(candidate({ npn: "abc123" }), august)).toBe(false);
    expect(isLicensedRecruitInPeriod(candidate({ npn: "12345678901" }), august)).toBe(false);
    expect(isLicensedRecruitInPeriod(candidate({ npnVerifiedAt: null }), august)).toBe(false);
    expect(isLicensedRecruitInPeriod(candidate({ npnVerifiedAt: "not-a-date" }), august)).toBe(false);
  });

  it("uses the Chicago-local verification date with inclusive period boundaries", () => {
    expect(isLicensedRecruitInPeriod(candidate({ npnVerifiedAt: "2026-08-01T05:00:00.000Z" }), august)).toBe(true);
    expect(isLicensedRecruitInPeriod(candidate({ npnVerifiedAt: "2026-08-01T04:59:59.999Z" }), august)).toBe(false);
    expect(isLicensedRecruitInPeriod(candidate({ npnVerifiedAt: "2026-09-01T04:59:59.999Z" }), august)).toBe(true);
    expect(isLicensedRecruitInPeriod(candidate({ npnVerifiedAt: "2026-09-01T05:00:00.000Z" }), august)).toBe(false);
  });

  it("excludes verification clearly before or after the requested period", () => {
    expect(isLicensedRecruitInPeriod(candidate({ npnVerifiedAt: "2026-07-15T18:00:00.000Z" }), august)).toBe(false);
    expect(isLicensedRecruitInPeriod(candidate({ npnVerifiedAt: "2026-09-15T18:00:00.000Z" }), august)).toBe(false);
  });

  it("attributes verified licensing to the selected quarter using Chicago-local dates", () => {
    const q3 = { start: "2026-07-01", end: "2026-09-30" };
    expect(isLicensedRecruitInPeriod(candidate({ npnVerifiedAt: "2026-07-01T05:00:00.000Z" }), q3)).toBe(true);
    expect(isLicensedRecruitInPeriod(candidate({ npnVerifiedAt: "2026-07-01T04:59:59.999Z" }), q3)).toBe(false);
    expect(isLicensedRecruitInPeriod(candidate({ npnVerifiedAt: "2026-10-01T04:59:59.999Z" }), q3)).toBe(true);
    expect(isLicensedRecruitInPeriod(candidate({ npnVerifiedAt: "2026-10-01T05:00:00.000Z" }), q3)).toBe(false);
  });

  it("fails closed for malformed period boundaries", () => {
    expect(isLicensedRecruitInPeriod(candidate(), { start: "2026-08-32", end: "2026-08-31" })).toBe(false);
    expect(isLicensedRecruitInPeriod(candidate(), { start: "2026-09-01", end: "2026-08-31" })).toBe(false);
  });

  it("deduplicates duplicate recruit records for the same licensed person", () => {
    expect([...licensedRecruitPersonIds([candidate(), candidate()], august)]).toEqual(["licensed-person"]);
  });

  it("ignores malformed identities instead of fabricating a licensed recruit", () => {
    expect([...licensedRecruitPersonIds([candidate({ personId: "" })], august)]).toEqual([]);
  });

  it("implements the canonical signup + licensing + licensed fixture as exactly one", () => {
    const ids = licensedRecruitPersonIds([
      candidate({ personId: "signup-only", npnStatus: "missing", npn: null, npnVerifiedAt: null }),
      candidate({ personId: "licensing", npnStatus: "pending_license", npn: null, npnVerifiedAt: null }),
      candidate({ personId: "licensed" }),
    ], august);

    expect([...ids]).toEqual(["licensed"]);
  });
});
