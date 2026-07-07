"use client";

import { useMemo, useState } from "react";
import { AreaChart, type ChartPoint } from "@/components/producer/charts/AreaChart";

export type PeriodKey = "wtd" | "mtd" | "ytd";

export type IpPeriodValues = {
  personalCents: number;
  teamCents: number;
  firstLegProducer: string | null;
  firstLegPercent: number | null;
  outsideFirstLegCents: number;
};

// One Gateway upload (report date) with whichever of the three period
// snapshots matched this person in that upload.
export type IpReport = {
  reportDate: string;
  rangeLabel: string;
  uploadedAt: string;
  periods: Partial<Record<PeriodKey, IpPeriodValues>>;
};

const PERIODS: Array<{ key: PeriodKey; label: string; full: string }> = [
  { key: "wtd", label: "WTD", full: "Week to Date" },
  { key: "mtd", label: "MTD", full: "Month to Date" },
  { key: "ytd", label: "YTD", full: "Year to Date" },
];

type BuilderMetric = "team" | "personal" | "leg1";

const METRIC_LABELS: Record<BuilderMetric, string> = {
  team: "Team IP",
  personal: "Personal IP",
  leg1: "1st Leg",
};

function money(cents: number): string {
  return "$" + Math.round(cents / 100).toLocaleString("en-US");
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Gateway reports the biggest leg as a percent of team IP, not as dollars.
// Deriving dollars from that percent keeps the two columns consistent.
function firstLegCents(v: IpPeriodValues): number | null {
  if (v.firstLegPercent == null) return null;
  return Math.round((v.teamCents * v.firstLegPercent) / 100);
}

function fmtPct(p: number | null): string {
  return p == null ? "—" : p.toFixed(1) + "%";
}

export function IssuedPremiumView({
  reports,
  isBuilder,
  hasNpn,
}: {
  reports: IpReport[]; // oldest first
  isBuilder: boolean;
  hasNpn: boolean;
}) {
  const [period, setPeriod] = useState<PeriodKey>("mtd");
  const [metric, setMetric] = useState<BuilderMetric>("team");
  const [hover, setHover] = useState<number | null>(null);

  const periodMeta = PERIODS.find((p) => p.key === period)!;

  // Reports that actually carry the selected period, oldest first.
  const series = useMemo(
    () => reports.filter((r) => r.periods[period]),
    [reports, period],
  );
  const latest = series.length ? series[series.length - 1] : null;
  const latestVals = latest ? latest.periods[period]! : null;

  // Producers chart their personal IP; builders chart whichever stat card is
  // selected.
  const chartValue = (v: IpPeriodValues) => {
    if (!isBuilder) return v.personalCents;
    if (metric === "personal") return v.personalCents;
    if (metric === "leg1") return firstLegCents(v) ?? 0;
    return v.teamCents;
  };
  const chartLabel = isBuilder ? METRIC_LABELS[metric] : "IP";

  const points: ChartPoint[] = useMemo(
    () =>
      series.map((r) => ({
        value: chartValue(r.periods[period]!) / 100,
        label: r.rangeLabel,
        date: r.reportDate,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, period, isBuilder, metric],
  );

  const readout = useMemo(() => {
    if (hover != null && series[hover]) {
      const r = series[hover];
      return {
        label: `${r.rangeLabel} · uploaded ${fmtDate(r.reportDate)}`,
        value: money(chartValue(r.periods[period]!)),
      };
    }
    return {
      label: isBuilder
        ? `${chartLabel} · ${periodMeta.full}`
        : periodMeta.full,
      value: latestVals ? money(chartValue(latestVals)) : "—",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover, series, period, periodMeta, latestVals, isBuilder, metric]);

  const leg1 = latestVals ? firstLegCents(latestVals) : null;
  const leg1Pct = latestVals ? latestVals.firstLegPercent : null;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-mute">
            Tracking
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] md:text-4xl">
            Issued Premium
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-subtle">
            {isBuilder
              ? "Team issued premium across your downline, from Gateway uploaded to your account."
              : "Issued premium totals from Gateway uploaded to your account."}
          </p>
        </div>
        <div className="no-scrollbar flex max-w-full items-center gap-1 self-start overflow-x-auto rounded-full border border-hairline bg-card p-1 md:self-auto">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                setPeriod(p.key);
                setHover(null);
              }}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition ${
                period === p.key
                  ? "bg-accent text-black"
                  : "text-subtle hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-hairline bg-card px-6 py-12 text-center">
          <p className="text-lg font-semibold text-ink">
            No issued premium yet
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-subtle">
            Gateway reports are uploaded to All Star OS every morning. Once a
            report includes your production, it shows up here automatically.
          </p>
          {!hasNpn && (
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-subtle">
              Gateway matches you by NPN, and there is no NPN on your account
              yet. Add it in Settings so your numbers can connect.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Stat cards */}
          {isBuilder ? (
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
              <button
                type="button"
                onClick={() => {
                  setMetric("team");
                  setHover(null);
                }}
                className={`flex min-h-[9.5rem] flex-col justify-between rounded-2xl bg-accent p-6 text-left text-black transition ${
                  metric === "team"
                    ? "ring-2 ring-accent ring-offset-2 ring-offset-background"
                    : "opacity-90 hover:opacity-100"
                }`}
              >
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-black/60">
                  Team IP · {periodMeta.full}
                </p>
                <div>
                  <p className="text-4xl font-semibold tabular-nums tracking-[-0.03em] md:text-5xl">
                    {latestVals ? money(latestVals.teamCents) : "—"}
                  </p>
                  <p className="mt-1.5 text-[13px] text-black/60">
                    Personal + full downline
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMetric("personal");
                  setHover(null);
                }}
                className={`flex flex-col justify-center gap-2.5 rounded-2xl border bg-card p-6 text-left transition ${
                  metric === "personal"
                    ? "border-transparent ring-2 ring-accent ring-offset-2 ring-offset-background"
                    : "border-hairline hover:border-mute"
                }`}
              >
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-mute">
                  Personal IP
                </p>
                <p className="text-3xl font-semibold tabular-nums tracking-[-0.02em]">
                  {latestVals ? money(latestVals.personalCents) : "—"}
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMetric("leg1");
                  setHover(null);
                }}
                className={`flex min-w-0 flex-col justify-center gap-2.5 rounded-2xl border bg-card p-6 text-left transition ${
                  metric === "leg1"
                    ? "border-transparent ring-2 ring-accent ring-offset-2 ring-offset-background"
                    : "border-hairline hover:border-mute"
                }`}
              >
                <p className="truncate font-mono text-xs uppercase tracking-[0.16em] text-mute">
                  1st Leg
                  {latestVals?.firstLegProducer
                    ? ` - ${latestVals.firstLegProducer}`
                    : ""}
                </p>
                <p className="text-3xl font-semibold tabular-nums tracking-[-0.02em]">
                  {leg1 != null ? money(leg1) : "—"}
                </p>
              </button>
              <div className="flex flex-col justify-center gap-3 rounded-2xl border border-hairline bg-card p-6">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-mute">
                  1st Leg %
                </p>
                <p className="text-3xl font-semibold tabular-nums tracking-[-0.02em]">
                  {fmtPct(leg1Pct)}
                </p>
                <div className="h-1.5 overflow-hidden rounded-full bg-card-hi">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-500"
                    style={{ width: `${Math.min(100, leg1Pct ?? 0)}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
              <div className="flex min-h-[9rem] flex-col justify-between rounded-2xl bg-accent p-6 text-black sm:col-span-2 lg:col-span-1">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-black/60">
                  Issued Premium · {periodMeta.full}
                </p>
                <p className="text-4xl font-semibold tabular-nums tracking-[-0.03em] md:text-5xl">
                  {latestVals ? money(latestVals.personalCents) : "—"}
                </p>
              </div>
              <div className="flex flex-col justify-center gap-2.5 rounded-2xl border border-hairline bg-card p-6">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-mute">
                  Gateways Uploaded
                </p>
                <p className="text-3xl font-semibold tabular-nums tracking-[-0.02em]">
                  {reports.length}
                </p>
              </div>
              <div className="flex flex-col justify-center gap-2.5 rounded-2xl border border-hairline bg-card p-6">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-mute">
                  Latest Upload
                </p>
                <p className="text-3xl font-semibold tabular-nums tracking-[-0.02em]">
                  {fmtDate(reports[reports.length - 1].reportDate)}
                </p>
              </div>
            </div>
          )}

          {/* Trend chart */}
          <div className="mt-3 rounded-2xl border border-hairline bg-card p-5 md:p-6">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-mute">
                  {readout.label}
                </p>
                <p className="mt-1 text-4xl font-semibold tabular-nums text-accent">
                  {readout.value}
                </p>
              </div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
                {chartLabel} Trend · {periodMeta.label}
              </p>
            </div>
            <div className="mt-4 h-56 w-full md:h-64">
              {points.length >= 2 ? (
                <AreaChart
                  points={points}
                  onHighlightChange={(_p, i) => setHover(i)}
                />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-mute">
                  The trend appears once at least two Gateway reports have been
                  uploaded.
                </div>
              )}
            </div>
          </div>

          {/* Report uploads table */}
          <div className="mt-3 overflow-hidden rounded-2xl border border-hairline bg-card">
            <div className="flex items-baseline justify-between gap-4 px-6 pb-3 pt-5">
              <h2 className="text-lg font-semibold tracking-[-0.02em]">
                Report Uploads
              </h2>
              <p className="text-[13px] text-subtle">
                {reports.length}{" "}
                {reports.length === 1 ? "upload" : "uploads"}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse">
                <thead>
                  <tr className="border-y border-hairline">
                    <Th align="left">Range</Th>
                    <Th align="left">Upload Date</Th>
                    {isBuilder ? (
                      <>
                        <Th>Personal IP</Th>
                        <Th>Team IP</Th>
                        <Th>1st Leg</Th>
                        <Th>1st Leg %</Th>
                      </>
                    ) : (
                      <>
                        <Th>WTD IP</Th>
                        <Th>MTD IP</Th>
                        <Th>YTD IP</Th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {[...reports].reverse().map((r) => {
                    const v = r.periods[period];
                    return (
                      <tr
                        key={r.reportDate}
                        className="border-b border-hairline transition last:border-b-0 hover:bg-card-hi/40"
                      >
                        <Td align="left" strong>
                          {r.rangeLabel}
                        </Td>
                        <Td align="left" subtle>
                          {fmtDate(r.uploadedAt)}
                        </Td>
                        {isBuilder ? (
                          <>
                            <Td subtle>
                              {v ? money(v.personalCents) : "—"}
                            </Td>
                            <Td strong>{v ? money(v.teamCents) : "—"}</Td>
                            <Td subtle>
                              {v && firstLegCents(v) != null
                                ? money(firstLegCents(v)!)
                                : "—"}
                            </Td>
                            <Td subtle>
                              {v ? fmtPct(v.firstLegPercent) : "—"}
                            </Td>
                          </>
                        ) : (
                          <>
                            <Td subtle>
                              {r.periods.wtd
                                ? money(r.periods.wtd.personalCents)
                                : "—"}
                            </Td>
                            <Td subtle>
                              {r.periods.mtd
                                ? money(r.periods.mtd.personalCents)
                                : "—"}
                            </Td>
                            <Td strong>
                              {r.periods.ytd
                                ? money(r.periods.ytd.personalCents)
                                : "—"}
                            </Td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {isBuilder && (
              <p className="border-t border-hairline px-6 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-mute">
                Showing {periodMeta.full} figures. Switch the timeframe above.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Th({
  children,
  align = "right",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-6 py-2.5 font-mono text-[11px] font-normal uppercase tracking-[0.14em] text-mute ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "right",
  strong = false,
  subtle = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  strong?: boolean;
  subtle?: boolean;
}) {
  return (
    <td
      className={`px-6 py-4 text-[15px] tabular-nums ${
        align === "left" ? "text-left" : "text-right"
      } ${strong ? "font-medium text-ink" : subtle ? "text-subtle" : "text-ink"}`}
    >
      {children}
    </td>
  );
}
