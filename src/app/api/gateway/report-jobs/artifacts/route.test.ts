import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  authorize: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@/lib/gateway/report-artifacts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gateway/report-artifacts")>("@/lib/gateway/report-artifacts");
  return {
    ...actual,
    registerGatewayReportPullArtifact: mocks.register,
    authorizeGatewayReportPullArtifactUpload: mocks.authorize,
    confirmGatewayReportPullArtifactUpload: mocks.confirm,
  };
});

import { POST as registerArtifact } from "./register/route";
import { POST as authorizeUpload } from "./upload-ticket/route";
import { POST as confirmUpload } from "./upload-confirm/route";

function request(path: string, body: Record<string, unknown>, token = "secret") {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const claim = {
  jobId: "job-1",
  sessionGeneration: 4,
  claimToken: "claim-1",
};

const wtdEvidence = {
  fileDate: "2026-09-08",
  rowsSeen: 10,
  uniqueNpnCount: 9,
  duplicateNpnValues: 1,
  reportDate: "2026-09-14",
  gatewayReportDate: "2026-09-14",
  scorecardPeriodStart: "2026-09-01",
  scorecardPeriodEnd: "2026-09-30",
  gatewayWeekStart: "2026-09-08",
  gatewayWeekOrdinal: 2,
  gatewayPeriodFinal: false,
};

const mtdEvidence = {
  fileDate: "2026-09-01",
  rowsSeen: 10,
  uniqueNpnCount: 10,
  duplicateNpnValues: 0,
  reportDate: "2026-09-14",
  gatewayReportDate: "2026-09-14",
  scorecardPeriodStart: "2026-09-01",
  scorecardPeriodEnd: "2026-09-30",
};

describe("Gateway report-job artifact routes", () => {
  const original = process.env.GATEWAY_AGENT_REPORT_TOKEN;

  beforeEach(() => {
    process.env.GATEWAY_AGENT_REPORT_TOKEN = "secret";
    mocks.register.mockReset();
    mocks.authorize.mockReset();
    mocks.confirm.mockReset();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.GATEWAY_AGENT_REPORT_TOKEN;
    else process.env.GATEWAY_AGENT_REPORT_TOKEN = original;
    vi.restoreAllMocks();
  });

  it("fails closed when the report-agent token is unavailable", async () => {
    delete process.env.GATEWAY_AGENT_REPORT_TOKEN;
    const response = await registerArtifact(request("/api/gateway/report-jobs/artifacts/register", {}));
    expect(response.status).toBe(503);
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("registers bounded XLSX evidence and never forwards a request person id", async () => {
    mocks.register.mockResolvedValue({
      artifactId: "artifact-1",
      existing: false,
      periodType: "wtd",
      providerType: "http",
      sourceSha256: "a".repeat(64),
      sourceByteCount: 1234,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      storageVerified: false,
    });
    const response = await registerArtifact(request("/api/gateway/report-jobs/artifacts/register", {
      ...claim,
      personId: "attacker-selected-person",
      periodType: "wtd",
      providerType: "http",
      sourceSha256: "A".repeat(64),
      sourceFileName: "wtd.xlsx",
      sourceByteCount: 1234,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ...wtdEvidence,
    }));

    expect(response.status).toBe(200);
    expect(mocks.register).toHaveBeenCalledWith({
      ...claim,
      periodType: "wtd",
      providerType: "http",
      sourceSha256: "a".repeat(64),
      sourceFileName: "wtd.xlsx",
      sourceByteCount: 1234,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      evidence: wtdEvidence,
    });
    expect(JSON.stringify(mocks.register.mock.calls[0]?.[0])).not.toContain("personId");
  });

  it("rejects oversized or malformed artifact registration before the database", async () => {
    const response = await registerArtifact(request("/api/gateway/report-jobs/artifacts/register", {
      ...claim,
      periodType: "wtd",
      providerType: "http",
      sourceSha256: "not-a-sha",
      sourceFileName: "wtd.xlsx",
      sourceByteCount: 25 * 1024 * 1024 + 1,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ...wtdEvidence,
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_gateway_report_artifact" });
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("returns exact replay state from registration and maps conflicts without raw details", async () => {
    mocks.register.mockResolvedValueOnce({ artifactId: "artifact-1", existing: true });
    const body = {
      ...claim,
      periodType: "mtd",
      providerType: "browser",
      sourceSha256: "b".repeat(64),
      sourceFileName: "mtd.xlsx",
      sourceByteCount: 500,
      contentType: "application/octet-stream",
      ...mtdEvidence,
    };
    const replay = await registerArtifact(request("/api/gateway/report-jobs/artifacts/register", body));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ ok: true, artifact: { artifactId: "artifact-1", existing: true } });

    mocks.register.mockRejectedValueOnce(new Error("gateway_report_pull_artifact_conflict private detail"));
    const conflict = await registerArtifact(request("/api/gateway/report-jobs/artifacts/register", body));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: "gateway_report_artifact_conflict" });
  });

  it("rejects invalid canonical coverage metadata before registration", async () => {
    const invalidWtd = await registerArtifact(request("/api/gateway/report-jobs/artifacts/register", {
      ...claim,
      periodType: "wtd",
      providerType: "http",
      sourceSha256: "c".repeat(64),
      sourceFileName: "wtd.xlsx",
      sourceByteCount: 100,
      contentType: "application/octet-stream",
      ...wtdEvidence,
      gatewayWeekOrdinal: null,
    }));
    expect(invalidWtd.status).toBe(400);

    const unexpectedMtdWeek = await registerArtifact(request("/api/gateway/report-jobs/artifacts/register", {
      ...claim,
      periodType: "mtd",
      providerType: "browser",
      sourceSha256: "d".repeat(64),
      sourceFileName: "mtd.xlsx",
      sourceByteCount: 100,
      contentType: "application/octet-stream",
      ...mtdEvidence,
      gatewayWeekStart: "2026-09-07",
      gatewayWeekOrdinal: 2,
      gatewayPeriodFinal: false,
    }));
    expect(unexpectedMtdWeek.status).toBe(400);
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("accepts a WTD File Date in the prior month when it is within six days of the Gateway snapshot", async () => {
    mocks.register.mockResolvedValue({ artifactId: "artifact-boundary", existing: false });
    const response = await registerArtifact(request("/api/gateway/report-jobs/artifacts/register", {
      ...claim,
      periodType: "wtd",
      providerType: "http",
      sourceSha256: "7".repeat(64),
      sourceFileName: "wtd-boundary.xlsx",
      sourceByteCount: 700,
      contentType: "application/octet-stream",
      fileDate: "2026-08-29",
      rowsSeen: 20,
      uniqueNpnCount: 20,
      duplicateNpnValues: 0,
      reportDate: "2026-09-04",
      gatewayReportDate: "2026-09-04",
      scorecardPeriodStart: "2026-09-01",
      scorecardPeriodEnd: "2026-09-30",
      gatewayWeekStart: "2026-08-29",
      gatewayWeekOrdinal: 1,
      gatewayPeriodFinal: false,
    }));
    expect(response.status).toBe(200);
    expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({
      evidence: expect.objectContaining({
        fileDate: "2026-08-29",
        gatewayWeekStart: "2026-08-29",
        gatewayReportDate: "2026-09-04",
      }),
    }));

    mocks.register.mockClear();
    const tooWide = await registerArtifact(request("/api/gateway/report-jobs/artifacts/register", {
      ...claim,
      periodType: "wtd",
      providerType: "http",
      sourceSha256: "8".repeat(64),
      sourceFileName: "wtd-too-wide.xlsx",
      sourceByteCount: 700,
      contentType: "application/octet-stream",
      fileDate: "2026-08-28",
      rowsSeen: 20,
      uniqueNpnCount: 20,
      duplicateNpnValues: 0,
      reportDate: "2026-09-04",
      gatewayReportDate: "2026-09-04",
      scorecardPeriodStart: "2026-09-01",
      scorecardPeriodEnd: "2026-09-30",
      gatewayWeekStart: "2026-08-28",
      gatewayWeekOrdinal: 1,
      gatewayPeriodFinal: false,
    }));
    expect(tooWide.status).toBe(400);
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("keeps acquisition identity on the claim token passed to registration", async () => {
    mocks.register.mockResolvedValue({ artifactId: "artifact-new-claim", existing: false });
    const response = await registerArtifact(request("/api/gateway/report-jobs/artifacts/register", {
      ...claim,
      claimToken: "claim-2",
      periodType: "mtd",
      providerType: "http",
      sourceSha256: "e".repeat(64),
      sourceFileName: "mtd-retry.xlsx",
      sourceByteCount: 600,
      contentType: "application/octet-stream",
      ...mtdEvidence,
    }));
    expect(response.status).toBe(200);
    expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "job-1",
      claimToken: "claim-2",
      periodType: "mtd",
      sourceSha256: "e".repeat(64),
    }));
  });

  it("accepts multiple first-connect snapshots for the same period in one claim", async () => {
    mocks.register
      .mockResolvedValueOnce({ artifactId: "artifact-aug-1", existing: false })
      .mockResolvedValueOnce({ artifactId: "artifact-aug-15", existing: false });
    const base = {
      ...claim,
      periodType: "mtd",
      providerType: "http",
      sourceFileName: "august-mtd.xlsx",
      sourceByteCount: 700,
      contentType: "application/octet-stream",
      fileDate: "2026-08-01",
      rowsSeen: 20,
      uniqueNpnCount: 20,
      duplicateNpnValues: 0,
      reportDate: "2026-09-14",
      scorecardPeriodStart: "2026-08-01",
      scorecardPeriodEnd: "2026-08-31",
    };

    const first = await registerArtifact(request("/api/gateway/report-jobs/artifacts/register", {
      ...base,
      sourceSha256: "1".repeat(64),
      gatewayReportDate: "2026-08-01",
    }));
    const second = await registerArtifact(request("/api/gateway/report-jobs/artifacts/register", {
      ...base,
      sourceSha256: "2".repeat(64),
      gatewayReportDate: "2026-08-15",
    }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mocks.register).toHaveBeenNthCalledWith(1, expect.objectContaining({
      claimToken: "claim-1",
      periodType: "mtd",
      evidence: expect.objectContaining({ gatewayReportDate: "2026-08-01" }),
    }));
    expect(mocks.register).toHaveBeenNthCalledWith(2, expect.objectContaining({
      claimToken: "claim-1",
      periodType: "mtd",
      evidence: expect.objectContaining({ gatewayReportDate: "2026-08-15" }),
    }));
  });

  it("rejects a Gateway snapshot date outside coverage or after acquisition", async () => {
    for (const gatewayReportDate of ["2026-08-31", "2026-09-15"]) {
      const response = await registerArtifact(request("/api/gateway/report-jobs/artifacts/register", {
        ...claim,
        periodType: "wtd",
        providerType: "http",
        sourceSha256: "9".repeat(64),
        sourceFileName: "wtd.xlsx",
        sourceByteCount: 100,
        contentType: "application/octet-stream",
        ...wtdEvidence,
        gatewayReportDate,
      }));
      expect(response.status).toBe(400);
    }
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("accepts historical evidence acquired after its covered period ended", async () => {
    mocks.register.mockResolvedValue({ artifactId: "artifact-history", existing: false });
    const response = await registerArtifact(request("/api/gateway/report-jobs/artifacts/register", {
      ...claim,
      periodType: "mtd",
      providerType: "http",
      sourceSha256: "f".repeat(64),
      sourceFileName: "august-mtd.xlsx",
      sourceByteCount: 700,
      contentType: "application/octet-stream",
      fileDate: "2026-08-01",
      rowsSeen: 20,
      uniqueNpnCount: 20,
      duplicateNpnValues: 0,
      reportDate: "2026-09-14",
      gatewayReportDate: "2026-08-31",
      scorecardPeriodStart: "2026-08-01",
      scorecardPeriodEnd: "2026-08-31",
    }));
    expect(response.status).toBe(200);
    expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({
      evidence: expect.objectContaining({
        reportDate: "2026-09-14",
        gatewayReportDate: "2026-08-31",
        scorecardPeriodEnd: "2026-08-31",
      }),
    }));
  });

  it("authorizes the exact job artifact and returns the signed staging upload ticket", async () => {
    mocks.authorize.mockResolvedValue({
      artifactId: "artifact-1",
      storagePath: "personal_gateway/person/job/4/wtd/hash.xlsx",
      sourceByteCount: 100,
      contentType: "application/octet-stream",
      alreadyVerified: false,
      signedUploadUrl: "https://storage.example/signed-secret",
    });
    const response = await authorizeUpload(request("/api/gateway/report-jobs/artifacts/upload-ticket", {
      ...claim,
      artifactId: "artifact-1",
      personId: "ignored",
    }));
    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith({ ...claim, artifactId: "artifact-1" });
    expect(await response.json()).toMatchObject({ ok: true, upload: { artifactId: "artifact-1", alreadyVerified: false } });
  });

  it("maps a stale upload authorization to 409", async () => {
    mocks.authorize.mockRejectedValue(new Error("stale_gateway_report_pull_claim"));
    const response = await authorizeUpload(request("/api/gateway/report-jobs/artifacts/upload-ticket", {
      ...claim,
      artifactId: "artifact-1",
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "gateway_report_pull_stale" });
  });

  it("confirms by job/artifact identity and ignores caller-supplied storage paths", async () => {
    mocks.confirm.mockResolvedValue({
      artifactId: "artifact-1",
      storagePath: "personal_gateway/person/job/4/wtd/hash.xlsx",
      alreadyVerified: false,
    });
    const response = await confirmUpload(request("/api/gateway/report-jobs/artifacts/upload-confirm", {
      ...claim,
      artifactId: "artifact-1",
      storagePath: "attacker/chosen/path.xlsx",
      observedSha256: "0".repeat(64),
    }));
    expect(response.status).toBe(200);
    expect(mocks.confirm).toHaveBeenCalledWith({ ...claim, artifactId: "artifact-1" });
    expect(JSON.stringify(mocks.confirm.mock.calls[0]?.[0])).not.toContain("storagePath");
  });

  it("returns idempotent confirmed state without requiring another upload", async () => {
    mocks.confirm.mockResolvedValue({
      artifactId: "artifact-1",
      storagePath: "personal_gateway/person/job/4/ytd/hash.xlsx",
      alreadyVerified: true,
    });
    const response = await confirmUpload(request("/api/gateway/report-jobs/artifacts/upload-confirm", {
      ...claim,
      artifactId: "artifact-1",
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, artifact: { alreadyVerified: true } });
  });

  it("never logs a raw artifact helper error that could contain a signed URL", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.authorize.mockRejectedValue(new Error("https://storage.example/signed-secret?token=private"));
    const response = await authorizeUpload(request("/api/gateway/report-jobs/artifacts/upload-ticket", {
      ...claim,
      artifactId: "artifact-1",
    }));
    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalledWith(
      "[gateway-report-jobs/artifacts/upload-ticket] Failed to authorize report artifact upload.",
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("signed-secret");
  });
});
