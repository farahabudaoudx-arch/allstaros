import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { __test } from "./gateway.mjs";

function minimalWorkbook(rows) {
  const shared = [];
  const sharedIndex = new Map();
  const stringCell = (ref, value) => {
    if (!sharedIndex.has(value)) {
      sharedIndex.set(value, shared.length);
      shared.push(value);
    }
    return `<c r="${ref}" t="s"><v>${sharedIndex.get(value)}</v></c>`;
  };
  const cell = (ref, value) => typeof value === "number"
    ? `<c r="${ref}"><v>${value}</v></c>`
    : stringCell(ref, String(value));
  const letters = (index) => String.fromCharCode(65 + index);
  const sheetRows = rows.map((row, rowIndex) =>
    `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => cell(`${letters(columnIndex)}${rowIndex + 1}`, value)).join("")}</row>`,
  ).join("");
  const sharedXml = `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared.map((value) => `<si><t>${value}</t></si>`).join("")}</sst>`;
  return Buffer.from(zipSync({
    "xl/workbook.xml": strToU8('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/sharedStrings.xml": strToU8(sharedXml),
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`),
  }));
}

describe("real Gateway provider evidence helpers", () => {
  it("keeps legacy Chrome profile compatibility opt-in for acceptance", () => {
    const config = __test.providerConfig({
      GATEWAY_RUNNER_GATEWAY_LEGACY_PROFILE_DIR: "/tmp/gateway-profile",
      GATEWAY_RUNNER_GATEWAY_LEGACY_CDP_PORT: "9224",
    });
    expect(config.legacyProfileDir).toBe("/tmp/gateway-profile");
    expect(config.legacyCdpPort).toBe(9224);
    expect(__test.providerConfig({}).legacyProfileDir).toBeNull();
  });

  it("uses configured client login credentials only when both values are present", () => {
    const configured = {
      GATEWAY_LOGIN_EMAIL: "  client@example.com  ",
      GATEWAY_LOGIN_PASSWORD: "configured-value",
    };
    expect(__test.gatewayLoginCredentials(configured)).toBeNull();
    expect(__test.gatewayLoginCredentials(configured, true)).toEqual({
      email: "client@example.com",
      password: "configured-value",
    });
    expect(__test.gatewayLoginCredentials({ GATEWAY_LOGIN_EMAIL: "client@example.com" }, true)).toBeNull();
    expect(__test.gatewayLoginCredentials({ GATEWAY_LOGIN_PASSWORD: "configured-value" }, true)).toBeNull();
  });

  it("matches the proven client routes for current versus historical WTD", () => {
    const config = { statsBaseUrl: new URL("https://stats.uppatop.com") };
    expect(__test.periodUrl(config, "wtd", "abc-123", "2026-08-28", true)).toBe(
      "https://stats.uppatop.com/ipreport/abc-123",
    );
    expect(__test.periodUrl(config, "wtd", "abc-123", "2026-08-28")).toBe(
      "https://stats.uppatop.com/ipreport/abc-123/2026-08-28",
    );
    expect(__test.periodUrl(config, "mtd", "abc-123", "2026-08-28", true)).toBe(
      "https://stats.uppatop.com/ipreport_mtd/abc-123/2026-08-28",
    );
  });
  it("derives covered-month identity and marks the highest Gateway Week N in that month as final", () => {
    const entries = __test.normalizeWeeklyEntries([
      { date: "2026-08-07", weekOrdinal: 1, monthId: "August-2026" },
      { date: "2026-08-28", weekOrdinal: 4, monthId: "August-2026" },
      { date: "2026-07-28", weekOrdinal: 4, monthId: "July-2026" },
      { date: "2026-07-31", weekOrdinal: 5, monthId: "July-2026" },
      { date: "2026-09-30", weekOrdinal: 5, monthId: "September-2026" },
    ]);
    expect(entries.find((entry) => entry.date === "2026-08-28")).toMatchObject({
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      weekOrdinal: 4,
      periodFinal: true,
    });
    expect(entries.find((entry) => entry.date === "2026-07-28")?.periodFinal).toBe(false);
    expect(entries.find((entry) => entry.date === "2026-07-31")?.periodFinal).toBe(true);
    expect(entries.find((entry) => entry.date === "2026-09-30")).toMatchObject({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      periodFinal: true,
    });
  });

  it("backfills every WTD but only closed-month MTD/YTD plus the current open month snapshot", () => {
    const entries = __test.normalizeWeeklyEntries([
      { date: "2026-07-28", weekOrdinal: 4, monthId: "July-2026" },
      { date: "2026-07-31", weekOrdinal: 5, monthId: "July-2026" },
      { date: "2026-08-07", weekOrdinal: 1, monthId: "August-2026" },
      { date: "2026-08-28", weekOrdinal: 4, monthId: "August-2026" },
    ]);
    const plan = __test.historicalPlan(entries, "2026-07-01", "2026-09-05");
    expect(plan.map(({ periodType, entry }) => `${entry.date}:${periodType}`)).toEqual([
      "2026-07-28:wtd",
      "2026-07-31:wtd",
      "2026-07-31:mtd",
      "2026-07-31:ytd",
      "2026-08-07:wtd",
      "2026-08-28:wtd",
      "2026-08-28:mtd",
      "2026-08-28:ytd",
    ]);
  });

  it("converts the observed Gateway workbook shape to importer CSV and preserves File Date evidence", () => {
    const headers = [
      "File Date", "Producer", "Producer NPN", "Email", "Upline", "Upline NPN", "Agency",
      "All Lines Personal", "All Lines Team", "1st Leg Producer", "1st Leg NPN", "1st Leg %", "Outside 1st Leg",
    ];
    const workbook = minimalWorkbook([
      headers,
      [46256, "Acceptance Producer", 999000001, "acceptance@example.invalid", "Upline", 1, "Agency", 100, 250, "Leg", 2, 0.2, 50],
    ]);
    const parsed = __test.workbookToGatewayCsv(workbook);
    expect(parsed.fileDate).toBe("2026-08-22");
    expect(parsed.rowCount).toBe(1);
    expect(parsed.csvText).toContain("8/22/2026,Acceptance Producer,999000001");
    expect(parsed.csvText).toContain("$100.00,$250.00,Leg,2,20.00%,$50.00");
  });

  it("normalizes Gateway date strings and Excel serial dates without using the download filename", () => {
    expect(__test.normalizeGatewayDate("08/01/2026")).toBe("2026-08-01");
    expect(__test.normalizeGatewayDate(46256)).toBe("2026-08-22");
  });

  it("fails closed when MTD/YTD workbook File Date disagrees with Gateway coverage", () => {
    const entry = { periodStart: "2026-08-01" };
    expect(() => __test.assertAggregateEvidence("mtd", entry, "2026-08-01")).not.toThrow();
    expect(() => __test.assertAggregateEvidence("mtd", entry, "2026-08-02")).toThrow(
      "Gateway MTD File Date does not match the covered month.",
    );
    expect(() => __test.assertAggregateEvidence("ytd", entry, "2026-01-01")).not.toThrow();
    expect(() => __test.assertAggregateEvidence("ytd", entry, "2025-01-01")).toThrow(
      "Gateway YTD File Date does not match the covered year.",
    );
  });
});
