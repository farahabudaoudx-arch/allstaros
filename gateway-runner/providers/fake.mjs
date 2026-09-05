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
  return {
    async connectInteractive() {
      return { session: { id: options.sessionId ?? "fake-session", alive: true }, verificationWasRequired: false };
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
            weekStart: options.weekStart ?? businessDate,
            weekOrdinal: options.weekOrdinal ?? 1,
            periodFinal: options.periodFinal ?? false,
          },
        },
        { periodType: "mtd", csvText: csv(monthStart), reportDate: businessDate, sourceFileName: `mtd-${businessDate}.csv`, coverage: { periodStart: monthStart, periodEnd: monthEnd } },
        { periodType: "ytd", csvText: csv(yearStart), reportDate: businessDate, sourceFileName: `ytd-${businessDate}.csv`, coverage: { periodStart: yearStart, periodEnd: `${businessDate.slice(0, 4)}-12-31` } },
      ];
    },
  };
}
