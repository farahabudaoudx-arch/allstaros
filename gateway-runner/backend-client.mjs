export class GatewayBackendError extends Error {
  constructor(message, { status = 0, code = null } = {}) {
    super(message);
    this.name = "GatewayBackendError";
    this.status = status;
    this.code = code;
  }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

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

  claim(signal) {
    return this.request("/api/gateway/report-jobs/claim", {
      body: { leaseSeconds: this.config.leaseSeconds },
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
