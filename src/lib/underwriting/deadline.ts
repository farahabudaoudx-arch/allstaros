export class AnalysisTimeoutError extends Error {
  constructor(public readonly stage: string) {
    super("Analysis timed out. Please try again or select conditions manually.");
    this.name = "AnalysisTimeoutError";
  }
}

// One absolute budget, including setup and accounting, below Vercel's 30s cap.
export function analysisDeadline(requestSignal: AbortSignal) {
  const started = Date.now();
  const deadline = started + 25_000;
  const requestId = crypto.randomUUID();

  return async function run<T>(
    stage: string,
    budgetMs: number,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    requestSignal.throwIfAborted();
    const remaining = Math.min(budgetMs, deadline - Date.now());
    if (remaining <= 0) throw new AnalysisTimeoutError(stage);
    const controller = new AbortController();
    const stageStarted = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel = () => {};
    const stopped = new Promise<never>((_, reject) => {
      cancel = () => {
        reject(requestSignal.reason);
        controller.abort(requestSignal.reason);
      };
      requestSignal.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(() => {
        const error = new AnalysisTimeoutError(stage);
        reject(error);
        controller.abort(error);
      }, remaining);
    });
    console.info("[underwriting/analyze]", { requestId, stage, event: "start" });
    let outcome = "complete";
    try {
      // Also bound dependencies without cancellation support (auth). Their late
      // settlement is handled by race, and cannot resume the route pipeline.
      return await Promise.race([stopped, operation(controller.signal)]);
    } catch (error) {
      outcome = error instanceof AnalysisTimeoutError ? "timeout" : "error";
      throw error;
    } finally {
      clearTimeout(timer);
      requestSignal.removeEventListener("abort", cancel);
      console.info("[underwriting/analyze]", {
        requestId, stage, event: outcome,
        durationMs: Date.now() - stageStarted, elapsedMs: Date.now() - started,
      });
    }
  };
}
