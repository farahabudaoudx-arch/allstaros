import { describe, expect, it } from "vitest";
import {
  aggregatePersonalGatewayReports,
  buildPersonalGatewayEvidenceIndex,
  personalGatewayEvidenceKey,
  requiredGatewayMondays,
  summarizePersonalGatewayEvidence,
  type PersonalGatewayImportEvidence,
  type PersonalGatewayPremiumRow,
} from "./gateway-completeness";

function audit(overrides: Partial<PersonalGatewayImportEvidence> = {}): PersonalGatewayImportEvidence {
  return {
    id: "import-a",
    person_id: "sarah",
    period_type: "wtd",
    status: "imported",
    report_date: "2026-02-02",
    gateway_label: "Week",
    source_checksum: "checksum-a",
    matched_count: 1,
    unmatched_count: 0,
    ambiguous_count: 0,
    summary: { samples: { matchReason: null } },
    created_at: "2026-02-02T12:00:00.000Z",
    ...overrides,
  };
}

function premium(overrides: Partial<PersonalGatewayPremiumRow> = {}): PersonalGatewayPremiumRow {
  return {
    import_id: "import-a",
    person_id: "sarah",
    report_date: "2026-02-02",
    personal_ip_cents: 100,
    team_ip_cents: 500,
    first_leg_percent: 25,
    ...overrides,
  };
}

describe("Gateway Scorecard completeness", () => {
  it("derives exact calendar Mondays including a four-Monday February", () => {
    expect(requiredGatewayMondays({ start: "2026-02-01", end: "2026-02-28" })).toEqual([
      "2026-02-02", "2026-02-09", "2026-02-16", "2026-02-23",
    ]);
    expect(requiredGatewayMondays({ start: "2026-03-01", end: "2026-03-31" })).toHaveLength(5);
    expect(requiredGatewayMondays({ start: "2026-01-01", end: "2026-03-31" })).toHaveLength(13);
    expect(requiredGatewayMondays({ start: "2026-01-01", end: "2026-12-31" })).toHaveLength(52);
  });

  it("never lets Sarah evidence cover Jake", () => {
    const dates = ["2026-02-02"];
    const result = summarizePersonalGatewayEvidence({
      personIds: ["sarah", "jake"],
      requiredDates: dates,
      imports: [audit()],
      premiumRows: [premium()],
    });
    expect(result.byPerson.get("sarah")).toMatchObject({ complete: true, finalWeekReady: true, missingDates: [] });
    expect(result.byPerson.get("jake")).toMatchObject({ complete: false, finalWeekReady: false, missingDates: dates });
  });

  it("treats only the person's own target_npn_not_present as verified zero", () => {
    const zeroAudit = audit({
      id: "zero",
      matched_count: 0,
      unmatched_count: 1,
      summary: { samples: { matchReason: "target_npn_not_present" } },
      created_at: "2026-02-02T13:00:00.000Z",
    });
    const index = buildPersonalGatewayEvidenceIndex(
      [audit(), zeroAudit],
      [premium()], // stale prior row must not survive the newer verified-zero audit
    );
    expect(index.get(personalGatewayEvidenceKey("sarah", "2026-02-02"))?.kind).toBe("verified_zero");
    const reports = aggregatePersonalGatewayReports({
      imports: [audit(), zeroAudit], premiumRows: [premium()], personIds: ["sarah"],
      start: "2026-02-01", end: "2026-02-28",
    });
    expect(reports[0].rows).toEqual([
      { personId: "sarah", personalIpCents: 0, teamIpCents: 0, firstLegPercent: null },
    ]);
  });

  it("keeps missing NPN and ambiguity as holes even when an older audit was valid", () => {
    const missing = audit({
      id: "missing", matched_count: 0, summary: { samples: { matchReason: "person_npn_missing" } },
      created_at: "2026-02-02T13:00:00.000Z",
    });
    expect(buildPersonalGatewayEvidenceIndex([audit(), missing], [premium()]).size).toBe(0);

    const ambiguous = audit({
      id: "ambiguous", matched_count: 0, ambiguous_count: 2,
      summary: { samples: { matchReason: "duplicate_target_npn_in_gateway_report" } },
      created_at: "2026-02-02T14:00:00.000Z",
    });
    expect(buildPersonalGatewayEvidenceIndex([audit(), ambiguous], [premium()]).size).toBe(0);
  });

  it("accepts no_new_report only through its exact imported personal evidence", () => {
    const original = audit();
    const duplicate = audit({
      id: "duplicate",
      status: "no_new_report",
      matched_count: 0,
      summary: { samples: { matchReason: null }, existingImportId: original.id },
      created_at: "2026-02-02T13:00:00.000Z",
    });
    const resolved = buildPersonalGatewayEvidenceIndex([original, duplicate], [premium()]);
    expect(resolved.get(personalGatewayEvidenceKey("sarah", "2026-02-02"))).toMatchObject({
      audit: { id: "duplicate" }, sourceAudit: { id: "import-a" }, kind: "matched",
    });

    const broken = buildPersonalGatewayEvidenceIndex([
      { ...duplicate, summary: { existingImportId: "someone-else" } },
    ], [premium()]);
    expect(broken.size).toBe(0);
  });

  it("requires the final Monday and every earlier Monday independently", () => {
    const requiredDates = requiredGatewayMondays({ start: "2026-02-01", end: "2026-02-28" });
    const imports = requiredDates
      .filter((date) => date !== "2026-02-09")
      .map((date, index) => audit({ id: `i-${index}`, report_date: date, created_at: `${date}T12:00:00.000Z` }));
    const premiums = imports.map((row) => premium({ import_id: row.id, report_date: row.report_date! }));
    const result = summarizePersonalGatewayEvidence({ personIds: ["sarah"], requiredDates, imports, premiumRows: premiums });
    expect(result.byPerson.get("sarah")).toMatchObject({
      complete: false,
      finalWeekReady: true,
      missingDates: ["2026-02-09"],
    });
  });

  it("does not turn a Wednesday reconnect WTD into an extra Scorecard week", () => {
    const monday = audit({ id: "monday", report_date: "2026-02-02" });
    const wednesday = audit({
      id: "wednesday",
      report_date: "2026-02-04",
      created_at: "2026-02-04T12:00:00.000Z",
    });
    const reports = aggregatePersonalGatewayReports({
      imports: [monday, wednesday],
      premiumRows: [
        premium({ import_id: "monday", report_date: "2026-02-02" }),
        premium({ import_id: "wednesday", report_date: "2026-02-04" }),
      ],
      personIds: ["sarah"],
      start: "2026-02-01",
      end: "2026-02-28",
    });
    expect(reports.map((report) => report.reportDate)).toEqual(["2026-02-02"]);
  });

  it("keeps a single historical hole blocking quarter and year even when the final Monday is present", () => {
    for (const period of [
      { start: "2026-01-01", end: "2026-03-31" },
      { start: "2026-01-01", end: "2026-12-31" },
    ]) {
      const requiredDates = requiredGatewayMondays(period);
      const imports = requiredDates
        .filter((date) => date !== "2026-02-09")
        .map((date, index) => audit({
          id: `period-${period.end}-${index}`,
          report_date: date,
          created_at: `${date}T12:00:00.000Z`,
        }));
      const premiums = imports.map((row) => premium({
        import_id: row.id,
        report_date: row.report_date!,
      }));
      const result = summarizePersonalGatewayEvidence({
        personIds: ["sarah"],
        requiredDates,
        imports,
        premiumRows: premiums,
      });
      expect(result.byPerson.get("sarah")).toMatchObject({
        complete: false,
        finalWeekReady: true,
        missingDates: ["2026-02-09"],
      });
    }
  });
});
