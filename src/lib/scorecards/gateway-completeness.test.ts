import { describe, expect, it } from "vitest";
import {
  aggregatePersonalGatewayReports,
  buildPersonalGatewayEvidenceIndex,
  gatewayPeriodRequirements,
  personalGatewayCoverageEvidenceKey,
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

function scopedAudit(args: {
  id: string;
  acquisition: string;
  weekDate: string;
  weekOrdinal: number;
  scorecardStart?: string;
  scorecardEnd?: string;
  final?: boolean;
  personId?: string;
  checksum?: string;
  createdAt?: string;
  status?: string;
  existingImportId?: string;
}): PersonalGatewayImportEvidence {
  const personId = args.personId ?? "sarah";
  return audit({
    id: args.id,
    person_id: personId,
    source_kind: "personal_gateway",
    pull_kind: "monday",
    status: args.status ?? "imported",
    report_date: args.acquisition,
    period_start: args.weekDate,
    scorecard_period_start: args.scorecardStart ?? "2026-02-01",
    scorecard_period_end: args.scorecardEnd ?? "2026-02-28",
    gateway_week_ordinal: args.weekOrdinal,
    gateway_period_final: args.final ?? false,
    source_checksum: args.checksum ?? `checksum-${args.id}`,
    created_at: args.createdAt ?? `${args.acquisition}T12:00:00.000Z`,
    summary: args.existingImportId
      ? { samples: { matchReason: null }, existingImportId: args.existingImportId }
      : { samples: { matchReason: null } },
  });
}

function scopedPremium(auditRow: PersonalGatewayImportEvidence, amount = 100): PersonalGatewayPremiumRow {
  return premium({
    import_id: auditRow.id,
    person_id: auditRow.person_id!,
    source_kind: "personal_gateway",
    report_date: auditRow.report_date!,
    period_start: auditRow.period_start,
    scorecard_period_start: auditRow.scorecard_period_start,
    scorecard_period_end: auditRow.scorecard_period_end,
    gateway_week_ordinal: auditRow.gateway_week_ordinal,
    gateway_period_final: auditRow.gateway_period_final,
    personal_ip_cents: amount,
  });
}

describe("Gateway Scorecard completeness", () => {
  it("carries provider week evidence through a repeated audit without using File Date", () => {
    const original = scopedAudit({ id: "sep-w5", acquisition: "2026-10-05", weekDate: "2026-10-05",
      weekOrdinal: 5, scorecardStart: "2026-09-01", scorecardEnd: "2026-09-30" });
    original.summary = { samples: { matchReason: null }, gatewayWeekStart: "2026-09-28" };
    const repeat = { ...original, id: "repeat", status: "no_new_report", created_at: "2026-10-06T12:00:00Z",
      summary: { samples: { matchReason: null }, existingImportId: original.id, gatewayWeekStart: "2026-09-28" } };
    const reports = aggregatePersonalGatewayReports({ imports: [original, repeat],
      premiumRows: [scopedPremium(original)], personIds: ["sarah"], start: "2026-09-01", end: "2026-09-30" });
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ gatewayWeekOrdinal: 5, reportDate: "2026-10-05", gatewayWeekStart: "2026-09-28" });
  });


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

  it("keeps two different Gateway weeks distinct even when they share one acquisition date", () => {
    const week1 = scopedAudit({ id: "w1", acquisition: "2026-03-02", weekDate: "2026-02-02", weekOrdinal: 1 });
    const week2 = scopedAudit({ id: "w2", acquisition: "2026-03-02", weekDate: "2026-02-09", weekOrdinal: 2 });
    const index = buildPersonalGatewayEvidenceIndex(
      [week1, week2],
      [scopedPremium(week1, 100), scopedPremium(week2, 200)],
    );

    expect(index.get(personalGatewayCoverageEvidenceKey("sarah", "2026-02-01", 1))?.premiumRow?.personal_ip_cents).toBe(100);
    expect(index.get(personalGatewayCoverageEvidenceKey("sarah", "2026-02-01", 2))?.premiumRow?.personal_ip_cents).toBe(200);
    expect(aggregatePersonalGatewayReports({
      imports: [week1, week2],
      premiumRows: [scopedPremium(week1, 100), scopedPremium(week2, 200)],
      personIds: ["sarah"],
      start: "2026-02-01",
      end: "2026-02-28",
    }).map((report) => [report.reportDate, report.rows[0].personalIpCents])).toEqual([
      ["2026-02-02", 100],
      ["2026-02-09", 200],
    ]);
  });

  it("keeps different ordinals distinct when covered month, acquisition date, and File Date are identical", () => {
    const week1 = scopedAudit({ id: "same-file-w1", acquisition: "2026-03-02", weekDate: "2026-03-02", weekOrdinal: 1 });
    const week2 = scopedAudit({ id: "same-file-w2", acquisition: "2026-03-02", weekDate: "2026-03-02", weekOrdinal: 2 });
    const reports = aggregatePersonalGatewayReports({
      imports: [week1, week2],
      premiumRows: [scopedPremium(week1, 100), scopedPremium(week2, 200)],
      personIds: ["sarah"],
      start: "2026-02-01",
      end: "2026-02-28",
    });

    expect(reports).toHaveLength(2);
    expect(reports.map((report) => [report.reportDate, report.gatewayWeekOrdinal, report.rows[0]?.personalIpCents])).toEqual([
      ["2026-03-02", 1, 100],
      ["2026-03-02", 2, 200],
    ]);
    expect(new Set(reports.map((report) => report.id)).size).toBe(2);
  });

  it("groups the same canonical week across people while preserving one row per person", () => {
    const sarah = scopedAudit({ id: "sarah-week", acquisition: "2026-03-02", weekDate: "2026-03-02", weekOrdinal: 1, personId: "sarah" });
    const jake = scopedAudit({ id: "jake-week", acquisition: "2026-03-02", weekDate: "2026-03-02", weekOrdinal: 1, personId: "jake" });
    const reports = aggregatePersonalGatewayReports({
      imports: [sarah, jake],
      premiumRows: [scopedPremium(sarah, 100), scopedPremium(jake, 200)],
      personIds: ["sarah", "jake"],
      start: "2026-02-01",
      end: "2026-02-28",
    });

    expect(reports).toHaveLength(1);
    expect(reports[0].rows).toEqual([
      { personId: "jake", personalIpCents: 200, teamIpCents: 500, firstLegPercent: 25 },
      { personId: "sarah", personalIpCents: 100, teamIpCents: 500, firstLegPercent: 25 },
    ]);
  });

  it("keeps the same ordinal in different covered months as distinct buckets", () => {
    const feb = scopedAudit({ id: "feb-w1", acquisition: "2026-03-02", weekDate: "2026-03-02", weekOrdinal: 1 });
    const mar = scopedAudit({
      id: "mar-w1",
      acquisition: "2026-04-01",
      weekDate: "2026-04-01",
      weekOrdinal: 1,
      scorecardStart: "2026-03-01",
      scorecardEnd: "2026-03-31",
    });
    const reports = aggregatePersonalGatewayReports({
      imports: [feb, mar],
      premiumRows: [scopedPremium(feb, 100), scopedPremium(mar, 300)],
      personIds: ["sarah"],
      start: "2026-02-01",
      end: "2026-03-31",
    });

    expect(reports.map((report) => [report.scorecardPeriodStart, report.gatewayWeekOrdinal])).toEqual([
      ["2026-02-01", 1],
      ["2026-03-01", 1],
    ]);
  });

  it("lets a later re-pull replace only its own covered week instead of duplicating it", () => {
    const original = scopedAudit({ id: "original", acquisition: "2026-02-09", weekDate: "2026-02-09", weekOrdinal: 2, createdAt: "2026-02-09T12:00:00.000Z" });
    const repull = scopedAudit({ id: "repull", acquisition: "2026-02-12", weekDate: "2026-02-09", weekOrdinal: 2, createdAt: "2026-02-12T12:00:00.000Z" });
    const sibling = scopedAudit({ id: "sibling", acquisition: "2026-02-12", weekDate: "2026-02-16", weekOrdinal: 3 });
    const index = buildPersonalGatewayEvidenceIndex(
      [original, repull, sibling],
      [scopedPremium(original, 100), scopedPremium(repull, 300), scopedPremium(sibling, 500)],
    );

    expect(index.size).toBe(2);
    expect(index.get(personalGatewayCoverageEvidenceKey("sarah", "2026-02-01", 2))?.sourceAudit.id).toBe("repull");
    expect(index.get(personalGatewayCoverageEvidenceKey("sarah", "2026-02-01", 2))?.premiumRow?.personal_ip_cents).toBe(300);
    expect(index.get(personalGatewayCoverageEvidenceKey("sarah", "2026-02-01", 3))?.premiumRow?.personal_ip_cents).toBe(500);
  });

  it("resolves no-new-report by covered identity even when acquisition dates differ", () => {
    const original = scopedAudit({ id: "original", acquisition: "2026-02-09", weekDate: "2026-02-09", weekOrdinal: 2 });
    const duplicate = scopedAudit({
      id: "duplicate",
      acquisition: "2026-02-12",
      weekDate: "2026-02-09",
      weekOrdinal: 2,
      status: "no_new_report",
      existingImportId: "original",
      createdAt: "2026-02-12T12:00:00.000Z",
    });
    const index = buildPersonalGatewayEvidenceIndex([original, duplicate], [scopedPremium(original, 100)]);
    expect(index.get(personalGatewayCoverageEvidenceKey("sarah", "2026-02-01", 2))).toMatchObject({
      audit: { id: "duplicate" },
      sourceAudit: { id: "original" },
      kind: "matched",
    });
  });

  it("uses explicit final-week ordinals for four-week months and keeps earlier holes visible", () => {
    const rows = [1, 2, 3, 4].map((ordinal) => scopedAudit({
      id: `week-${ordinal}`,
      acquisition: "2026-03-02",
      weekDate: `2026-02-${String(2 + (ordinal - 1) * 7).padStart(2, "0")}`,
      weekOrdinal: ordinal,
      final: ordinal === 4,
    }));
    const requirements = gatewayPeriodRequirements(rows, { start: "2026-02-01", end: "2026-02-28" });
    expect(requirements).toMatchObject({ ready: true, missingMonthStarts: [] });
    expect(requirements.requiredWeeks.map((week) => week.weekOrdinal)).toEqual([1, 2, 3, 4]);

    const evidence = summarizePersonalGatewayEvidence({
      personIds: ["sarah"],
      requiredWeeks: requirements.requiredWeeks,
      imports: rows.filter((row) => row.gateway_week_ordinal !== 2),
      premiumRows: rows.filter((row) => row.gateway_week_ordinal !== 2).map((row) => scopedPremium(row)),
    }).byPerson.get("sarah");
    expect(evidence).toMatchObject({ complete: false, finalWeekReady: true });
    expect(evidence?.missingWeeks.map((week) => week.weekOrdinal)).toEqual([2]);
  });

  it("never accepts legacy agency provenance as current personal Gateway evidence", () => {
    const scoped = scopedAudit({ id: "legacy", acquisition: "2026-03-02", weekDate: "2026-02-23", weekOrdinal: 4, final: true });
    scoped.source_kind = "legacy_agency";
    const row = scopedPremium(scoped);
    row.source_kind = "legacy_agency";
    expect(buildPersonalGatewayEvidenceIndex([scoped], [row]).size).toBe(0);
  });
});
