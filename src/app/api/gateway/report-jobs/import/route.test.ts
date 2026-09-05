import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ importReport: vi.fn() }));
vi.mock("@/lib/gateway/personal-issued-premium", () => ({
  runGatewayPersonalIssuedPremiumImport: mocks.importReport,
}));

import {
  gatewayReportImportErrorStatus,
  gatewayReportImportFailure,
} from "@/lib/gateway/report-pulls";
import { POST } from "./route";

describe("Gateway personal report import route", () => {
  const original = process.env.GATEWAY_AGENT_REPORT_TOKEN;
  beforeEach(() => mocks.importReport.mockReset());
  afterEach(() => {
    if (original === undefined) delete process.env.GATEWAY_AGENT_REPORT_TOKEN;
    else process.env.GATEWAY_AGENT_REPORT_TOKEN = original;
    vi.restoreAllMocks();
  });

  it("fails closed without the report-agent token", async () => {
    delete process.env.GATEWAY_AGENT_REPORT_TOKEN;
    const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/import", { method: "POST" }));
    expect(response.status).toBe(503);
  });

  it("validates job, generation, period, and CSV before calling the importer", async () => {
    process.env.GATEWAY_AGENT_REPORT_TOKEN = "secret";
    const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/import", {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: JSON.stringify({ jobId: "job-1", sessionGeneration: 2, periodType: "monthly", csvText: "x" }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.importReport).not.toHaveBeenCalled();
  });

  it("passes a scoped personal report to the importer", async () => {
    process.env.GATEWAY_AGENT_REPORT_TOKEN = "secret";
    mocks.importReport.mockResolvedValue({ status: "imported", importId: "import-1" });
    const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/import", {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: JSON.stringify({
        jobId: "job-1",
        sessionGeneration: 2,
        claimToken: "claim-1",
        periodType: "wtd",
        csvText: "csv-data",
        reportDate: "2026-09-07",
        sourceFileName: "wtd-2026-09-07.csv",
        scorecardPeriodStart: "2026-09-01",
        scorecardPeriodEnd: "2026-09-30",
        gatewayWeekStart: "2026-09-01",
        gatewayWeekOrdinal: 1,
        gatewayPeriodFinal: false,
      }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.importReport).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "job-1",
      sessionGeneration: 2,
      claimToken: "claim-1",
      periodType: "wtd",
      reportDate: "2026-09-07",
      scorecardCoverage: {
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        weekStart: "2026-09-01",
        weekOrdinal: 1,
        periodFinal: false,
      },
    }));
  });

  it("rejects impossible ISO report dates before import", async () => {
    process.env.GATEWAY_AGENT_REPORT_TOKEN = "secret";
    const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/import", {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: JSON.stringify({
        jobId: "job-1",
        sessionGeneration: 2,
        claimToken: "claim-1",
        periodType: "wtd",
        csvText: "csv-data",
        reportDate: "2026-02-31",
        scorecardPeriodStart: "2026-02-01",
        scorecardPeriodEnd: "2026-02-28",
        gatewayWeekOrdinal: 4,
        gatewayPeriodFinal: true,
      }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_report_date" });
    expect(mocks.importReport).not.toHaveBeenCalled();
  });

  it.each(["2026-02-31", "", 123, "09/07/2026"])("rejects invalid provider week date %s", async (weekStart) => {
    process.env.GATEWAY_AGENT_REPORT_TOKEN = "secret";
    const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/import", {
      method: "POST", headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: JSON.stringify({ jobId: "job-1", claimToken: "claim-1", sessionGeneration: 2, periodType: "wtd", csvText: "csv",
        scorecardPeriodStart: "2026-09-01", scorecardPeriodEnd: "2026-09-30", gatewayWeekOrdinal: 1,
        gatewayPeriodFinal: false, gatewayWeekStart: weekStart }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.importReport).not.toHaveBeenCalled();
  });


  it("classifies runner import failures without exposing raw server details", () => {
    expect(gatewayReportImportErrorStatus(new Error("Gateway report pull job is no longer active."))).toBe(409);
    expect(gatewayReportImportErrorStatus(new Error("stale_gateway_report_pull_session"))).toBe(409);
    expect(gatewayReportImportErrorStatus(new Error("Gateway report is empty or missing data rows."))).toBe(400);
    expect(gatewayReportImportErrorStatus(new Error("Unable to import personal Gateway report: database detail"))).toBe(500);
    expect(gatewayReportImportFailure(new Error("stale_gateway_report_pull_session")).code).toBe("gateway_report_pull_stale");
    expect(gatewayReportImportFailure(new Error("Gateway report is empty or missing data rows.")).code).toBe("invalid_gateway_report");
    expect(gatewayReportImportFailure(new Error("gateway_report_coverage_required")).code).toBe("invalid_gateway_report");
    expect(gatewayReportImportFailure(new Error("Gateway report has inconsistent File Date values.")).code).toBe("invalid_gateway_report");
    expect(gatewayReportImportFailure(new Error("database detail")).code).toBe("gateway_personal_import_failed");
  });

  it("returns a stable 409 code when a claimed job is stale", async () => {
    process.env.GATEWAY_AGENT_REPORT_TOKEN = "secret";
    mocks.importReport.mockRejectedValue(new Error("Gateway report pull job is no longer active."));
    const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/import", {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: JSON.stringify({
        jobId: "job-1",
        sessionGeneration: 2,
        claimToken: "claim-1",
        periodType: "wtd",
        csvText: "csv-data",
        reportDate: "2026-09-07",
        scorecardPeriodStart: "2026-09-01",
        scorecardPeriodEnd: "2026-09-30",
        gatewayWeekOrdinal: 1,
        gatewayPeriodFinal: false,
      }),
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "gateway_report_pull_stale" });
  });

  it("returns a stable 400 code for an invalid Gateway report", async () => {
    process.env.GATEWAY_AGENT_REPORT_TOKEN = "secret";
    mocks.importReport.mockRejectedValue(new Error("Gateway report is empty or missing data rows."));
    const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/import", {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: JSON.stringify({
        jobId: "job-1",
        sessionGeneration: 2,
        claimToken: "claim-1",
        periodType: "wtd",
        csvText: "csv-data",
        reportDate: "2026-09-07",
        scorecardPeriodStart: "2026-09-01",
        scorecardPeriodEnd: "2026-09-30",
        gatewayWeekOrdinal: 1,
        gatewayPeriodFinal: false,
      }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_gateway_report" });
  });

  it("returns a stable 500 code for internal import failures", async () => {
    process.env.GATEWAY_AGENT_REPORT_TOKEN = "secret";
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.importReport.mockRejectedValue(new Error("Unable to import personal Gateway report: private database detail"));
    const response = await POST(new NextRequest("http://localhost/api/gateway/report-jobs/import", {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: JSON.stringify({
        jobId: "job-1",
        sessionGeneration: 2,
        claimToken: "claim-1",
        periodType: "wtd",
        csvText: "csv-data",
        reportDate: "2026-09-07",
        scorecardPeriodStart: "2026-09-01",
        scorecardPeriodEnd: "2026-09-30",
        gatewayWeekOrdinal: 1,
        gatewayPeriodFinal: false,
      }),
    }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "gateway_personal_import_failed" });
    expect(log).toHaveBeenCalledOnce();
  });
});
