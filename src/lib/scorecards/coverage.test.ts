import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ScorecardPeriod } from "./period";
import { summarizeGatewayCoverage } from "./coverage";

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

function report(overrides: Partial<Parameters<typeof summarizeGatewayCoverage>[0]> = {}) {
  return summarizeGatewayCoverage({
    period,
    scope: "all",
    roles: [role("producer", true, false), role("builder", false, true)],
    people,
    importedReportDates: ["2026-07-03"],
    premiumRows: [
      { person_id: "producer", report_date: "2026-07-03", personal_ip_cents: 100_000, team_ip_cents: 500_000 },
      { person_id: "builder", report_date: "2026-07-03", personal_ip_cents: 0, team_ip_cents: 900_000 },
    ],
    ...overrides,
  });
}

describe("Gateway Scorecard coverage", () => {
  it("counts all eligible card scopes as covered when their required Gateway field is present", () => {
    expect(report()).toMatchObject({ inScope: 2, covered: 2, missing: 0, coveragePercent: 100 });
  });

  it("counts some eligible people as missing and preserves covered + missing = in scope", () => {
    const result = report({ premiumRows: [
      { person_id: "producer", report_date: "2026-07-03", personal_ip_cents: 100_000, team_ip_cents: 500_000 },
    ] });
    expect(result).toMatchObject({ inScope: 2, covered: 1, missing: 1, coveragePercent: 50 });
    expect(result.covered + result.missing).toBe(result.inScope);
    expect(result.missingPeople.map((entry) => entry.personId)).toEqual(["builder"]);
  });

  it("returns zero counts when nobody is eligible", () => {
    expect(report({ roles: [role("producer", true, false, "inactive")] })).toMatchObject({
      inScope: 0, covered: 0, missing: 0, coveragePercent: 0,
    });
  });

  it("keeps Producer coverage missing when Personal IP is absent even if Team IP exists", () => {
    const result = report({
      scope: "producer",
      roles: [role("producer", true, false)],
      importedReportDates: ["2026-07-03"],
      premiumRows: [{ person_id: "producer", report_date: "2026-07-03", personal_ip_cents: null, team_ip_cents: 9_999_999 }],
    });
    expect(result).toMatchObject({ inScope: 1, covered: 0, missing: 1 });
    expect(result.missingPeople[0]?.cardType).toBe("producer");
  });

  it("ignores Gateway rows outside the selected period and rows from non-imported report dates", () => {
    const result = report({
      scope: "producer",
      roles: [role("producer", true, false)],
      importedReportDates: ["2026-06-30"],
      premiumRows: [
        { person_id: "producer", report_date: "2026-06-30", personal_ip_cents: 100_000, team_ip_cents: 0 },
        { person_id: "producer", report_date: "2026-07-10", personal_ip_cents: 100_000, team_ip_cents: 0 },
      ],
    });
    expect(result).toMatchObject({ inScope: 1, covered: 0, missing: 1 });
  });

  it("supports Producer and Builder scopes independently, including dual-role people", () => {
    const common = {
      roles: [role("dual", true, true)],
      premiumRows: [{ person_id: "dual", report_date: "2026-07-03", personal_ip_cents: 10, team_ip_cents: 20 }],
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
