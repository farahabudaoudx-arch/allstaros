"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { UsStateMap, type StateDatum } from "@/components/producer/charts/UsStateMap";
import { HallOfFameTracker } from "@/components/producer/issued-premium/HallOfFameTracker";
import { PRODUCER_LOAD_ERROR_COPY } from "@/lib/producer/error-copy";
import { localIsoDate } from "@/lib/producer/time";
import { PageHeader } from "@/components/producer/PageHeader";

type Timeframe = "today" | "wtd" | "mtd" | "ytd" | "all" | "custom";

const TIMEFRAMES: Array<{ key: Timeframe; label: string }> = [
  { key: "today", label: "Today" },
  { key: "wtd", label: "WTD" },
  { key: "mtd", label: "MTD" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "ALL" },
];

type RawMetrics = {
  leads: number;
  dials: number;
  contacts: number;
  appointments: number;
  presentations: number;
  sales: number;
  ap: number;
  ip: number;
  issuedCount: number;
  deposits: number;
  leadSpend: number;
};

type StatePerfRow = { state: string; leads: number; sales: number; ap: number };
type AgeBandRow = { band: string; leads: number; sales: number; ap: number };
type CarrierRow = { name: string; sales: number; ap: number; avgPremium: number; avgFace: number };

type ServerMetrics = {
  ok: true;
  range: { key: string; from: string; to: string };
  totals: {
    leads: number; dials: number; contacts: number; appointments: number;
    presentations: number; sales: number;
    ap_cents: number; ip_cents: number; issuedCount: number;
    deposits_cents: number; leadSpend_cents: number;
  };
  state_perf: Array<{ state: string; leads: number; sales: number; ap_cents: number }>;
  age_bands: Array<{ band: string; leads: number; sales: number; ap_cents: number }>;
  carrier_perf: Array<{
    name: string; sales: number; ap_cents: number;
    avg_monthly_premium_cents: number; avg_face_amount_cents: number;
  }>;
  // Official Gateway personal YTD IP for the Hall of Fame band; null when this
  // person has no matched Gateway report yet.
  hof: { currentCents: number; year: number } | null;
};

const EMPTY_METRICS: RawMetrics = {
  leads: 0, dials: 0, contacts: 0, appointments: 0,
  presentations: 0, sales: 0, ap: 0, ip: 0, issuedCount: 0,
  deposits: 0, leadSpend: 0,
};

function toMetrics(s: ServerMetrics["totals"]): RawMetrics {
  return {
    leads: s.leads, dials: s.dials, contacts: s.contacts, appointments: s.appointments,
    presentations: s.presentations, sales: s.sales,
    ap: s.ap_cents / 100, ip: s.ip_cents / 100, issuedCount: s.issuedCount,
    deposits: s.deposits_cents / 100, leadSpend: s.leadSpend_cents / 100,
  };
}

function pct(num: number, den: number): number {
  if (den === 0) return 0;
  return (num / den) * 100;
}

function safeDiv(num: number, den: number): number {
  if (den === 0) return 0;
  return num / den;
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString();
}

function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtMoneyExact(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtRoi(p: number): string {
  if (!isFinite(p)) return "—";
  const abs = Math.abs(p);
  if (abs >= 100_000) return `${(p / 1000).toFixed(0)}k%`;
  if (abs >= 10_000) return `${(p / 1000).toFixed(1)}k%`;
  return `${Math.round(p)}%`;
}

function roiFontSize(p: number): string {
  const s = fmtRoi(p);
  if (s.length >= 7) return "1.25rem";
  if (s.length >= 6) return "1.5rem";
  if (s.length >= 5) return "1.75rem";
  return "1.875rem";
}

type SectionKey = "hallOfFame" | "overview" | "percentages" | "activity" | "cost" | "roi" | "performance" | "calendar";

const SECTION_LABELS: Record<SectionKey, string> = {
  hallOfFame: "Hall of Fame",
  overview: "Overview",
  percentages: "Percentages",
  activity: "Activity Needed",
  cost: "Cost Analysis",
  roi: "Return On Investment",
  performance: "Performance",
  calendar: "Calendar",
};
const DEFAULT_SECTION_ORDER: SectionKey[] = [
  "hallOfFame", "overview", "percentages", "activity", "cost", "roi", "performance", "calendar",
];
const ALL_SECTIONS: ReadonlySet<SectionKey> = new Set(DEFAULT_SECTION_ORDER);

type SectionLayout = { order: SectionKey[]; hidden: SectionKey[] };

const LS_ANALYTICS_LAYOUT = "allstaros:analyticsLayout";

function readLayout(): SectionLayout {
  if (typeof window === "undefined") return { order: DEFAULT_SECTION_ORDER, hidden: [] };
  try {
    const raw = window.localStorage.getItem(LS_ANALYTICS_LAYOUT);
    if (!raw) return { order: DEFAULT_SECTION_ORDER, hidden: [] };
    const parsed = JSON.parse(raw) as Partial<SectionLayout>;
    const savedOrder: SectionKey[] = Array.isArray(parsed.order)
      ? parsed.order.filter((k): k is SectionKey => typeof k === "string" && ALL_SECTIONS.has(k as SectionKey))
      : [];
    // Start from the saved order, then splice in any sections the saved layout
    // predates (e.g. Hall of Fame) at their default position, so a newly added
    // section shows where it's meant to instead of always at the end.
    const order: SectionKey[] = [...savedOrder];
    DEFAULT_SECTION_ORDER.forEach((k, i) => {
      if (!order.includes(k)) order.splice(Math.min(i, order.length), 0, k);
    });
    const hidden: SectionKey[] = Array.isArray(parsed.hidden)
      ? parsed.hidden.filter((k): k is SectionKey => typeof k === "string" && ALL_SECTIONS.has(k as SectionKey))
      : [];
    return { order, hidden };
  } catch {
    return { order: DEFAULT_SECTION_ORDER, hidden: [] };
  }
}

function writeLayout(layout: SectionLayout) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(LS_ANALYTICS_LAYOUT, JSON.stringify(layout)); } catch { /* quota */ }
}

export function AnalyticsView({
  personId,
  title = "Analytics",
  backHref,
}: {
  // When set, the board renders a downline producer's metrics (read-only).
  personId?: string;
  title?: string;
  // Only set when this is the top-level page (not embedded read-only inside
  // a team member's detail page) — shows the centered title + back pill.
  backHref?: string;
} = {}) {
  const readOnly = !!personId;
  const [addOpen, setAddOpen] = useState(false);
  const [calendarReloadKey, setCalendarReloadKey] = useState(0);
  const [layout, setLayout] = useState<SectionLayout>({ order: DEFAULT_SECTION_ORDER, hidden: [] });
  const [layoutOpen, setLayoutOpen] = useState(false);
  useEffect(() => { setLayout(readLayout()); }, []);

  function updateLayout(next: SectionLayout) {
    setLayout(next);
    writeLayout(next);
  }
  const [tf, setTf] = useState<Timeframe>("mtd");
  const [calOpen, setCalOpen] = useState(false);
  const today = localIsoDate();
  const weekAgo = localIsoDate(new Date(Date.now() - 6 * 86_400_000));
  const [customFrom, setCustomFrom] = useState<string>(weekAgo);
  const [customTo, setCustomTo] = useState<string>(today);
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);

  const [server, setServer] = useState<ServerMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    function load() {
      setLoading(true); setError(null);
      const params = new URLSearchParams();
      params.set("range", tf);
      if (tf === "custom" && customRange) {
        params.set("from", customRange.from);
        params.set("to", customRange.to);
      }
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) params.set("tz", tz);
      if (personId) params.set("personId", personId);
      return fetch(`/api/producer/analytics/metrics?${params.toString()}`, { cache: "no-store" })
        .then(async (r) => {
          if (!r.ok) throw new Error("load failed");
          return r.json();
        })
        .then((j) => {
          if (aborted) return;
          if (!j.ok) throw new Error("load failed");
          setServer(j as ServerMetrics);
        })
        .catch(() => { if (!aborted) setError(PRODUCER_LOAD_ERROR_COPY); })
        .finally(() => { if (!aborted) setLoading(false); });
    }
    load();
    function onVisible() { if (document.visibilityState === "visible") load(); }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      aborted = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tf, customRange, personId]);

  const m: RawMetrics = useMemo(() => server ? toMetrics(server.totals) : EMPTY_METRICS, [server]);

  const STATE_PERF: StatePerfRow[] = useMemo(
    () => (server?.state_perf ?? []).map((r) => ({ state: r.state, leads: r.leads, sales: r.sales, ap: r.ap_cents / 100 })),
    [server],
  );
  const AGE_BANDS: AgeBandRow[] = useMemo(
    () => (server?.age_bands ?? []).map((r) => ({ band: r.band, leads: r.leads, sales: r.sales, ap: r.ap_cents / 100 })),
    [server],
  );
  const CARRIER_PERF: CarrierRow[] = useMemo(
    () => (server?.carrier_perf ?? []).map((r) => ({
      name: r.name, sales: r.sales, ap: r.ap_cents / 100,
      avgPremium: r.avg_monthly_premium_cents / 100,
      avgFace: r.avg_face_amount_cents / 100,
    })),
    [server],
  );

  const contactRate = pct(m.contacts, m.dials);
  const presentationRate = pct(m.presentations, m.dials);
  const closeRate = pct(m.sales, m.presentations);

  const dialsPerSale = safeDiv(m.dials, m.sales);
  const contactsPerSale = safeDiv(m.contacts, m.sales);
  const appointmentsPerSale = safeDiv(m.appointments, m.sales);
  const presentationsPerSale = safeDiv(m.presentations, m.sales);

  const apPerDial = safeDiv(m.ap, m.dials);
  const apPerContact = safeDiv(m.ap, m.contacts);
  const apPerAppointment = safeDiv(m.ap, m.appointments);
  const apPerPresentation = safeDiv(m.ap, m.presentations);

  const avgAPPerSale = safeDiv(m.ap, m.sales);
  const roi = m.leadSpend > 0 ? ((m.deposits - m.leadSpend) / m.leadSpend) * 100 : 0;

  const costPerContact = safeDiv(m.leadSpend, m.contacts);
  const costPerAppointment = safeDiv(m.leadSpend, m.appointments);
  const costPerPresentation = safeDiv(m.leadSpend, m.presentations);
  const costPerSale = safeDiv(m.leadSpend, m.sales);

  function applyCustomRange() {
    setCustomRange({ from: customFrom, to: customTo });
    setTf("custom");
    setCalOpen(false);
  }

  return (
    <div className="ll-analytics space-y-8 pt-2">
      {/* Header */}
      {backHref ? (
        <PageHeader title={title} backHref={backHref}>
          <div className="flex items-center justify-center gap-3">
            {loading && <span className="text-xs" style={{ color: "var(--ink-3)" }}>loading…</span>}
            {error && <span className="text-xs" style={{ color: "var(--danger)" }}>{error}</span>}
            {!readOnly && (
              <button onClick={() => setAddOpen(true)} className="btn btn-primary text-sm" title="Manually log activity for a day">
                <PlusIcon /> Add Data
              </button>
            )}
          </div>
        </PageHeader>
      ) : (
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div className="flex items-baseline gap-3">
            <h1 className="display-mega text-white leading-none">{title}</h1>
            {loading && <span className="text-xs" style={{ color: "var(--ink-3)" }}>loading…</span>}
            {error && <span className="text-xs" style={{ color: "var(--danger)" }}>{error}</span>}
          </div>
          {!readOnly && (
            <div className="flex items-center gap-2">
              <button onClick={() => setAddOpen(true)} className="btn btn-primary text-sm" title="Manually log activity for a day">
                <PlusIcon /> Add Data
              </button>
            </div>
          )}
        </div>
      )}

      {/* Controls — timeframe, custom range, layout settings */}
      <div className="flex items-center justify-start sm:justify-end gap-2 flex-wrap relative">
        <div className="tab-pills">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTf(t.key); setCustomRange(null); setCalOpen(false); }}
              data-active={tf === t.key}
            >
              {t.label}
            </button>
          ))}
          {/* Custom is a pill like the rest: clicking it highlights it + opens the picker;
              clicking any preset closes the picker and moves the highlight back. */}
          <button
            onClick={() => setCalOpen((v) => !v)}
            data-active={tf === "custom" || calOpen}
            title={customRange ? `${customRange.from} → ${customRange.to}` : "Custom range"}
            className="inline-flex items-center gap-1"
          >
            <CalendarIcon />
            {tf === "custom" && customRange ? `${customRange.from.slice(5)} → ${customRange.to.slice(5)}` : "Custom"}
          </button>
        </div>
        <button
          onClick={() => setLayoutOpen((v) => !v)}
          className="btn-icon"
          aria-label="Customize sections"
          title="Customize sections"
          data-active={layoutOpen}
        >
          <GearIcon />
        </button>
        {calOpen && (
          <div className="absolute right-0 top-full mt-2 z-20 card p-4 w-[280px]" style={{ background: "var(--bg-inner)" }}>
            <div className="text-sm mb-3" style={{ color: "var(--ink-1)" }}>Custom range</div>
            <div className="space-y-2.5">
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--ink-2)" }}>From</label>
                <input type="date" value={customFrom} min="2000-01-01" max={customTo} onChange={(e) => setCustomFrom(e.target.value)} className="input text-sm [color-scheme:dark]" />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--ink-2)" }}>To</label>
                <input type="date" value={customTo} min={customFrom} max={today} onChange={(e) => setCustomTo(e.target.value)} className="input text-sm [color-scheme:dark]" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setCalOpen(false)} className="btn btn-pill flex-1 text-xs">Cancel</button>
                <button onClick={applyCustomRange} className="btn btn-primary flex-1 text-xs">Apply</button>
              </div>
            </div>
          </div>
        )}
        {layoutOpen && (
          <SectionsSettings
            layout={layout}
            onChange={updateLayout}
            onClose={() => setLayoutOpen(false)}
          />
        )}
      </div>

      {(() => {
        const sections: Record<SectionKey, React.ReactNode> = {
          // Official Gateway personal YTD figure. Reorderable/hideable like any
          // other section; renders nothing until this person has a Gateway match.
          hallOfFame: server?.hof ? (
            <HallOfFameTracker
              className=""
              currentCents={server.hof.currentCents}
              year={server.hof.year}
            />
          ) : null,
          overview: (
            <Section title="Overview">
              <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:gap-0">
                <div className="card-lime p-5 lg:w-48 flex-shrink-0 relative lg:rounded-r-none">
                  <span className="text-xs opacity-70">New Leads</span>
                  <div className="display text-5xl tnum mt-2 leading-none">{fmtInt(m.leads)}</div>
                </div>
                <div className="card flex-1 p-5 lg:py-5 lg:pr-5 lg:pl-0 min-w-0 lg:rounded-l-none lg:border-l-0">
                  <FunnelChart
                    stages={[
                      { label: "Dials", value: fmtInt(m.dials), conversion: null },
                      { label: "Contacts", value: fmtInt(m.contacts), conversion: `${pct(m.contacts, m.dials).toFixed(1)}% of dials` },
                      { label: "Appointments", value: fmtInt(m.appointments), conversion: `${pct(m.appointments, m.dials).toFixed(1)}% of dials` },
                      { label: "Presentations", value: fmtInt(m.presentations), conversion: `${pct(m.presentations, m.dials).toFixed(1)}% of dials` },
                      { label: "Policies Sold", value: fmtInt(m.sales), conversion: `${pct(m.sales, m.presentations).toFixed(1)}% close` },
                      { label: "Total AP", value: fmtMoney(m.ap), conversion: `${fmtMoneyExact(avgAPPerSale)} avg` },
                    ]}
                  />
                </div>
              </div>
            </Section>
          ),

          percentages: (
            <Section title="Percentages">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <PercentMetric label="Contact Rate" value={contactRate} />
                <PercentMetric label="Presentation Rate" value={presentationRate} />
                {/* Close Rate centers beneath the other two on mobile (trinity)
                    instead of sitting alone in the left column. */}
                <div className="col-span-2 mx-auto w-1/2 md:col-span-1 md:mx-0 md:w-auto">
                  <PercentMetric label="Close Rate" value={closeRate} />
                </div>
              </div>
            </Section>
          ),

          activity: (
            <Section title="Activity Needed" subtitle="Per policy sold">
              <ActivityCard
                rows={[
                  { label: "Dials", value: dialsPerSale, unit: "dials" },
                  { label: "Contacts", value: contactsPerSale, unit: "contacts" },
                  { label: "Appointments", value: appointmentsPerSale, unit: "appts" },
                  { label: "Presentations", value: presentationsPerSale, unit: "presentations" },
                ]}
              />
            </Section>
          ),

          cost: (
            <Section title="Cost Analysis">
              <CostAnalysisBoard
                stages={[
                  { stage: "Dial", verb: "make", ap: apPerDial },
                  { stage: "Contact", verb: "get", ap: apPerContact, cost: costPerContact },
                  { stage: "Appointment", verb: "get", ap: apPerAppointment, cost: costPerAppointment },
                  { stage: "Presentation", verb: "get", ap: apPerPresentation, cost: costPerPresentation },
                  { stage: "Sale", verb: "close", ap: avgAPPerSale, cost: costPerSale },
                ]}
              />
            </Section>
          ),

          roi: (
            <Section title="Return On Investment">
              {/* Stacks vertically on mobile (full-width cards, no truncation)
                  and joins into one horizontal bar at lg+. */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-0 lg:overflow-hidden lg:rounded-2xl">
                <div className="card-lime rounded-2xl p-5 lg:w-44 flex-shrink-0 lg:rounded-2xl lg:rounded-r-none flex flex-col justify-center min-w-0">
                  <span className="text-xs opacity-70">Lead Spend</span>
                  <div className="display text-4xl tnum mt-2 leading-none">{fmtMoney(m.leadSpend)}</div>
                  <div className="text-xs opacity-70 mt-3">invested</div>
                </div>

                <div className="card rounded-2xl flex-1 p-5 min-w-0 lg:rounded-none lg:border-x-0">
                  <RoiFlow
                    ap={m.ap}
                    avgAPPerSale={avgAPPerSale}
                    leadSpend={m.leadSpend}
                  />
                </div>

                <div className="card-lime rounded-2xl lg:w-44 flex-shrink-0 lg:rounded-2xl lg:rounded-l-none flex flex-col">
                  <div className="p-5 flex-1 flex flex-col justify-center min-w-0">
                    <span className="text-xs opacity-70">ROI</span>
                    <div
                      className="display tnum mt-1 leading-none"
                      style={{
                        color: roi < 0 ? "#5a1a1a" : undefined,
                        fontSize: roiFontSize(roi),
                      }}
                    >
                      {fmtRoi(roi)}
                    </div>
                    <div className="text-[11px] opacity-70 mt-1">collected</div>
                  </div>
                </div>
              </div>
            </Section>
          ),

          performance: (
            <Section title="Performance">
              <div className="grid lg:grid-cols-12 gap-4">
                {/* State performance — map */}
                <div className="card lg:col-span-6 p-5">
                  <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
                    <span className="section-label">State Performance</span>
                    <span className="text-xs" style={{ color: "var(--ink-3)" }}>hover for AP</span>
                  </div>
                  <UsStateMap
                    metricLabel="Total AP"
                    data={STATE_PERF.reduce<Record<string, StateDatum>>((acc, r) => {
                      acc[r.state] = {
                        value: r.ap,
                        display: fmtMoney(r.ap),
                        sub: `${r.sales} ${r.sales === 1 ? "policy" : "policies"}`,
                      };
                      return acc;
                    }, {})}
                  />
                </div>

                {/* Age band performance — bar chart */}
                <div className="card lg:col-span-6 p-5 flex flex-col">
                  <div className="flex items-baseline justify-between gap-2 mb-5">
                    <span className="section-label">Age Band Performance</span>
                    <span className="text-xs" style={{ color: "var(--ink-3)" }}>by AP</span>
                  </div>
                  <div className="flex-1 flex flex-col justify-between gap-4">
                    {(() => {
                      const maxAp = Math.max(...AGE_BANDS.map((b) => b.ap), 1);
                      return AGE_BANDS.map((b) => {
                        const widthPct = (b.ap / maxAp) * 100;
                        return (
                          <div key={b.band} className="flex flex-col gap-1.5">
                            <div className="flex items-baseline justify-between gap-3">
                              <div className="flex items-baseline gap-3">
                                <span className="display text-lg text-white tnum">{b.band}</span>
                                <span className="text-xs tnum" style={{ color: "var(--ink-3)" }}>
                                  {b.sales} {b.sales === 1 ? "policy" : "policies"}
                                </span>
                              </div>
                              <span className="display text-xl text-white tnum">{fmtMoney(b.ap)}</span>
                            </div>
                            <div className="relative h-7">
                              <motion.div
                                className="absolute inset-y-0 left-0 rounded"
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.max(4, widthPct)}%` }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                                style={{
                                  background: "linear-gradient(90deg, rgba(246,201,69,0.55) 0%, rgba(246,201,69,0.22) 100%)",
                                  border: "1px solid rgba(246,201,69,0.35)",
                                }}
                              />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Carrier performance — scrollable */}
                <div className="card lg:col-span-12 overflow-hidden flex flex-col">
                  <div className="p-5 flex-shrink-0" style={{ borderBottom: "1px solid var(--line-1)" }}>
                    <span className="section-label">Carrier Performance</span>
                  </div>
                  <div className="flex-1 overflow-y-auto" style={{ maxHeight: 280 }}>
                    <table className="t-table">
                      <thead>
                        <tr>
                          <th>Carrier</th>
                          <th>Policies Sold</th>
                          <th>AP</th>
                          <th>Avg Prem</th>
                          <th>Avg Face</th>
                        </tr>
                      </thead>
                      <tbody>
                        {CARRIER_PERF.map((c) => (
                          <tr key={c.name} className="lead-row">
                            <td className="text-white">{c.name}</td>
                            <td className="text-white tnum">{c.sales}</td>
                            <td className="text-white tnum">{fmtMoney(c.ap)}</td>
                            <td className="text-white tnum">{fmtMoney(c.avgPremium)}/mo</td>
                            <td className="text-white tnum">{fmtMoney(c.avgFace)}</td>
                          </tr>
                        ))}
                        {CARRIER_PERF.length === 0 && (
                          <tr>
                            <td colSpan={5} style={{ color: "var(--ink-3)", textAlign: "center" }}>No sales in this range.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </Section>
          ),

          calendar: (
            <Section title="Calendar">
              <AnalyticsCalendar reloadKey={calendarReloadKey} personId={personId} />
            </Section>
          ),
        };
        return layout.order
          .filter((k) => !layout.hidden.includes(k))
          .map((k) => <Fragment key={k}>{sections[k]}</Fragment>);
      })()}

      {addOpen && (
        <AddDataModal
          onClose={() => setAddOpen(false)}
          onSaved={() => setCalendarReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <motion.div
      className="space-y-3"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="flex items-baseline gap-3">
        <h2 className="display-big text-white leading-none">{title}</h2>
        {subtitle && <span className="text-xs" style={{ color: "var(--ink-3)" }}>{subtitle}</span>}
      </div>
      {children}
    </motion.div>
  );
}

function RoiFlow({
  ap, avgAPPerSale, leadSpend,
}: {
  ap: number;
  avgAPPerSale: number;
  leadSpend: number;
}) {
  const apMultiple = leadSpend > 0 ? ap / leadSpend : 0;
  const bars = [
    {
      titleA: "Total AP", titleB: "Avg AP Per Sale",
      valueA: fmtMoney(ap), valueB: fmtMoneyExact(avgAPPerSale),
      width: 100,
      sub: `${apMultiple.toFixed(1)}× spend`,
    },
  ];

  return (
    <div className="flex flex-col h-full justify-center gap-2.5">
      {bars.map((b, i) => (
        <div key={b.titleA} className="relative overflow-hidden" style={{ height: 62 }}>
          <motion.div
            className="absolute inset-y-0 left-0 rounded-md flex items-center px-4 gap-3 overflow-hidden"
            initial={{ width: "38%" }}
            animate={{ width: `${Math.max(38, Math.min(100, b.width))}%` }}
            transition={{ duration: 0.9, ease: "easeOut", delay: i * 0.15 }}
            style={{
              background: `linear-gradient(90deg, rgba(246,201,69,${0.5 - i * 0.1}) 0%, rgba(246,201,69,${0.22 - i * 0.04}) 100%)`,
              border: "1px solid rgba(246,201,69,0.35)",
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider truncate" style={{ color: "rgba(255,255,255,0.7)" }}>
                {b.titleA} <span style={{ color: "rgba(255,255,255,0.4)" }}>/</span> {b.titleB}
              </div>
              <div className="display text-xl tnum mt-1 leading-none flex items-baseline gap-2 truncate">
                <span className="text-white">{b.valueA}</span>
                <span style={{ color: "rgba(255,255,255,0.4)" }}>/</span>
                <span style={{ color: "var(--lime)" }}>{b.valueB}</span>
              </div>
            </div>
            <div className="text-[11px] tnum flex-shrink-0 text-right whitespace-nowrap" style={{ color: "rgba(255,255,255,0.75)" }}>
              {b.sub}
            </div>
          </motion.div>
        </div>
      ))}
    </div>
  );
}

function ActivityCard({ rows }: { rows: Array<{ label: string; value: number; unit: string }> }) {
  const maxVal = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="card p-6">
      <div className="space-y-4">
        {rows.map((row) => {
          const widthPct = (row.value / maxVal) * 100;
          return (
            <div key={row.label} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <div className="text-sm font-semibold sm:w-32 sm:flex-shrink-0" style={{ color: "var(--ink-1)" }}>
                {row.label}
              </div>
              <div className="flex flex-1 items-center gap-3">
                <div className="flex-1 relative h-12">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-md flex items-center px-4"
                    initial={{ width: 160 }}
                    animate={{ width: `${Math.max(6, widthPct)}%` }}
                    transition={{ duration: 0.9, ease: "easeOut" }}
                    style={{
                      minWidth: 160,
                      background: "linear-gradient(90deg, rgba(246,201,69,0.12), rgba(246,201,69,0.55))",
                      border: "1px solid rgba(246,201,69,0.35)",
                    }}
                  >
                    <div className="flex items-baseline gap-2 whitespace-nowrap">
                      <span className="display text-2xl tnum leading-none" style={{ color: "var(--ink-1)" }}>{row.value.toFixed(1)}</span>
                      <span className="text-xs font-medium" style={{ color: "var(--ink-1)" }}>{row.unit}</span>
                    </div>
                  </motion.div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm" style={{ color: "var(--ink-3)" }}>→</span>
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: "var(--lime)", boxShadow: "0 0 16px rgba(246,201,69,0.55)" }}
                  >
                    <span className="text-sm font-bold" style={{ color: "var(--lime-deep)" }}>1</span>
                  </div>
                  <span className="text-xs" style={{ color: "var(--ink-3)" }}>policy</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PercentMetric({ label, value }: { label: string; value: number }) {
  const size = 128;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, value));
  const dash = (p / 100) * c;
  return (
    <div className="card p-5 flex flex-col items-center">
      <span className="section-label">{label}</span>
      <div className="relative mt-3" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#3a2e08" strokeWidth={stroke} />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#f6c945"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c - dash }}
            transition={{ duration: 1, ease: "easeOut" }}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span
            className="display text-2xl tnum text-white leading-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            {value.toFixed(1)}%
          </motion.span>
        </div>
      </div>
    </div>
  );
}

function CostAnalysisBoard({
  stages,
}: {
  stages: Array<{
    stage: "Dial" | "Contact" | "Appointment" | "Presentation" | "Sale";
    verb: string;
    ap: number;
    cost?: number;
  }>;
}) {
  return (
    // Each stage is its own gold box with dark text (like the New Leads bubble)
    // — far more legible on mobile than the old hairline-divided columns.
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {stages.map((s) => {
        const stageLower = s.stage.toLowerCase();
        return (
          <div key={s.stage} className="card-lime flex flex-col gap-3 p-5 min-w-0">
            <h3 className="display" style={{ fontSize: "1.125rem", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              {s.stage}
            </h3>

            <p className="leading-snug" style={{ fontWeight: 500, fontSize: "0.9rem", letterSpacing: "-0.005em" }}>
              For every {stageLower} you {s.verb}, you earn{" "}
              <span className="tnum font-semibold">{fmtMoneyExact(s.ap)}</span> AP.
            </p>

            {s.cost !== undefined ? (
              <p
                className="leading-snug"
                style={{ fontWeight: 500, fontSize: "0.9rem", letterSpacing: "-0.005em", borderTop: "1px solid rgba(0,0,0,0.18)", paddingTop: 12 }}
              >
                It costs{" "}
                <span className="tnum font-semibold">{fmtMoneyExact(s.cost)}</span>{" "}
                to {s.verb} each {stageLower}.
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

type FunnelStage = { label: string; value: string; conversion: string | null };

function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const W = 1000;
  const H = 200;
  const n = stages.length;
  const stageW = W / n;
  const startH = H * 0.92;
  const endH = H * 0.20;

  const heightAt = (i: number) => {
    const t = n === 1 ? 0 : i / (n - 1);
    return startH - t * (startH - endH);
  };

  const centerY = H / 2;
  const cx = (i: number) => i * stageW + stageW / 2;

  let d = `M 0 ${centerY - heightAt(0) / 2}`;
  for (let i = 0; i < n; i++) {
    const x = cx(i);
    const y = centerY - heightAt(i) / 2;
    if (i === 0) {
      d += ` L ${x} ${y}`;
    } else {
      const px = cx(i - 1);
      const py = centerY - heightAt(i - 1) / 2;
      const mx = (px + x) / 2;
      d += ` C ${mx} ${py}, ${mx} ${y}, ${x} ${y}`;
    }
  }
  d += ` L ${W} ${centerY - heightAt(n - 1) / 2}`;
  d += ` L ${W} ${centerY + heightAt(n - 1) / 2}`;
  for (let i = n - 1; i >= 0; i--) {
    const x = cx(i);
    const y = centerY + heightAt(i) / 2;
    if (i === n - 1) {
      d += ` L ${x} ${y}`;
    } else {
      const nx = cx(i + 1);
      const ny = centerY + heightAt(i + 1) / 2;
      const mx = (nx + x) / 2;
      d += ` C ${mx} ${ny}, ${mx} ${y}, ${x} ${y}`;
    }
  }
  d += ` L 0 ${centerY + heightAt(0) / 2} Z`;

  return (
    <div className="w-full">
      {/* Mobile: vertical stage list — a horizontal funnel can't fit 6 labels.
          Bars don't read as a funnel here, so we lead with the big number instead. */}
      <div className="lg:hidden flex flex-col gap-1.5">
        {stages.map((s) => (
          <div
            key={`m-${s.label}`}
            className="rounded-xl px-4 py-3.5"
            style={{ background: "var(--surface-soft)", border: "1px solid var(--line-1)" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
                  {s.label}
                </span>
                {s.conversion ? (
                  <span className="text-[11px] tnum" style={{ color: "var(--lime)" }}>
                    {s.conversion}
                  </span>
                ) : null}
              </div>
              <span className="display text-4xl text-white tnum leading-none flex-shrink-0">
                {s.value}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: horizontal funnel. */}
      <div className="hidden lg:block">
      <div className="grid gap-1 mb-3" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {stages.map((s) => (
          <div key={`label-${s.label}`} className="text-center px-1">
            <div className="text-[10px] uppercase tracking-wider truncate" style={{ color: "var(--ink-3)" }}>{s.label}</div>
            <div className="display text-lg lg:text-xl text-white tnum mt-1 leading-none">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="relative w-full" style={{ height: 180 }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id="ll-funnel-grad" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#f6c945" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#f6c945" stopOpacity="0.25" />
            </linearGradient>
          </defs>
          {stages.slice(0, n - 1).map((_, i) => {
            const x = (i + 1) * stageW;
            return (
              <line
                key={`div-${i}`}
                x1={x} x2={x}
                y1={centerY - heightAt(i) / 2 - 4}
                y2={centerY + heightAt(i) / 2 + 4}
                stroke="rgba(255,255,255,0.12)"
                strokeDasharray="2 4"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          <path d={d} fill="url(#ll-funnel-grad)" stroke="#f6c945" strokeOpacity="0.5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      <div className="grid gap-1 mt-3" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {stages.map((s, i) => (
          <div key={`conv-${i}`} className="text-center text-[11px] tnum truncate" style={{ color: s.conversion ? "var(--lime)" : "transparent" }}>
            {s.conversion ?? "—"}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor" aria-hidden>
      <circle cx="3" cy="3" r="1.2" /><circle cx="9" cy="3" r="1.2" />
      <circle cx="3" cy="7" r="1.2" /><circle cx="9" cy="7" r="1.2" />
      <circle cx="3" cy="11" r="1.2" /><circle cx="9" cy="11" r="1.2" />
    </svg>
  );
}

function SectionsSettings({
  layout, onChange, onClose,
}: {
  layout: SectionLayout;
  onChange: (next: SectionLayout) => void;
  onClose: () => void;
}) {
  const [dragKey, setDragKey] = useState<SectionKey | null>(null);
  const [hoverKey, setHoverKey] = useState<SectionKey | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggleVisible(k: SectionKey) {
    const hidden = layout.hidden.includes(k)
      ? layout.hidden.filter((x) => x !== k)
      : [...layout.hidden, k];
    onChange({ ...layout, hidden });
  }

  function moveBefore(source: SectionKey, target: SectionKey) {
    if (source === target) return;
    const order = layout.order.filter((k) => k !== source);
    const idx = order.indexOf(target);
    order.splice(idx === -1 ? order.length : idx, 0, source);
    onChange({ ...layout, order });
  }

  function reset() {
    onChange({ order: DEFAULT_SECTION_ORDER, hidden: [] });
  }

  const visibleCount = layout.order.length - layout.hidden.length;

  return (
    <div
      className="absolute right-0 top-full mt-2 z-30 card p-4 w-[280px]"
      style={{ background: "var(--bg-inner)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm" style={{ color: "var(--ink-1)" }}>Customize sections</div>
        <button onClick={reset} className="text-[10px] uppercase tracking-wider" style={{ color: "var(--ink-3)" }} title="Reset to default order">
          Reset
        </button>
      </div>
      <div className="text-[11px] mb-3" style={{ color: "var(--ink-3)" }}>
        Drag to reorder · click to show/hide · {visibleCount} of {layout.order.length} shown
      </div>
      <div className="flex flex-col gap-1">
        {layout.order.map((k) => {
          const visible = !layout.hidden.includes(k);
          const isDragging = dragKey === k;
          const isHovered = hoverKey === k && dragKey !== null && dragKey !== k;
          return (
            <div
              key={k}
              draggable
              onDragStart={(e) => { setDragKey(k); e.dataTransfer.effectAllowed = "move"; }}
              onDragEnd={() => { setDragKey(null); setHoverKey(null); }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setHoverKey(k); }}
              onDragLeave={() => setHoverKey((h) => (h === k ? null : h))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragKey) moveBefore(dragKey, k);
                setDragKey(null); setHoverKey(null);
              }}
              className="flex items-center gap-2 px-2 py-2 rounded-md cursor-grab select-none"
              style={{
                background: isHovered ? "var(--surface-strong)" : "var(--surface-soft)",
                border: `1px solid ${isHovered ? "var(--lime)" : "var(--line-2)"}`,
                opacity: isDragging ? 0.4 : 1,
                color: "var(--ink-2)",
              }}
            >
              <span style={{ color: "var(--ink-3)" }}><DragHandleIcon /></span>
              <input
                type="checkbox"
                checked={visible}
                onChange={() => toggleVisible(k)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Show ${SECTION_LABELS[k]}`}
              />
              <span className="text-sm flex-1" style={{ color: visible ? "var(--ink-1)" : "var(--ink-3)" }}>
                {SECTION_LABELS[k]}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-end pt-3 mt-3" style={{ borderTop: "1px solid var(--line-1)" }}>
        <button onClick={onClose} className="btn btn-primary text-xs">Done</button>
      </div>
    </div>
  );
}

function CalCheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
}

function CalChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"></polyline>
    </svg>
  );
}

function CalChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  );
}

function CalCloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_SHORT_HEADER = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function calPad2(n: number): string { return String(n).padStart(2, "0"); }
function calIsoDay(d: Date): string {
  return `${d.getFullYear()}-${calPad2(d.getMonth() + 1)}-${calPad2(d.getDate())}`;
}
function fmtCents(c: number): string {
  if (!c) return "";
  const dollars = c / 100;
  return `$${dollars.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

type CalendarDay = { ap_cents: number; ip_cents: number; sales: number; submitted: boolean };
type CalendarResp = { ok: true; month: string; days: Record<string, CalendarDay> } | { ok: false; error: string };

function AnalyticsCalendar({ reloadKey, personId }: { reloadKey: number; personId?: string }) {
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [days, setDays] = useState<Record<string, CalendarDay>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The right-edge fade is an honest scroll hint: show it only when the grid
  // actually overflows its container, never when the calendar fits.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [calScrollable, setCalScrollable] = useState(false);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    setError(null);
    const ym = `${viewYear}-${calPad2(viewMonth + 1)}`;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const personParam = personId ? `&personId=${encodeURIComponent(personId)}` : "";
    fetch(`/api/producer/analytics/calendar?month=${ym}&tz=${encodeURIComponent(tz)}${personParam}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("load failed");
        return r.json() as Promise<CalendarResp>;
      })
      .then((j) => {
        if (aborted) return;
        if (!j.ok) throw new Error("load failed");
        setDays(j.days ?? {});
      })
      .catch(() => { if (!aborted) { setError(PRODUCER_LOAD_ERROR_COPY); setDays({}); } })
      .finally(() => { if (!aborted) setLoading(false); });
    return () => { aborted = true; };
  }, [viewYear, viewMonth, reloadKey, personId]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const check = () => setCalScrollable(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [days, viewMonth, viewYear]);

  function shiftMonth(delta: number) {
    let mo = viewMonth + delta;
    let y = viewYear;
    while (mo < 0) { mo += 12; y--; }
    while (mo > 11) { mo -= 12; y++; }
    setViewMonth(mo);
    setViewYear(y);
  }

  type Cell = { day: number; iso: string; inMonth: boolean };
  const cells: Cell[] = [];
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  for (let i = 0; i < firstWeekday; i++) {
    const d = new Date(viewYear, viewMonth, -((firstWeekday - 1) - i));
    cells.push({ day: d.getDate(), iso: calIsoDay(d), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(viewYear, viewMonth, day);
    cells.push({ day, iso: calIsoDay(d), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    const d = new Date(viewYear, viewMonth, last.day + 1);
    cells.push({ day: d.getDate(), iso: calIsoDay(d), inMonth: false });
  }

  const weeks: Array<{ cells: Cell[]; totalAP: number; totalIP: number; loggedDays: number }> = [];
  for (let i = 0; i < cells.length; i += 7) {
    const weekCells = cells.slice(i, i + 7);
    let totalAP = 0, totalIP = 0, loggedDays = 0;
    for (const c of weekCells) {
      if (!c.inMonth) continue;
      const info = days[c.iso];
      if (!info) continue;
      totalAP += info.ap_cents;
      totalIP += info.ip_cents;
      if (info.submitted || info.ap_cents > 0 || info.ip_cents > 0) loggedDays++;
    }
    weeks.push({ cells: weekCells, totalAP, totalIP, loggedDays });
  }

  let monthAP = 0, submittedDays = 0, activeDays = 0;
  for (const c of cells) {
    if (!c.inMonth) continue;
    const info = days[c.iso];
    if (!info) continue;
    monthAP += info.ap_cents;
    if (info.submitted) submittedDays++;
    if (info.submitted || info.ap_cents > 0 || info.ip_cents > 0) activeDays++;
  }
  const monthName = MONTH_NAMES[viewMonth];
  const todayIso = calIsoDay(today);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => shiftMonth(-1)} className="btn-icon" aria-label="Previous month" title="Previous month">
            <CalChevronLeft />
          </button>
          <div className="display text-xl text-white leading-none tnum">{monthName} {viewYear}</div>
          <button onClick={() => shiftMonth(1)} className="btn-icon" aria-label="Next month" title="Next month">
            <CalChevronRight />
          </button>
          {loading && <span className="text-xs" style={{ color: "var(--ink-3)" }}>loading…</span>}
          {error && <span className="text-xs" style={{ color: "var(--danger)" }}>{error}</span>}
        </div>
        <div className="flex items-center gap-4 text-xs tnum" style={{ color: "var(--ink-3)" }}>
          <span>AP <span className="text-white">{fmtCents(monthAP) || "$0"}</span></span>
          <span>Logged <span className="text-white">{submittedDays}d</span></span>
          <span>Active <span className="text-white">{activeDays}d</span></span>
        </div>
      </div>

      {/* The 7-day grid + week column can't compress to phone width without
          cutting off the per-day money; let it scroll horizontally instead.
          A right-edge fade signals the scroll (macOS hides the scrollbar). */}
      <div className="relative">
      <div ref={scrollerRef} className="no-scrollbar overflow-x-auto">
      <div className="grid gap-1 min-w-[560px]" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr)) 110px" }}>
        {DAY_SHORT_HEADER.map((d) => (
          <div key={d} className="text-[10px] text-center uppercase tracking-wider py-1" style={{ color: "var(--ink-3)" }}>
            {d}
          </div>
        ))}
        <div className="text-[10px] text-center uppercase tracking-wider py-1" style={{ color: "var(--ink-3)" }}>Σ Week</div>

        {weeks.map((week, wi) => (
          <Fragment key={wi}>
            {week.cells.map((cell) => {
              const info = days[cell.iso];
              const hasMoney = !!info && (info.ap_cents > 0 || info.ip_cents > 0);
              const isSubmitted = !!info?.submitted;
              const isPositive = hasMoney;
              const isToday = cell.iso === todayIso;
              const bg = !cell.inMonth
                ? "transparent"
                : isPositive
                  ? "rgba(246,201,69,0.18)"
                  : isSubmitted
                    ? "rgba(246,201,69,0.06)"
                    : "var(--surface-soft)";
              const border = !cell.inMonth
                ? "1px solid var(--line-1)"
                : isPositive
                  ? "1px solid rgba(246,201,69,0.5)"
                  : isToday
                    ? "1px solid rgba(246,201,69,0.5)"
                    : "1px solid var(--line-1)";
              return (
                <div
                  key={cell.iso}
                  className="relative rounded p-2 min-h-[88px]"
                  style={{
                    background: bg,
                    border,
                    opacity: cell.inMonth ? 1 : 0.35,
                  }}
                  title={cell.inMonth ? cell.iso : undefined}
                >
                  <div className="text-xs tnum" style={{ color: cell.inMonth ? "var(--ink-1)" : "var(--ink-3)" }}>
                    {cell.day}
                  </div>
                  {cell.inMonth && info && info.ap_cents > 0 && (
                    <div className="text-xs tnum font-medium mt-1.5 whitespace-nowrap" style={{ color: "var(--lime)" }}>
                      +{fmtCents(info.ap_cents)}
                    </div>
                  )}
                  {cell.inMonth && info && info.ip_cents > 0 && (
                    <div className="text-[10px] tnum mt-0.5" style={{ color: "var(--ink-2)" }}>
                      IP {fmtCents(info.ip_cents)}
                    </div>
                  )}
                  {cell.inMonth && info && info.sales > 0 && (
                    <div className="text-[10px] tnum" style={{ color: "var(--ink-3)" }}>
                      {info.sales} sale{info.sales === 1 ? "" : "s"}
                    </div>
                  )}
                  {cell.inMonth && isSubmitted && (
                    <span
                      className="absolute top-1.5 right-1.5"
                      style={{ color: "var(--lime)" }}
                      aria-label="Logged"
                      title="Activity logged"
                    >
                      <CalCheckIcon />
                    </span>
                  )}
                </div>
              );
            })}
            <div
              className="rounded p-2 min-h-[88px] flex flex-col items-center justify-center"
              style={{
                background: (week.totalAP > 0 || week.totalIP > 0) ? "rgba(246,201,69,0.10)" : "var(--surface-soft)",
                border: "1px solid var(--line-1)",
              }}
            >
              <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>Week</div>
              {week.totalAP > 0 ? (
                <div className="text-sm tnum font-medium mt-1 whitespace-nowrap" style={{ color: "var(--lime)" }}>
                  +{fmtCents(week.totalAP)}
                </div>
              ) : (
                <div className="text-sm tnum mt-1" style={{ color: "var(--ink-3)" }}>—</div>
              )}
              {week.totalIP > 0 && (
                <div className="text-[10px] tnum" style={{ color: "var(--ink-2)" }}>
                  IP {fmtCents(week.totalIP)}
                </div>
              )}
              {week.loggedDays > 0 && (
                <div className="text-[10px] tnum mt-0.5" style={{ color: "var(--ink-3)" }}>
                  {week.loggedDays}/{week.cells.filter((c) => c.inMonth).length}d
                </div>
              )}
            </div>
          </Fragment>
        ))}
      </div>
      </div>
      {calScrollable && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-10"
          style={{ background: "linear-gradient(90deg, transparent, var(--card-1))" }}
          aria-hidden
        />
      )}
      </div>

      <div className="flex items-center gap-4 text-[10px] pt-3" style={{ color: "var(--ink-3)", borderTop: "1px solid var(--line-1)" }}>
        <span className="flex items-center gap-1.5">
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "rgba(246,201,69,0.18)", border: "1px solid rgba(246,201,69,0.5)" }} />
          AP earned
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ color: "var(--lime)", display: "inline-flex" }}><CalCheckIcon /></span>
          Activity logged
        </span>
      </div>
    </div>
  );
}

function AddDataModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const today = useMemo(() => calIsoDay(new Date()), []);
  const [date, setDate] = useState(today);
  const [dials, setDials] = useState(0);
  const [leads, setLeads] = useState(0);
  const [contacts, setContacts] = useState(0);
  const [appointments, setAppointments] = useState(0);
  const [presentations, setPresentations] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let aborted = false;
    fetch(`/api/producer/tracker?date=${date}`, { cache: "no-store" })
      .then((r) => parseJsonResponse<{ ok: boolean; entry?: { dials?: number; leads?: number; contacts?: number; appointments?: number; presentations?: number } }>(r, PRODUCER_API_ERROR_COPY))
      .then((j) => {
        if (aborted) return;
        if (!j.ok || !j.entry) return;
        setDials(j.entry.dials ?? 0);
        setLeads(j.entry.leads ?? 0);
        setContacts(j.entry.contacts ?? 0);
        setAppointments(j.entry.appointments ?? 0);
        setPresentations(j.entry.presentations ?? 0);
      })
      .catch(() => { /* leave fields at zero */ });
    return () => { aborted = true; };
  }, [date]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/producer/tracker", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, dials, leads, contacts, appointments, presentations }),
      });
      const j = await parseJsonResponse<{ ok: boolean; error?: string }>(res, PRODUCER_API_ERROR_COPY);
      if (!j.ok) throw new Error(j.error ?? "Save failed");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md p-5"
        style={{ background: "var(--bg-inner)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="display text-lg text-white leading-none">Add activity</h3>
          <button onClick={onClose} className="btn-icon" aria-label="Cancel">
            <CalCloseIcon />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--ink-3)" }}>Date</label>
            <input
              type="date"
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-transparent text-sm px-2 py-1.5 rounded-md outline-none tnum [color-scheme:dark]"
              style={{ border: "1px solid var(--line-2)", color: "var(--ink-1)" }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <AddDataField label="Dials" value={dials} onChange={setDials} />
            <AddDataField label="Leads" value={leads} onChange={setLeads} />
            <AddDataField label="Contacts" value={contacts} onChange={setContacts} />
            <AddDataField label="Appointments" value={appointments} onChange={setAppointments} />
            <AddDataField label="Presentations" value={presentations} onChange={setPresentations} />
          </div>
          <p className="text-[10px] mt-1" style={{ color: "var(--ink-3)" }}>
            Policies sold are logged automatically from your Clients book.
          </p>
        </div>

        {error && (
          <div className="text-xs mt-3" style={{ color: "var(--danger)" }}>{error}</div>
        )}

        <div className="flex items-center justify-between gap-3 mt-5">
          <span className="text-[10px]" style={{ color: "var(--ink-3)" }}>
            Existing entries for this date are overwritten.
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} type="button" className="btn btn-pill">Cancel</button>
            <button onClick={submit} disabled={submitting} type="button" className="btn btn-primary">
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddDataField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--ink-3)" }}>{label}</label>
      <input
        type="number"
        min={0}
        step={1}
        value={value === 0 ? "" : value}
        placeholder="0"
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-full bg-transparent text-sm px-2 py-1.5 rounded-md outline-none tnum"
        style={{ border: "1px solid var(--line-2)", color: "var(--ink-1)" }}
      />
    </div>
  );
}
