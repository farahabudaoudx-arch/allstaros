import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ScorecardPeriod } from "./period";
import { summarizeGatewayCoverage } from "./coverage";
import { requiredGatewayMondays, type PersonalGatewayImportEvidence, type PersonalGatewayPremiumRow } from "./gateway-completeness";

const period: ScorecardPeriod = { kind: "monthly", start: "2026-07-01", end: "2026-07-31", label: "July 2026" };
const people = [
  { id: "producer", full_name: "Producer One", email: "producer@example.test" },
  { id: "builder", full_name: "Builder One", email: "builder@example.test" },
  { id: "dual", full_name: "Dual Role", email: "dual@example.test" },
];
const role = (person_id: string, is_producer: boolean, is_builder: boolean, status = "active") => ({
  person_id, status, is_producer, is_builder,
  effective_from: "2026-01-01T00:00:00.000Z", effective_to: null, recorded_at: "2026-01-01T00:00:00.000Z",
});

const requiredDates = requiredGatewayMondays(period);

function importsFor(personIds: string[], dates = requiredDates): PersonalGatewayImportEvidence[] {
  return personIds.flatMap((personId) => dates.map((date, index) => ({
    id: `${personId}-${date}`,
    person_id: personId,
    period_type: "wtd",
    status: "imported",
    report_date: date,
    gateway_label: `Week ${index + 1}`,
    source_checksum: `${personId}-${date}-checksum`,
    matched_count: 1,
    unmatched_count: 0,
    ambiguous_count: 0,
    summary: { samples: { matchReason: null } },
    created_at: `${date}T15:00:00.000Z`,
  })));
}

function premiumsFor(personIds: string[], dates = requiredDates): PersonalGatewayPremiumRow[] {
  return personIds.flatMap((personId) => dates.map((date) => ({
    import_id: `${personId}-${date}`,
    person_id: personId,
    report_date: date,
    personal_ip_cents: 100_000,
    team_ip_cents: 500_000,
    first_leg_percent: 25,
  })));
}

const connections = ["producer", "builder", "dual"].map((person_id) => ({
  person_id,
  first_connected_at: "2026-06-30T18:00:00.000Z",
}));

function report(overrides: Partial<Parameters<typeof summarizeGatewayCoverage>[0]> = {}) {
  return summarizeGatewayCoverage({
    period,
    scope: "all",
    roles: [role("producer", true, false), role("builder", false, true)],
    people,
    connections,
    imports: importsFor(["producer", "builder"]),
    premiumRows: premiumsFor(["producer", "builder"]),
    ...overrides,
  });
}

describe("Gateway Scorecard coverage", () => {
  it("counts all eligible card scopes as covered only when every exact Monday is personally evidenced", () => {
    expect(report()).toMatchObject({ inScope: 2, covered: 2, missing: 0, coveragePercent: 100 });
  });

  it("keeps one missed Monday as a hole even when the final Monday is present", () => {
    const builderImports = importsFor(["builder"]).filter((row) => row.report_date !== "2026-07-13");
    const builderPremiums = premiumsFor(["builder"]).filter((row) => row.report_date !== "2026-07-13");
    const result = report({
      imports: [...importsFor(["producer"]), ...builderImports],
      premiumRows: [...premiumsFor(["producer"]), ...builderPremiums],
    });
    expect(result).toMatchObject({ inScope: 2, covered: 1, missing: 1, coveragePercent: 50 });
    expect(result.covered + result.missing).toBe(result.inScope);
    expect(result.missingPeople.map((entry) => entry.personId)).toEqual(["builder"]);
    expect(result.missingPeople[0]).toMatchObject({ finalWeekReady: true, missingReportDates: ["2026-07-13"] });
  });

  it("returns zero counts when nobody is eligible", () => {
    expect(report({ roles: [role("producer", true, false, "inactive")] })).toMatchObject({
      inScope: 0, covered: 0, missing: 0, coveragePercent: 0,
    });
  });

  it("does not let another person's successful report dates satisfy the target", () => {
    const result = report({
      scope: "producer",
      roles: [role("producer", true, false)],
      imports: importsFor(["builder"]),
      premiumRows: premiumsFor(["builder"]),
    });
    expect(result).toMatchObject({ inScope: 1, covered: 0, missing: 1 });
    expect(result.missingPeople[0]?.cardType).toBe("producer");
    expect(result.missingPeople[0]?.missingReportDates).toEqual(requiredDates);
  });

  it("treats the person's own unambiguous target_npn_not_present as verified zero", () => {
    const zeroImports = requiredDates.map((date) => ({
      ...importsFor(["producer"], [date])[0],
      matched_count: 0,
      unmatched_count: 1,
      summary: { samples: { matchReason: "target_npn_not_present" } },
    }));
    const result = report({
      scope: "producer",
      roles: [role("producer", true, false)],
      imports: zeroImports,
      premiumRows: [],
    });
    expect(result).toMatchObject({ inScope: 1, covered: 1, missing: 0 });
  });

  it("keeps never-connected or first-connected-after-period people blocked", () => {
    const never = report({
      scope: "producer",
      roles: [role("producer", true, false)],
      connections: connections.filter((row) => row.person_id !== "producer"),
      imports: importsFor(["producer"]),
      premiumRows: premiumsFor(["producer"]),
    });
    expect(never.missingPeople[0]).toMatchObject({ connectedByPeriodEnd: false });

    const late = report({
      scope: "producer",
      roles: [role("producer", true, false)],
      connections: [{ person_id: "producer", first_connected_at: "2026-08-01T12:00:00.000Z" }],
      imports: importsFor(["producer"]),
      premiumRows: premiumsFor(["producer"]),
    });
    expect(late).toMatchObject({ inScope: 1, covered: 0, missing: 1 });
  });

  it("supports Producer and Builder scopes independently, including dual-role people", () => {
    const common = {
      roles: [role("dual", true, true)],
      imports: importsFor(["dual"]),
      premiumRows: premiumsFor(["dual"]),
    };
    expect(report({ ...common, scope: "producer" })).toMatchObject({ inScope: 1, covered: 1, missing: 0 });
    expect(report({ ...common, scope: "builder" })).toMatchObject({ inScope: 1, covered: 1, missing: 0 });
    expect(report({ ...common, scope: "all" })).toMatchObject({ inScope: 2, covered: 2, missing: 0 });
  });

  it("keeps the admin coverage report behind the canonical server-side admin guard", () => {
    const page = readFileSync(join(process.cwd(), "src/app/admin/scorecards/coverage/page.tsx"), "utf8");
    expect(page).toContain('await requireAdmin("/admin/scorecards/coverage");');
    expect(page.indexOf('await requireAdmin("/admin/scorecards/coverage");')).toBeLessThan(page.indexOf("loadGatewayCoverageReport("));
  });
});
