import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ importReport: vi.fn() }));
vi.mock("@/lib/gateway/personal-issued-premium", () => ({
  runGatewayPersonalIssuedPremiumImport: mocks.importReport,
}));

import { gatewayReportImportErrorStatus } from "@/lib/gateway/report-pulls";
import { POST } from "./route";

describe("Gateway personal report import route", () => {
  const original = process.env.GATEWAY_AGENT_REPORT_TOKEN;
  beforeEach(() => mocks.importReport.mockReset());
  afterEach(() => {
    if (original === undefined) delete process.env.GATEWAY_AGENT_REPORT_TOKEN;
    else process.env.GATEWAY_AGENT_REPORT_TOKEN = original;
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
        periodType: "wtd",
        csvText: "csv-data",
        reportDate: "2026-09-07",
        sourceFileName: "wtd-2026-09-07.csv",
      }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.importReport).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "job-1",
      sessionGeneration: 2,
      periodType: "wtd",
      reportDate: "2026-09-07",
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
        periodType: "wtd",
        csvText: "csv-data",
        reportDate: "2026-02-31",
      }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_report_date" });
    expect(mocks.importReport).not.toHaveBeenCalled();
  });

  it("maps stale claimed-generation failures to HTTP 409", () => {
    expect(gatewayReportImportErrorStatus(new Error("Gateway report pull job is no longer active."))).toBe(409);
    expect(gatewayReportImportErrorStatus(new Error("stale_gateway_report_pull_session"))).toBe(409);
    expect(gatewayReportImportErrorStatus(new Error("bad csv"))).toBe(400);
  });
});
