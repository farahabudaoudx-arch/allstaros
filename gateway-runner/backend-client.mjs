import { createHash, randomUUID } from "node:crypto";

export class GatewayBackendError extends Error {
  constructor(message, { status = 0, code = null } = {}) {
    super(message);
    this.name = "GatewayBackendError";
    this.status = status;
    this.code = code;
  }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function artifactProtocolError() {
  return new GatewayBackendError("Gateway artifact persistence returned invalid state.", { status: 502 });
}

function abortReason(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class GatewayBackendClient {
  constructor(config, fetchImpl = fetch) {
    this.config = config;
    this.fetch = fetchImpl;
  }

  async request(path, {
    method = "POST",
    body,
    token = this.config.reportToken,
    retries = this.config.requestRetries,
    signal,
  } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (signal?.aborted) throw abortReason(signal);
      const controller = new AbortController();
      const onAbort = () => controller.abort(signal.reason);
      signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
      try {
        const response = await this.fetch(new URL(path, this.config.backendBaseUrl), {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: body == null ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok) return payload;
        const error = new GatewayBackendError(`Gateway backend request failed with HTTP ${response.status}.`, {
          status: response.status,
          code: typeof payload?.error === "string" ? payload.error : null,
        });
        if (!RETRYABLE_STATUS.has(response.status) || attempt === retries) throw error;
        lastError = error;
      } catch (error) {
        lastError = error;
        if (signal?.aborted) throw abortReason(signal);
        const retryable = error?.name === "AbortError" || error instanceof TypeError ||
          (error instanceof GatewayBackendError && RETRYABLE_STATUS.has(error.status));
        if (!retryable || attempt === retries) throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
      await delay(Math.min(2000, 100 * 2 ** attempt), signal);
    }
    throw lastError;
  }

  claim(signal, claimRequestId = randomUUID()) {
    return this.request("/api/gateway/report-jobs/claim", {
      body: { leaseSeconds: this.config.leaseSeconds, claimRequestId },
      signal,
    })
      .then((payload) => payload.job ?? null);
  }

  renew(job, signal) {
    return this.request("/api/gateway/report-jobs/renew", {
      retries: 0,
      signal,
      body: {
        jobId: job.id,
        sessionGeneration: job.sessionGeneration,
        claimToken: job.claimToken,
        leaseSeconds: this.config.leaseSeconds,
      },
    });
  }

  importReport(job, report, signal) {
    return this.request("/api/gateway/report-jobs/import", {
      signal,
      body: {
        jobId: job.id,
        sessionGeneration: job.sessionGeneration,
        claimToken: job.claimToken,
        periodType: report.periodType,
        csvText: report.csvText,
        reportDate: report.reportDate,
        sourceFileName: report.sourceFileName ?? null,
        gatewayLabel: report.gatewayLabel ?? null,
        scorecardPeriodStart: report.coverage?.periodStart ?? null,
        scorecardPeriodEnd: report.coverage?.periodEnd ?? null,
        gatewayWeekStart: report.coverage?.weekStart ?? null,
        gatewayWeekOrdinal: report.coverage?.weekOrdinal ?? null,
        gatewayPeriodFinal: report.coverage?.periodFinal ?? null,
      },
    });
  }

  async uploadArtifactBytes(signedUrl, bytes, contentType, signal) {
    let target;
    try {
      target = new URL(signedUrl);
    } catch {
      throw artifactProtocolError();
    }
    if (
      target.protocol !== "https:" || target.username || target.password ||
      typeof this.config.artifactUploadOrigin !== "string" ||
      target.origin !== this.config.artifactUploadOrigin
    ) throw artifactProtocolError();

    let lastError;
    const attempts = Math.max(1, Math.min(3, this.config.requestRetries + 1));
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (signal?.aborted) throw abortReason(signal);
      const controller = new AbortController();
      const onAbort = () => controller.abort(signal.reason);
      signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), Math.max(this.config.requestTimeoutMs, 60_000));
      try {
        const response = await this.fetch(target, {
          method: "PUT",
          headers: {
            "content-type": contentType,
            "cache-control": "max-age=0",
            "x-upsert": "true",
          },
          body: bytes,
          signal: controller.signal,
        });
        if (response.ok) return;
        if (!RETRYABLE_STATUS.has(response.status) || attempt + 1 === attempts) {
          throw new GatewayBackendError("Gateway artifact storage upload was rejected.", { status: response.status });
        }
        lastError = new GatewayBackendError("Gateway artifact storage upload failed transiently.", { status: response.status });
      } catch (error) {
        lastError = error;
        if (signal?.aborted) throw abortReason(signal);
        const retryable = error?.name === "AbortError" || error instanceof TypeError ||
          (error instanceof GatewayBackendError && RETRYABLE_STATUS.has(error.status));
        if (!retryable || attempt + 1 === attempts) throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
      await delay(Math.min(2000, 100 * 2 ** attempt), signal);
    }
    throw lastError ?? artifactProtocolError();
  }

  async persistArtifact(job, report, signal) {
    const artifact = report?.artifact;
    if (!artifact || !["http", "browser"].includes(artifact.providerType)) throw artifactProtocolError();
    if (!/^[0-9a-f]{64}$/i.test(artifact.sourceSha256 ?? "")) throw artifactProtocolError();
    if (!Number.isSafeInteger(artifact.sourceByteCount) || artifact.sourceByteCount <= 0) throw artifactProtocolError();
    if (typeof artifact.rawXlsxBase64 !== "string" || !artifact.rawXlsxBase64) throw artifactProtocolError();
    const bytes = Buffer.from(artifact.rawXlsxBase64, "base64");
    const observedSha256 = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== artifact.sourceByteCount || observedSha256 !== artifact.sourceSha256.toLowerCase()) {
      throw new GatewayBackendError("Gateway artifact evidence did not match canonical XLSX bytes.", { status: 422 });
    }
    const contentType = typeof artifact.contentType === "string" && artifact.contentType
      ? artifact.contentType
      : "application/octet-stream";
    const sourceFileName = typeof artifact.sourceFileName === "string" && artifact.sourceFileName
      ? artifact.sourceFileName
      : `gateway-${report.periodType}-${report.reportDate}.xlsx`;
    const claim = {
      jobId: job.id,
      sessionGeneration: job.sessionGeneration,
      claimToken: job.claimToken,
    };
    const registeredPayload = await this.request("/api/gateway/report-jobs/artifacts/register", {
      signal,
      body: {
        ...claim,
        periodType: report.periodType,
        providerType: artifact.providerType,
        sourceSha256: artifact.sourceSha256.toLowerCase(),
        sourceFileName,
        sourceByteCount: artifact.sourceByteCount,
        contentType,
        fileDate: artifact.fileDate,
        rowsSeen: artifact.rowsSeen,
        uniqueNpnCount: artifact.uniqueNpnCount,
        duplicateNpnValues: artifact.duplicateNpnValues,
        reportDate: report.reportDate,
        gatewayReportDate: report.coverage?.gatewayReportDate,
        scorecardPeriodStart: report.coverage?.periodStart,
        scorecardPeriodEnd: report.coverage?.periodEnd,
        ...(report.periodType === "wtd" ? {
          gatewayWeekStart: report.coverage?.weekStart,
          gatewayWeekOrdinal: report.coverage?.weekOrdinal,
          gatewayPeriodFinal: report.coverage?.periodFinal,
        } : {}),
      },
    });
    const registered = registeredPayload?.artifact;
    const artifactId = registered?.artifactId;
    if (registeredPayload?.ok !== true || typeof artifactId !== "string" || !artifactId) throw artifactProtocolError();

    const ticketPayload = await this.request("/api/gateway/report-jobs/artifacts/upload-ticket", {
      signal,
      body: { ...claim, artifactId },
    });
    const upload = ticketPayload?.upload;
    if (
      ticketPayload?.ok !== true || !upload || typeof upload !== "object" ||
      typeof upload.alreadyVerified !== "boolean" ||
      upload.sourceByteCount !== artifact.sourceByteCount ||
      typeof upload.contentType !== "string" || !upload.contentType
    ) throw artifactProtocolError();

    if (!upload.alreadyVerified) {
      if (typeof upload.signedUploadUrl !== "string" || !upload.signedUploadUrl) throw artifactProtocolError();
      await this.uploadArtifactBytes(upload.signedUploadUrl, bytes, upload.contentType, signal);
      const confirmed = await this.request("/api/gateway/report-jobs/artifacts/upload-confirm", {
        signal,
        body: { ...claim, artifactId },
      });
      if (confirmed?.ok !== true) throw artifactProtocolError();
    }
    return registered;
  }

  complete(job, outcome, extra = {}, signal) {
    return this.request("/api/gateway/report-jobs/complete", {
      signal,
      body: {
        jobId: job.id,
        sessionGeneration: job.sessionGeneration,
        claimToken: job.claimToken,
        outcome,
        ...extra,
      },
    });
  }

  callback(callbackUrl, state, sessionRef, signal) {
    return this.request(callbackUrl.toString(), {
      token: this.config.connectToken,
      signal,
      body: { state, sessionRef },
    });
  }

  failConnect(state, error = "gateway_connect_failed", signal) {
    return this.request("/api/gateway/connect/fail", {
      token: this.config.connectToken,
      signal,
      body: { state, error },
    });
  }
}
