import { describe, expect, it } from "vitest";
import { parseGatewayIssuedPremiumCsv } from "./issued-premium";
import {
  personalGatewayReportSkipReason,
  selectPersonalGatewayRow,
  validatePersonalGatewayReportDate,
} from "./personal-issued-premium";

function csv(rows: string[]) {
  return [
    "File Date,Producer,Producer NPN,Email,Upline,Upline NPN,Agency,All Lines Personal,All Lines Team,1st Leg Producer,1st Leg NPN,1st Leg %,Outside 1st Leg",
    ...rows,
  ].join("\n");
}

function parsedRows(rows: string[]) {
  return parseGatewayIssuedPremiumCsv(csv(rows), {
    periodType: "mtd",
    reportDate: "2026-09-04",
    sourceFileName: "gateway-2026-09-04.csv",
  }).rows;
}

describe("personal Gateway issued-premium scoping", () => {
  it("selects only the connected person's NPN and ignores other rows in their file", () => {
    const rows = parsedRows([
      "9/1/2026,Sarah,123456,sarah@example.com,Wylie,900,Agency,$100,$500,Leg,222,40%,$300",
      "9/1/2026,Jake,654321,jake@example.com,Wylie,900,Agency,$200,$600,Leg,333,30%,$420",
    ]);
    const result = selectPersonalGatewayRow(rows, "123-456");
    expect(result.row?.producer).toBe("Sarah");
    expect(result.row?.producerNpn).toBe("123456");
    expect(result.ignoredCount).toBe(1);
    expect(result.ambiguousCount).toBe(0);
  });

  it("does not fall back to another person's row when the connected NPN is absent", () => {
    const rows = parsedRows([
      "9/1/2026,Jake,654321,jake@example.com,Wylie,900,Agency,$200,$600,Leg,333,30%,$420",
    ]);
    const result = selectPersonalGatewayRow(rows, "123456");
    expect(result.row).toBeNull();
    expect(result.reason).toBe("target_npn_not_present");
  });

  it("treats duplicate target NPN rows as ambiguous instead of writing one arbitrarily", () => {
    const rows = parsedRows([
      "9/1/2026,Sarah A,123456,a@example.com,Wylie,900,Agency,$100,$500,Leg,222,40%,$300",
      "9/1/2026,Sarah B,123456,b@example.com,Wylie,900,Agency,$200,$600,Leg,333,30%,$420",
    ]);
    const result = selectPersonalGatewayRow(rows, "123456");
    expect(result.row).toBeNull();
    expect(result.ambiguousCount).toBe(2);
    expect(result.reason).toBe("duplicate_target_npn_in_gateway_report");
  });

  it("enforces the 2026-only cutoff only for first-connect history", () => {
    expect(personalGatewayReportSkipReason("first_connect", "2025-12-31")).toBe("first_connect_before_2026");
    expect(personalGatewayReportSkipReason("first_connect", "2026-01-01")).toBeNull();
    expect(personalGatewayReportSkipReason("monday", "2025-12-31")).toBeNull();
    expect(personalGatewayReportSkipReason("reconnect", "2025-12-31")).toBeNull();
  });

  it("fences current pulls to their Chicago business date and rejects future history", () => {
    expect(() => validatePersonalGatewayReportDate("monday", "2026-09-07", "2026-09-07")).not.toThrow();
    expect(() => validatePersonalGatewayReportDate("reconnect", "2026-09-09", "2026-09-09")).not.toThrow();
    expect(() => validatePersonalGatewayReportDate("first_connect", "2026-09-09", "2026-03-31")).not.toThrow();
    expect(() => validatePersonalGatewayReportDate("monday", "2026-09-07", "2026-09-06"))
      .toThrow("does not match");
    expect(() => validatePersonalGatewayReportDate("first_connect", "2026-09-09", "2026-10-01"))
      .toThrow("later than");
  });
});
