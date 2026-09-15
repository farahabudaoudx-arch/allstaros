import { GatewaySessionExpiredError } from "../engine.mjs";

function csv(date, cents = 10000) {
  return [
    "File Date,Producer,Producer NPN,Email,Upline,Upline NPN,Agency,All Lines Personal,All Lines Team,1st Leg Producer,1st Leg NPN,1st Leg %,Outside 1st Leg",
    `${date},E2E Producer,999000001,e2e@gateway-e2e.invalid,Upline,1,E2E,$${(cents / 100).toFixed(2)},$${(cents / 50).toFixed(2)},Leg,2,20%,$0`,
  ].join("\n");
}

function monthEndFor(day) {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function createProvider(options = {}) {
  const env = options.env ?? process.env;
  const connectDelayMs = Number(env.GATEWAY_RUNNER_FAKE_CONNECT_DELAY_MS ?? options.connectDelayMs ?? 0);
  const connectFails = env.GATEWAY_RUNNER_FAKE_CONNECT_FAIL === "true" || options.connectFails === true;
  const requirePrompt = env.GATEWAY_RUNNER_FAKE_CONNECT_PROMPT === "true" || options.requirePrompt === true;
  const requireOtp = env.GATEWAY_RUNNER_FAKE_CONNECT_OTP === "true" || options.requireOtp === true;
  const delay = (ms, signal) => new Promise((resolve, reject) => {
    if (!ms) return resolve();
    if (signal?.aborted) return reject(signal.reason ?? new Error("Aborted"));
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
  return {
    async connectInteractive({ signal, surface } = {}) {
      let verificationWasRequired = false;
      if (requirePrompt) {
        const credentials = await surface?.prompt({ kind: "credentials" });
        if (!credentials?.email || !credentials?.password) throw new Error("Synthetic Gateway credentials missing.");
        if (requireOtp) {
          const otp = await surface?.prompt({ kind: "otp" });
          if (!otp) throw new Error("Synthetic Gateway OTP missing.");
          verificationWasRequired = true;
        }
      }
      await delay(Number.isFinite(connectDelayMs) ? Math.max(0, connectDelayMs) : 0, signal);
      if (connectFails) throw new Error("Synthetic Gateway connection failure.");
      return {
        session: {
          version: 2,
          sessionState: { version: 1, cookies: [] },
          id: options.sessionId ?? "fake-session",
          alive: true,
        },
        verificationWasRequired,
      };
    },
    async validateSession(session) {
      return session?.alive !== false;
    },
    async listHistoricalReports(session, { through: _through }) {
      if (session?.alive === false) throw new GatewaySessionExpiredError();
      return options.history ?? [];
    },
    async pullCurrentReports(session, { businessDate }) {
      if (session?.alive === false) throw new GatewaySessionExpiredError();
      const monthStart = `${businessDate.slice(0, 7)}-01`;
      const yearStart = `${businessDate.slice(0, 4)}-01-01`;
      const monthEnd = options.monthEnd ?? monthEndFor(businessDate);
      return options.current ?? [
        {
          periodType: "wtd",
          csvText: csv(businessDate),
          reportDate: businessDate,
          sourceFileName: `wtd-${businessDate}.csv`,
          coverage: {
            periodStart: monthStart,
            periodEnd: monthEnd,
            gatewayReportDate: businessDate,
            weekStart: options.weekStart ?? businessDate,
            weekOrdinal: options.weekOrdinal ?? 1,
            periodFinal: options.periodFinal ?? false,
          },
        },
        { periodType: "mtd", csvText: csv(monthStart), reportDate: businessDate, sourceFileName: `mtd-${businessDate}.csv`, coverage: { periodStart: monthStart, periodEnd: monthEnd, gatewayReportDate: businessDate } },
        { periodType: "ytd", csvText: csv(yearStart), reportDate: businessDate, sourceFileName: `ytd-${businessDate}.csv`, coverage: { periodStart: yearStart, periodEnd: `${businessDate.slice(0, 4)}-12-31`, gatewayReportDate: businessDate } },
      ];
    },
  };
}
