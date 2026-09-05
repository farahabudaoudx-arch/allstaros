import { GatewayBackendError } from "./backend-client.mjs";

export class GatewaySessionExpiredError extends Error {
  constructor(message = "Gateway session expired.") {
    super(message);
    this.name = "GatewaySessionExpiredError";
  }
}

export class GatewayTransientError extends Error {
  constructor(message = "Gateway operation failed transiently.") {
    super(message);
    this.name = "GatewayTransientError";
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Aborted"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function retryableJobError(error) {
  return error instanceof GatewayTransientError || error instanceof TypeError || error?.name === "AbortError" ||
    (error instanceof GatewayBackendError && [408, 425, 429, 500, 502, 503, 504].includes(error.status));
}

function operationalFailureCode(error) {
  if (error instanceof GatewayBackendError) return `backend_http_${error.status || "unknown"}`;
  if (error instanceof GatewaySessionExpiredError) return "gateway_session_expired";
  if (error instanceof GatewayTransientError) return "gateway_transient_failure";
  if (error instanceof TypeError) return "transport_failure";
  if (error?.name === "AbortError") return "aborted";
  return "unexpected_job_failure";
}

export async function withTimeout(factory, timeoutMs, parentSignal) {
  const controller = new AbortController();
  if (parentSignal?.aborted) throw parentSignal.reason ?? new Error("Aborted");
  const onAbort = () => controller.abort(parentSignal.reason);
  parentSignal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new GatewayTransientError("Gateway provider operation timed out.")), timeoutMs);
  let onControllerAbort = () => {};
  const aborted = new Promise((_, reject) => {
    onControllerAbort = () => reject(controller.signal.reason ?? new Error("Aborted"));
    controller.signal.addEventListener("abort", onControllerAbort, { once: true });
  });
  const operation = Promise.resolve().then(() => factory(controller.signal));
  try {
    // The provider is still required to honor the signal so browser work actually
    // stops. The race makes the runner itself bounded even if a buggy provider
    // ignores cancellation; its orphaned promise is no longer awaited by a worker.
    return await Promise.race([operation, aborted]);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener("abort", onControllerAbort);
    parentSignal?.removeEventListener("abort", onAbort);
  }
}

function validIsoDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateReport(report) {
  if (!report || !["wtd", "mtd", "ytd"].includes(report.periodType) || typeof report.csvText !== "string" || !report.csvText.trim()) {
    throw new Error("Gateway provider returned an invalid report payload.");
  }
  if (!validIsoDay(report.reportDate)) {
    throw new Error("Gateway provider must return the report acquisition date as YYYY-MM-DD.");
  }
  const coverage = report.coverage;
  if (!coverage || !validIsoDay(coverage.periodStart) || !validIsoDay(coverage.periodEnd) || coverage.periodEnd < coverage.periodStart) {
    throw new Error("Gateway report is missing explicit covered-period metadata.");
  }
  if (report.periodType === "wtd") {
    if (
      !Number.isInteger(coverage.weekOrdinal) || coverage.weekOrdinal < 1 || coverage.weekOrdinal > 8 ||
      typeof coverage.periodFinal !== "boolean" ||
      (coverage.weekStart != null && !validIsoDay(coverage.weekStart))
    ) throw new Error("Gateway WTD report is missing explicit coverage metadata.");
  } else if (coverage.weekOrdinal != null || coverage.periodFinal != null || coverage.weekStart != null) {
    throw new Error("Gateway week metadata is only valid for WTD reports.");
  }
}

export class GatewayRunnerEngine {
  constructor({ config, backend, provider, sessions, logger = console }) {
    this.config = config;
    this.backend = backend;
    this.provider = provider;
    this.sessions = sessions;
    this.logger = logger;
    this.runningWorkers = 0;
    this.workerPoolStarted = false;
    this.workerPoolStopped = false;
    this.workerFailures = 0;
    this.lastWorkerFailureAt = null;
    this.lastWorkerFailureCode = null;
  }

  health() {
    return {
      ok: this.workerPoolStarted && !this.workerPoolStopped && this.runningWorkers === this.config.workerConcurrency,
      runningWorkers: this.runningWorkers,
      configuredWorkers: this.config.workerConcurrency,
      workerFailures: this.workerFailures,
      lastWorkerFailureAt: this.lastWorkerFailureAt,
      lastWorkerFailureCode: this.lastWorkerFailureCode,
    };
  }

  recordWorkerFailure(errorOrCode, stage) {
    const code = typeof errorOrCode === "string" ? errorOrCode : operationalFailureCode(errorOrCode);
    this.workerFailures += 1;
    this.lastWorkerFailureAt = new Date().toISOString();
    this.lastWorkerFailureCode = `${stage}:${code}`;
    this.logger.error?.(`[gateway-runner] ${stage} failed (${code}); worker remains active.`);
  }

  async reportCompletion(job, outcome, extra, signal) {
    if (signal?.aborted) return { acknowledged: false, aborted: true, errorCode: "aborted" };
    try {
      const result = await this.backend.complete(job, outcome, extra, signal);
      return { acknowledged: true, result };
    } catch (error) {
      if (error instanceof GatewayBackendError && error.status === 409) return { acknowledged: false, stale: true };
      if (signal?.aborted) return { acknowledged: false, aborted: true, errorCode: "aborted" };
      return { acknowledged: false, errorCode: operationalFailureCode(error) };
    }
  }

  async reportsForJob(job, providerSession, signal) {
    if (job.pullKind === "first_connect") {
      const reports = await withTimeout(
        (providerSignal) => this.provider.listHistoricalReports(providerSession, {
          from: "2026-01-01",
          through: job.businessDate,
          signal: providerSignal,
        }),
        this.config.providerTimeoutMs,
        signal,
      );
      return Array.isArray(reports) ? reports : [];
    }
    const reports = await withTimeout(
      (providerSignal) => this.provider.pullCurrentReports(providerSession, {
        businessDate: job.businessDate,
        signal: providerSignal,
      }),
      this.config.providerTimeoutMs,
      signal,
    );
    const counts = new Map();
    for (const report of reports ?? []) counts.set(report.periodType, (counts.get(report.periodType) ?? 0) + 1);
    if (!["wtd", "mtd", "ytd"].every((type) => counts.get(type) === 1) || (reports ?? []).length !== 3) {
      throw new GatewayTransientError("Gateway current pull must return exactly one WTD, MTD, and YTD report.");
    }
    return reports;
  }

  async runClaimedJob(job, parentSignal) {
    const controller = new AbortController();
    const onAbort = () => controller.abort(parentSignal.reason);
    parentSignal?.addEventListener("abort", onAbort, { once: true });
    let stale = false;
    const heartbeatMs = Math.max(20_000, Math.min(60_000, Math.floor(this.config.leaseSeconds * 1000 / 3)));
    const heartbeat = setInterval(async () => {
      try {
        const result = await this.backend.renew(job, controller.signal);
        if (!result?.ok) {
          stale = true;
          controller.abort(new Error("Gateway job lease is stale."));
        }
      } catch (error) {
        if (error instanceof GatewayBackendError && error.status === 409) {
          stale = true;
          controller.abort(error);
        }
      }
    }, heartbeatMs);
    heartbeat.unref?.();

    try {
      const providerSession = await this.sessions.get(job.sessionRef);
      if (!providerSession) throw new GatewaySessionExpiredError("Gateway session reference is no longer available.");
      if (this.provider.validateSession) {
        const valid = await withTimeout(
          (signal) => this.provider.validateSession(providerSession, { signal }),
          this.config.providerTimeoutMs,
          controller.signal,
        );
        if (!valid) throw new GatewaySessionExpiredError();
      }
      const reports = await this.reportsForJob(job, providerSession, controller.signal);
      for (const report of reports) {
        if (controller.signal.aborted) throw controller.signal.reason;
        validateReport(report);
        await this.backend.importReport(job, report, controller.signal);
      }
      if (stale) return { status: "stale" };
      const completion = await this.reportCompletion(job, "succeeded", {
        summary: { reports: reports.length, pullKind: job.pullKind },
      }, controller.signal);
      if (completion.stale) return { status: "stale" };
      if (!completion.acknowledged) {
        return { status: parentSignal?.aborted ? "aborted" : "completion_unacknowledged", errorCode: completion.errorCode };
      }
      return { status: completion.result?.status ?? "succeeded", reports: reports.length };
    } catch (error) {
      if (stale || (error instanceof GatewayBackendError && error.status === 409)) return { status: "stale" };
      if (parentSignal?.aborted) return { status: "aborted" };
      if (error instanceof GatewaySessionExpiredError) {
        await this.sessions.delete(job.sessionRef);
        const completion = await this.reportCompletion(
          job,
          "needs_reconnect",
          { error: "gateway_session_expired" },
          controller.signal,
        );
        if (completion.stale) return { status: "stale" };
        if (!completion.acknowledged) {
          return { status: "completion_unacknowledged", errorCode: completion.errorCode };
        }
        return { status: completion.result?.status ?? "needs_reconnect" };
      }
      const retryable = retryableJobError(error);
      const completion = await this.reportCompletion(job, retryable ? "retryable" : "failed", {
        error: retryable ? "gateway_transient_failure" : "gateway_report_failure",
      }, controller.signal);
      if (completion.stale) return { status: "stale" };
      if (!completion.acknowledged) {
        return { status: "completion_unacknowledged", errorCode: completion.errorCode };
      }
      return { status: completion.result?.status ?? (retryable ? "queued" : "failed") };
    } finally {
      clearInterval(heartbeat);
      controller.abort();
      parentSignal?.removeEventListener("abort", onAbort);
    }
  }

  async workerLoop(signal) {
    this.runningWorkers += 1;
    const failureBackoffMs = Math.min(30_000, Math.max(250, this.config.pollIntervalMs));
    try {
      while (!signal.aborted) {
        let job;
        try {
          job = await this.backend.claim(signal);
        } catch (error) {
          if (signal.aborted) break;
          this.recordWorkerFailure(error, "claim");
          await sleep(failureBackoffMs, signal).catch(() => undefined);
          continue;
        }
        if (!job) {
          await sleep(this.config.pollIntervalMs, signal).catch(() => undefined);
          continue;
        }
        try {
          const result = await this.runClaimedJob(job, signal);
          if (signal.aborted || result?.status === "aborted") break;
          if (result?.status === "completion_unacknowledged") {
            this.recordWorkerFailure(result.errorCode ?? "completion_unacknowledged", "completion");
            await sleep(failureBackoffMs, signal).catch(() => undefined);
          }
        } catch (error) {
          if (signal.aborted) break;
          this.recordWorkerFailure(error, "job");
          await sleep(failureBackoffMs, signal).catch(() => undefined);
        }
      }
    } finally {
      this.runningWorkers -= 1;
    }
  }

  async run(signal) {
    this.workerPoolStarted = true;
    this.workerPoolStopped = false;
    try {
      await Promise.all(
        Array.from({ length: this.config.workerConcurrency }, () => this.workerLoop(signal)),
      );
    } finally {
      this.workerPoolStopped = true;
    }
  }
}
