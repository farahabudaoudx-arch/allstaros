"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ConditionResult, Outcome, Toolkit } from "@/lib/underwriting/types";
import { humanizeRawInfo } from "@/lib/underwriting/humanize";
import {
  classifyBuild,
  formatHeight,
  parseHeightInches,
  parseWeightLbs,
  BUILD_ROWS,
  BUILD_STATUS_META,
} from "@/lib/underwriting/build-chart";
import { assessAllProducts, type RatedAssessment } from "@/lib/underwriting/iul-rated";
import { portalUrlForCarrier } from "@/lib/carrier-portals";
import { useTheme } from "@/lib/use-theme";
import { track } from "@/lib/analytics";

// Guaranteed-issue products (e.g. Corebridge Graded) issue regardless of build
// or health, so they're exempt from the over-limit build knockout below.
function isGuaranteedIssue(carrier: string): boolean {
  return /\bGIWL\b|guaranteed issue|Corebridge \(Graded\)/i.test(carrier);
}

// Max issue age per carrier. Over this age the carrier won't write the
// policy at all, so it's an automatic decline (a knockout like build).
// Most carriers cap at 85; the exceptions are listed explicitly.
const DEFAULT_MAX_AGE = 85;
const CARRIER_MAX_AGE: Record<string, number> = {
  "Corebridge (Graded)": 80,
  "Corebridge (Level)": 80,
  "Aetna (Accendo)": 89,
  // Simplified-issue IUL (SIUL toolkit), from the carrier guides.
  "National Life Group (RapidProtect)": 60,
  "Mutual of Omaha (Indexed Universal Life Express)": 70,
  // Americo (Instant Decision IUL) left at the 85 default pending its published grid.
};
function maxAgeForCarrier(carrier: string): number {
  return CARRIER_MAX_AGE[carrier] ?? DEFAULT_MAX_AGE;
}

// Per-product face-amount band. Outside this range the product can't be written,
// so it's a knockout like age/build. Only carriers with a published band are
// listed; any carrier absent here simply has no face knockout. Simplified-issue
// IUL bands come from the carrier guides.
const CARRIER_FACE_BAND: Record<string, { min: number; max: number }> = {
  "National Life Group (RapidProtect)": { min: 50_000, max: 500_000 },
  "Mutual of Omaha (Indexed Universal Life Express)": { min: 25_000, max: 300_000 },
};

// "$250k", "250,000", "250000", "2.5m" → number. Returns null when nothing parses.
function parseFaceAmount(raw: string): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/[$,\s]/g, "");
  const m = s.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (m[2] === "k") n *= 1_000;
  else if (m[2] === "m") n *= 1_000_000;
  return n > 0 ? n : null;
}

const TOOLKITS: { id: Toolkit; label: string; hint: string }[] = [
  { id: "FEX",  label: "FEX",            hint: "Final Expense" },
  { id: "SIUL", label: "IUL · Simplified", hint: "Indexed Universal Life — simplified issue (instant decision)" },
  { id: "IUL",  label: "IUL · Rated",      hint: "Indexed Universal Life — fully underwritten (rate class)" },
];

const OUTCOME_RANK: Record<Outcome, number> = {
  Approved: 0,
  Unknown: 1,
  Conditional: 2,
  Graded: 3,
  Decline: 4,
};

type OutcomeStyle = { label: string; bg: string; fg: string; border: string };

const OUTCOME_STYLES_DARK: Record<Outcome, OutcomeStyle> = {
  Approved:    { label: "Approved",    bg: "rgba(0,223,129,0.12)",   fg: "#00DF81", border: "rgba(0,223,129,0.45)"  },
  Unknown:     { label: "Unknown",     bg: "rgba(148,163,184,0.12)", fg: "#94A3B8", border: "rgba(148,163,184,0.45)" },
  Conditional: { label: "Conditional", bg: "rgba(250,204,21,0.12)",  fg: "#FACC15", border: "rgba(250,204,21,0.45)" },
  Graded:      { label: "Graded",      bg: "rgba(251,146,60,0.12)",  fg: "#FB923C", border: "rgba(251,146,60,0.45)" },
  Decline:     { label: "Decline",     bg: "rgba(248,113,113,0.12)", fg: "#F87171", border: "rgba(248,113,113,0.45)" },
};
const OUTCOME_STYLES_LIGHT: Record<Outcome, OutcomeStyle> = {
  Approved:    { label: "Approved",    bg: "#A7F3D0", fg: "#064E3B", border: "#10B981" },
  Unknown:     { label: "Unknown",     bg: "#E2E8F0", fg: "#1E293B", border: "#94A3B8" },
  Conditional: { label: "Conditional", bg: "#FEF08A", fg: "#713F12", border: "#CA8A04" },
  Graded:      { label: "Graded",      bg: "#FED7AA", fg: "#7C2D12", border: "#EA580C" },
  Decline:     { label: "Decline",     bg: "#FECACA", fg: "#7F1D1D", border: "#DC2626" },
};
function outcomeStyles(theme: "dark" | "light"): Record<Outcome, OutcomeStyle> {
  return theme === "light" ? OUTCOME_STYLES_LIGHT : OUTCOME_STYLES_DARK;
}


type AnalyzeResponse = {
  ok: true;
  conditions: string[];
  summary: string;
  results: ConditionResult[];
  noConditionsMentioned?: boolean;
};

export type AggregatedCarrier = {
  carrier: string;
  outcome: Outcome;
  perCondition: Array<{ condition: string; outcome: Outcome; rawInfo: string }>;
};

// Snapshot of everything the wizard has read on the current notes. Sent up
// to a parent so a downstream recap step can render the wizard's
// summary + detected conditions alongside the carrier outlook.
export type WizardAnalysisSnapshot = {
  carriers: AggregatedCarrier[];
  conditions: string[];
  summary: string;
};

export type WizardVitals = {
  dob: string;
  height: string;
  weight: string;
  // IUL adds two field-underwriting inputs FEX never needed: tobacco (which
  // splits non-tobacco vs tobacco rate class, and lets condition rules that key
  // on tobacco apply) and the requested face amount (used for per-product
  // face-band knockouts). Optional so existing FEX callers that pass only
  // dob/height/weight keep working unchanged.
  tobacco?: "smoker" | "nonsmoker" | "";
  faceAmount?: string;
};

// Best-effort DOB → age. Accepts YYYY-MM-DD or MM/DD/YYYY. Returns "" if
// the string isn't parseable or the resulting age is implausible.
function ageFromDob(dob: string): string {
  if (!dob) return "";
  const d = new Date(dob);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 120 ? String(age) : "";
}

export type UnderwritingWizardProps = {
  // Controlled notes string. Empty string means the agent has typed nothing yet.
  value: string;
  onChange: (next: string) => void;
  // Controlled vitals (age / height / weight). Empty strings mean unset.
  // These render as small inputs above the medical-notes textarea and get
  // prepended to the analyzer payload so carrier rules can consider BMI/age.
  vitals: WizardVitals;
  onVitalsChange: (next: WizardVitals) => void;
  // Toolkit defaults to FEX since most life sales are final-expense.
  defaultToolkit?: Toolkit;
  // Optional title above the textarea; the embedded variant uses a short
  // label, the standalone tool page uses the big heading.
  heading?: React.ReactNode;
  // Slightly tighter spacing when embedded in a step card.
  compact?: boolean;
  // Fires every time the wizard finishes an analysis pass.
  onAnalysisResult?: (snapshot: WizardAnalysisSnapshot) => void;
};

// Build the analyzer payload from vitals + free notes. Empty vitals are
// omitted so the LLM doesn't see "Age: " with nothing after it. DOB is
// converted to age (since carrier rules are written against age, not
// birthdate).
function buildAnalyzerText(vitals: WizardVitals, notes: string): string {
  const parts: string[] = [];
  const age = ageFromDob(vitals.dob);
  if (age)                  parts.push(`Age: ${age}`);
  if (vitals.height.trim()) parts.push(`Height: ${vitals.height.trim()}`);
  if (vitals.weight.trim()) parts.push(`Weight: ${vitals.weight.trim()}`);
  if (vitals.tobacco === "smoker")         parts.push("Tobacco: current tobacco/nicotine user");
  else if (vitals.tobacco === "nonsmoker") parts.push("Tobacco: non-user");
  const prefix = parts.length > 0 ? parts.join(". ") + ". " : "";
  return (prefix + notes).trim();
}

export function UnderwritingWizard({
  value,
  onChange,
  vitals,
  onVitalsChange,
  defaultToolkit = "FEX",
  heading,
  compact = false,
  onAnalysisResult,
}: UnderwritingWizardProps) {
  const [toolkit, setToolkit] = useState<Toolkit>(defaultToolkit);
  const [carriersByToolkit, setCarriersByToolkit] = useState<Record<Toolkit, string[]>>({ FEX: [], SIUL: [], IUL: [] });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  // Results belong to the exact notes, vitals, and toolkit explicitly submitted.
  // Edits hide outdated results but never start another paid model request.
  const inputKey = JSON.stringify([toolkit, value.trim(), vitals]);
  const [completed, setCompleted] = useState<{ key: string; data: AnalyzeResponse } | null>(null);
  const analysis = completed?.key === inputKey ? completed.data : null;
  const [analyzing, setAnalyzing] = useState(false);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const analyzeError = failure?.key === inputKey ? failure.message : null;
  const [outcomeFilter, setOutcomeFilter] = useState<Outcome | "All">("All");

  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Voice dictation (macOS, Voice In, etc.) bypasses React onChange. Poll the
  // ref so the controlled value stays in sync with what the user sees.
  useEffect(() => {
    const id = setInterval(() => {
      const el = textareaRef.current;
      if (!el) return;
      if (el.value !== value) onChange(el.value);
    }, 200);
    return () => clearInterval(id);
  }, [value, onChange]);

  const flushPendingText = () => {
    const el = textareaRef.current;
    if (!el) return;
    const v = el.value;
    if (v !== value) onChange(v);
  };

  useEffect(() => {
    let cancelled = false;
    setLoadingMeta(true);
    setLoadError(null);
    setCompleted(null);
    fetch(`/api/underwriting/conditions?toolkit=${toolkit}`)
      .then(async (r) => {
        const json = await r.json().catch(() => null);
        if (!r.ok) throw new Error(json?.error ?? `HTTP ${r.status} — are you signed in?`);
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        if (!json?.ok) throw new Error(json?.error ?? "load failed");
        const c = json.conditions?.length ?? 0;
        const carriersList = (json.carriers ?? []) as string[];
        setCarriersByToolkit((prev) => ({ ...prev, [toolkit]: carriersList }));
        if (c === 0) setLoadError("The conditions table returned 0 rows.");
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e?.message ?? "load failed");
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });
    return () => { cancelled = true; };
  }, [toolkit]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const submitAnalysis = async () => {
    // Read dictation directly, even if React's polling hasn't caught up yet.
    const notes = textareaRef.current?.value ?? value;
    const key = JSON.stringify([toolkit, notes.trim(), vitals]);
    if (!notes.trim() || loadingMeta || loadError || abortRef.current || completed?.key === key) return;
    if (notes !== value) onChange(notes);
    const ctrl = new AbortController();
    abortRef.current = ctrl; // Synchronous guard also blocks rapid double clicks.
    setAnalyzing(true);
    setFailure(null);
    setCompleted(null);

    try {
      const response = await fetch("/api/underwriting/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: buildAnalyzerText(vitals, notes), toolkit }),
        signal: ctrl.signal,
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) throw new Error(json?.error ?? `HTTP ${response.status}`);
      if (ctrl.signal.aborted) return;
      setCompleted({ key, data: json as AnalyzeResponse });
      if (json.results.length > 0) {
        track("underwriting_wizard_completed", { toolkit, conditions: json.conditions.length });
      }
    } catch (error) {
      if (ctrl.signal.aborted) return;
      setFailure({ key, message: error instanceof Error ? error.message : "Analysis failed. Please try again." });
    } finally {
      if (abortRef.current === ctrl) {
        abortRef.current = null;
        setAnalyzing(false);
      }
    }
  };

  const aggregated = useMemo<AggregatedCarrier[]>(() => {
    // Per-carrier knockouts applied on top of the health outcome (worst-of):
    //  • Age — over the carrier's max issue age → Decline (every product).
    //  • Build — an over-limit height/weight → Decline at every non-GI carrier
    //    (guaranteed-issue products issue regardless of build). Borderline /
    //    Too Thin stay informational in the build banner; health decides those.
    const build = classifyBuild(vitals.height, vitals.weight);
    const buildKnockout = build?.status === "OverLimit";
    const buildReason = build
      ? `Build ${formatHeight(build.inches)} / ${build.weight} lbs is over the build limit for this height (≈ ${build.immediate} lbs max) — declined on build regardless of health.`
      : "";
    const ageStr = ageFromDob(vitals.dob);
    const age = ageStr ? parseInt(ageStr, 10) : NaN;
    const face = parseFaceAmount(vitals.faceAmount ?? "");
    const applyKnockouts = (carriers: AggregatedCarrier[]): AggregatedCarrier[] =>
      carriers.map((c) => {
        const knocks: Array<{ condition: string; rawInfo: string }> = [];
        const maxAge = maxAgeForCarrier(c.carrier);
        if (!Number.isNaN(age) && age > maxAge) {
          knocks.push({ condition: "Age", rawInfo: `Client age ${age} is over this product's max issue age of ${maxAge}.` });
        }
        if (buildKnockout && build && !isGuaranteedIssue(c.carrier)) {
          knocks.push({ condition: "Build (height & weight)", rawInfo: buildReason });
        }
        const band = CARRIER_FACE_BAND[c.carrier];
        if (face != null && band && (face < band.min || face > band.max)) {
          knocks.push({
            condition: "Face amount",
            rawInfo: `Requested face amount $${face.toLocaleString()} is outside this product's range ($${band.min.toLocaleString()}–$${band.max.toLocaleString()}).`,
          });
        }
        if (knocks.length === 0) return c;
        return {
          carrier: c.carrier,
          outcome: "Decline" as Outcome,
          perCondition: [
            ...knocks.map((k) => ({ condition: k.condition, outcome: "Decline" as Outcome, rawInfo: k.rawInfo })),
            ...c.perCondition,
          ],
        };
      });

    if (!analysis) return [];
    if (analysis.results.length === 0) {
      if (!analysis.noConditionsMentioned) return [];
      const list = carriersByToolkit[toolkit] ?? [];
      return applyKnockouts(
        list
          .slice()
          .sort((a, b) => a.localeCompare(b))
          .map((carrier) => ({ carrier, outcome: "Approved" as Outcome, perCondition: [] }))
      );
    }
    const all = new Set<string>();
    for (const r of analysis.results) {
      for (const carrier of Object.keys(r.carriers)) all.add(carrier);
    }
    const out: AggregatedCarrier[] = [];
    for (const carrier of all) {
      const perCondition: AggregatedCarrier["perCondition"] = [];
      let worstRank = -1;
      let worst: Outcome = "Approved";
      for (const r of analysis.results) {
        const cell = r.carriers[carrier];
        if (!cell) continue;
        perCondition.push({ condition: r.condition, outcome: cell.outcome, rawInfo: cell.rawInfo });
        if (OUTCOME_RANK[cell.outcome] > worstRank) {
          worstRank = OUTCOME_RANK[cell.outcome];
          worst = cell.outcome;
        }
      }
      out.push({ carrier, outcome: worst, perCondition });
    }
    out.sort((a, b) => {
      const r = OUTCOME_RANK[a.outcome] - OUTCOME_RANK[b.outcome];
      if (r !== 0) return r;
      return a.carrier.localeCompare(b.carrier);
    });
    return applyKnockouts(out);
  }, [analysis, carriersByToolkit, toolkit, vitals.dob, vitals.height, vitals.weight, vitals.faceAmount]);

  // Rated IUL runs a different engine: instead of a 5-outcome worst-of, each
  // product resolves to a best-case RATE CLASS (Preferred Elite → Table H →
  // Decline). Computed entirely client-side from the vitals + detected
  // conditions. Sorted best class first, declines last.
  const ratedAssessments = useMemo<RatedAssessment[]>(() => {
    if (toolkit !== "IUL" || !analysis) return [];
    const ageStr = ageFromDob(vitals.dob);
    const profile = {
      age: ageStr ? parseInt(ageStr, 10) : NaN,
      heightIn: parseHeightInches(vitals.height) ?? 0,
      weightLb: parseWeightLbs(vitals.weight) ?? 0,
      tobacco: vitals.tobacco === "smoker",
      face: parseFaceAmount(vitals.faceAmount ?? "") ?? 0,
    };
    return assessAllProducts(profile, analysis.conditions).sort(
      (a, b) => a.classIndex - b.classIndex || a.carrier.localeCompare(b.carrier),
    );
  }, [toolkit, analysis, vitals.dob, vitals.height, vitals.weight, vitals.tobacco, vitals.faceAmount]);

  useEffect(() => {
    if (!onAnalysisResult) return;
    onAnalysisResult({
      carriers: aggregated,
      conditions: analysis?.conditions ?? [],
      summary: analysis?.summary ?? "",
    });
  }, [aggregated, analysis, onAnalysisResult]);

  const aggregatedCounts = useMemo(() => {
    const c = { Approved: 0, Unknown: 0, Conditional: 0, Graded: 0, Decline: 0 } as Record<Outcome, number>;
    for (const a of aggregated) c[a.outcome]++;
    return c;
  }, [aggregated]);

  const filteredCarriers = outcomeFilter === "All"
    ? aggregated
    : aggregated.filter((a) => a.outcome === outcomeFilter);

  const showResults = analyzing || !!analysis;

  return (
    <div className={compact ? "space-y-3" : "space-y-5 pt-2"}>
      {heading}

      {TOOLKITS.length > 1 && (
        <div
          className="inline-flex p-1 rounded-xl"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--line-2)" }}
        >
          {TOOLKITS.map((t) => {
            const on = t.id === toolkit;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  flushPendingText();
                  if (t.id === toolkit) return;
                  abortRef.current?.abort();
                  abortRef.current = null;
                  setAnalyzing(false);
                  setFailure(null);
                  setToolkit(t.id);
                }}
                title={t.hint}
                className="px-6 py-2 rounded-lg text-sm font-semibold transition-colors"
                style={{
                  background: on ? "var(--lime)" : "transparent",
                  color: on ? "#0A0A0A" : "var(--ink-2)",
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* On phones the DOB field (date input + "Age" suffix) needs full width;
          height & weight share the row beneath it. Single row at sm+. */}
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <VitalInput
            label="Date of birth"
            placeholder="MM/DD/YYYY"
            value={vitals.dob}
            onChange={(v) => onVitalsChange({ ...vitals, dob: v })}
            compact={compact}
            type="date"
            suffix={ageFromDob(vitals.dob) ? `Age ${ageFromDob(vitals.dob)}` : undefined}
          />
        </div>
        <VitalInput
          label="Height"
          placeholder={`5'8"`}
          value={vitals.height}
          onChange={(v) => onVitalsChange({ ...vitals, height: v })}
          compact={compact}
        />
        <VitalInput
          label="Weight"
          placeholder="180 lbs"
          value={vitals.weight}
          onChange={(v) => onVitalsChange({ ...vitals, weight: v })}
          compact={compact}
        />
      </div>

      {/* IUL-only field-underwriting inputs: tobacco (feeds the analyzer so
          tobacco-keyed condition rules apply; on the rated toolkit it also splits
          non-tobacco vs tobacco class) and the requested face amount (drives
          per-product face-band knockouts / minimum-face rules). */}
      {toolkit !== "FEX" && (
        <div className="grid gap-2 grid-cols-2">
          <TobaccoToggle
            value={vitals.tobacco ?? ""}
            onChange={(v) => onVitalsChange({ ...vitals, tobacco: v })}
            compact={compact}
          />
          <VitalInput
            label="Face amount"
            placeholder="$250k"
            value={vitals.faceAmount ?? ""}
            onChange={(v) => onVitalsChange({ ...vitals, faceAmount: v })}
            compact={compact}
          />
        </div>
      )}

      <DobWarningBanner dob={vitals.dob} />
      <AgeStatusBanner dob={vitals.dob} carriers={carriersByToolkit[toolkit] ?? []} />
      <BuildStatusBanner height={vitals.height} weight={vitals.weight} />

      <textarea
        ref={textareaRef}
        aria-label="Medical notes"
        className="input w-full"
        placeholder={loadingMeta
          ? "Loading conditions…"
          : "Medical notes — e.g. \"Type 2 diabetes on insulin, had breast cancer in 1999 in remission since, no neuropathy.\""}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
        onCompositionEnd={(e) => onChange((e.target as HTMLTextAreaElement).value)}
        onBlur={flushPendingText}
        disabled={!!loadError}
        rows={compact ? 3 : 4}
        style={{ padding: "14px 16px", fontSize: compact ? 14 : 16, lineHeight: 1.4, resize: "vertical" }}
      />

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={submitAnalysis}
          disabled={!value.trim() || loadingMeta || !!loadError || analyzing || !!analysis}
          className="px-6 py-3 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "var(--lime)", color: "#0A0A0A" }}
        >
          {analyzing ? "Analyzing…" : "Submit"}
        </button>
        <span className="text-xs" style={{ color: "var(--ink-3)" }}>
          {analysis ? "Analysis is up to date." : "Analysis runs only when you submit."}
        </span>
      </div>

      {loadError && (
        <div
          className="card p-4 text-sm"
          style={{ borderColor: "var(--danger)", background: "rgba(248,113,113,0.06)", color: "var(--danger)" }}
        >
          <div className="font-semibold mb-1">Couldn&apos;t load conditions</div>
          <div style={{ color: "var(--ink-2)" }}>{loadError}</div>
        </div>
      )}
      {analyzeError && (
        <div className="text-sm" style={{ color: "var(--danger)" }}>{analyzeError}</div>
      )}

      {!showResults ? (
        <EmptyState />
      ) : analyzing ? (
        <AnalyzingPlaceholder />
      ) : analysis ? (
        toolkit === "IUL" ? (
          <>
            {analysis.summary && (
              <SummaryCard summary={analysis.summary} conditions={analysis.conditions} />
            )}
            <RatedOutlook assessments={ratedAssessments} conditionCount={analysis.conditions.length} />
          </>
        ) : (
        <>
          {analysis.results.length > 0 && analysis.summary && (
            <SummaryCard summary={analysis.summary} conditions={analysis.conditions} />
          )}
          {aggregated.length > 0 ? (
            <section className="card p-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
                <div>
                  <div className="display text-lg text-white leading-none">Carrier outlook</div>
                  <div className="text-[11px] uppercase tracking-wider mt-1" style={{ color: "var(--ink-3)" }}>
                    {analysis.results.length > 0 ? (
                      <>Combined across {analysis.results.length} condition{analysis.results.length === 1 ? "" : "s"}</>
                    ) : (
                      <>No underwriting conditions detected — every carrier defaults to Approved</>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <CountPill outcome="Approved" n={aggregatedCounts.Approved} />
                  <CountPill outcome="Unknown" n={aggregatedCounts.Unknown} />
                  <CountPill outcome="Conditional" n={aggregatedCounts.Conditional} />
                  <CountPill outcome="Graded" n={aggregatedCounts.Graded} />
                  <CountPill outcome="Decline" n={aggregatedCounts.Decline} />
                </div>
              </div>

              <div
                className="text-xs mb-4 px-3 py-2 rounded-md"
                style={{
                  borderLeft: "3px solid rgba(250,204,21,0.55)",
                  background: "rgba(250,204,21,0.06)",
                  color: "var(--ink-2)",
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: "#FACC15", fontWeight: 600 }}>Heads up — </span>
                this is a probabilistic estimation based on each carrier&apos;s published
                underwriting guidelines. An Approved (or Decline) here does not guarantee
                the carrier will issue (or reject) the application. Final underwriting
                decisions can differ from the wizard&apos;s read for any number of reasons —
                unreported medical history, MIB hits, prescription history, MVR, lab/exam
                results, or carrier discretion. Always submit and let the carrier&apos;s
                actual underwriting be the source of truth.
              </div>

              <div className="flex items-center gap-2 text-xs flex-wrap mb-4">
                <span style={{ color: "var(--ink-3)" }}>Filter:</span>
                {(["All", "Approved", "Unknown", "Conditional", "Graded", "Decline"] as const).map((o) => (
                  <button key={o} className="chip" data-on={outcomeFilter === o} onClick={() => setOutcomeFilter(o)}>
                    {o}
                  </button>
                ))}
              </div>

              <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
                {filteredCarriers.map((c) => (
                  <CarrierTile key={c.carrier} carrier={c.carrier} outcome={c.outcome} perCondition={c.perCondition} />
                ))}
              </div>
              {filteredCarriers.length === 0 && (
                <div className="text-xs" style={{ color: "var(--ink-3)" }}>No carriers match this filter.</div>
              )}
            </section>
          ) : (
            <div
              className="card p-4"
              style={{
                borderColor: "rgba(250,204,21,0.45)",
                background: "rgba(250,204,21,0.06)",
              }}
            >
              <div className="text-sm font-medium mb-1" style={{ color: "#FACC15" }}>
                Couldn&apos;t match these notes to any condition
              </div>
              <div className="text-sm" style={{ color: "var(--ink-2)" }}>
                {analysis.summary
                  ? <>{analysis.summary}{" "}</>
                  : null}
                The wizard isn&apos;t showing carrier outcomes because we couldn&apos;t confidently
                map what you typed to an entry in the {analysis.conditions.length === 0 ? "287-condition" : ""} canonical list.
                Try rephrasing (e.g. spell out abbreviations, use the most common medical term),
                or check the spelling.
              </div>
            </div>
          )}
        </>
        )
      ) : null}
    </div>
  );
}

function VitalInput({
  label,
  value,
  onChange,
  placeholder,
  compact,
  type = "text",
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  compact: boolean;
  type?: "text" | "date";
  suffix?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          color: "var(--ink-3)",
        }}
      >
        <span>{label}</span>
        {suffix && (
          <span style={{ color: "var(--lime)", letterSpacing: 0.4 }}>· {suffix}</span>
        )}
      </span>
      <input
        className="input"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: compact ? "8px 10px" : "10px 12px", fontSize: compact ? 14 : 15 }}
      />
    </label>
  );
}

// Two-state segmented control for tobacco. Clicking the active option again
// clears it back to unset (so the agent can blank a mistaken pick).
function TobaccoToggle({
  value,
  onChange,
  compact,
}: {
  value: "smoker" | "nonsmoker" | "";
  onChange: (v: "smoker" | "nonsmoker" | "") => void;
  compact: boolean;
}) {
  const opts: { id: "nonsmoker" | "smoker"; label: string }[] = [
    { id: "nonsmoker", label: "Non-smoker" },
    { id: "smoker", label: "Smoker" },
  ];
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          color: "var(--ink-3)",
        }}
      >
        Tobacco
      </span>
      <div
        className="inline-flex p-0.5 rounded-lg"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--line-2)" }}
      >
        {opts.map((o) => {
          const on = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(on ? "" : o.id)}
              className="rounded-md font-medium transition-colors"
              style={{
                flex: 1,
                padding: compact ? "6px 10px" : "8px 12px",
                fontSize: compact ? 13 : 14,
                background: on ? "var(--lime)" : "transparent",
                color: on ? "#0A0A0A" : "var(--ink-2)",
                cursor: "pointer",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </label>
  );
}

// Flags a bad DOB entry — a date in the future, or one implying an age over
// 120 — since both silently produce no age and no other flag would catch them.
function DobWarningBanner({ dob }: { dob: string }) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  // A native date input fires on every keystroke, so a year typed digit by
  // digit briefly reads 0001, 0019, 0198… Don't judge the date until the year
  // is a full 4 digits, otherwise the warning flashes while they're still
  // typing.
  if (d.getFullYear() < 1000) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dobLocal = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  let msg = "";
  if (dobLocal.getTime() > today.getTime()) {
    msg = "The date of birth is in the future — please re-enter it.";
  } else {
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    if (age >= 120) msg = `That date of birth implies an age of ${age} — please check it.`;
  }
  if (!msg) return null;

  const dot = "#F87171";
  return (
    <div className="rounded-md text-xs" style={{ border: `1px solid ${dot}55`, background: `${dot}14` }}>
      <div className="flex items-center gap-2.5 px-3 py-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: dot }} />
          <span className="font-semibold uppercase tracking-wider" style={{ color: dot }}>Check date of birth</span>
        </span>
        <span style={{ color: "var(--ink-2)" }}>{msg}</span>
      </div>
    </div>
  );
}

// Age knockout read from the DOB vital. Renders nothing while every carrier in
// the current toolkit can still issue at this age; otherwise flags how many are
// out (and who's left), so the green build badge isn't misread as "eligible"
// when age alone is a hard decline.
function AgeStatusBanner({ dob, carriers }: { dob: string; carriers: string[] }) {
  const ageStr = ageFromDob(dob);
  if (!ageStr || carriers.length === 0) return null;
  const age = parseInt(ageStr, 10);

  const remaining = carriers.filter((c) => age <= maxAgeForCarrier(c));
  const knocked = carriers.length - remaining.length;
  if (knocked === 0) return null; // every carrier still issues at this age

  const all = remaining.length === 0;
  const highest = Math.max(...carriers.map(maxAgeForCarrier));
  const dot = all ? "#F87171" : "#FB923C";
  const label = all ? "Over age limit" : "Some carriers out";
  const note = all
    ? `Age ${age} is over every carrier's max issue age (highest is ${highest}). No carrier will issue — regardless of health or build.`
    : `Age ${age} is over the max issue age for ${knocked} of ${carriers.length} carriers. Still eligible on age: ${remaining.join(", ")}.`;

  return (
    <div className="rounded-md text-xs" style={{ border: `1px solid ${dot}55`, background: `${dot}14` }}>
      <div className="flex items-center gap-2.5 px-3 py-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: dot }} />
          <span className="font-semibold uppercase tracking-wider" style={{ color: dot }}>{label}</span>
        </span>
        <span style={{ color: "var(--ink-2)" }}>{note}</span>
      </div>
    </div>
  );
}

// Live build read from the height + weight vitals. Renders nothing until both
// fields parse, then shows a colored status (Too Thin / Immediate / Borderline
// / Over Limit) with the band cutoffs and an expandable full reference chart.
function BuildStatusBanner({ height, weight }: { height: string; weight: string }) {
  const [showChart, setShowChart] = useState(false);
  const result = classifyBuild(height, weight);
  if (!result) return null;

  const meta = BUILD_STATUS_META[result.status];

  return (
    <div
      className="rounded-md text-xs"
      style={{ border: `1px solid ${meta.dot}55`, background: `${meta.dot}14` }}
    >
      <div className="flex items-center gap-2.5 px-3 py-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: meta.dot }} />
          <span className="font-semibold uppercase tracking-wider" style={{ color: meta.dot }}>
            {meta.label}
          </span>
        </span>
        <span style={{ color: "var(--ink-2)" }}>
          {formatHeight(result.inches)} · {result.weight} lbs — Immediate range{" "}
          {result.thin}–{result.immediate} lbs
          {result.offChart && (
            <span style={{ color: "var(--ink-3)" }}>
              {" "}· outside chart, using {formatHeight(result.rowInches)} limits
            </span>
          )}
        </span>
        <button
          onClick={() => setShowChart((v) => !v)}
          className="ml-auto"
          style={{ color: "var(--ink-3)", cursor: "pointer", textDecoration: "underline" }}
        >
          {showChart ? "Hide chart" : "View chart"}
        </button>
      </div>

      <div className="px-3 pb-2" style={{ color: "var(--ink-3)", lineHeight: 1.5 }}>
        {meta.note}
      </div>

      {showChart && (
        <div className="px-3 pb-3 pt-1">
          <table className="w-full" style={{ borderCollapse: "collapse", color: "var(--ink-2)" }}>
            <thead>
              <tr style={{ color: "var(--ink-3)", textAlign: "left" }}>
                <th className="font-semibold pb-1 pr-3">Height</th>
                <th className="font-semibold pb-1 pr-3" style={{ color: "#60A5FA" }}>Too Thin</th>
                <th className="font-semibold pb-1 pr-3" style={{ color: "#00DF81" }}>Immediate</th>
                <th className="font-semibold pb-1 pr-3" style={{ color: "#FACC15" }}>Borderline</th>
                <th className="font-semibold pb-1" style={{ color: "#F87171" }}>Over Limit</th>
              </tr>
            </thead>
            <tbody>
              {BUILD_ROWS.map((r) => {
                const here = Math.round(result.rowInches) === r.inches;
                return (
                  <tr
                    key={r.inches}
                    style={here ? { background: `${meta.dot}1f` } : undefined}
                  >
                    <td className="py-0.5 pr-3" style={{ color: here ? "var(--ink-0)" : "var(--ink-1)", fontWeight: here ? 700 : 400 }}>
                      {formatHeight(r.inches)}
                    </td>
                    <td className="py-0.5 pr-3">&lt;{r.thin}</td>
                    <td className="py-0.5 pr-3">{r.thin}–{r.immediate}</td>
                    <td className="py-0.5 pr-3">{r.immediate + 1}–{r.borderline}</td>
                    <td className="py-0.5">{r.borderline + 1}+</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-2" style={{ color: "var(--ink-3)" }}>
            Based on Americo, Mutual of Omaha &amp; Corebridge build guides. Carriers vary ±10 lbs — verify near a cutoff.
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card p-6 text-sm" style={{ color: "var(--ink-2)" }}>
      <div className="mb-2 text-white font-medium">How this works</div>
      Type your client notes, then click Submit. The wizard reads them clinically (distinguishing diabetes with vs without complications, current vs past cancer, timing of cardiovascular events, etc.) and combines every detected condition into one carrier outlook: green = highest chance of approval, yellow = conditional on timing, orange = will be graded, red = decline.
    </div>
  );
}

function AnalyzingPlaceholder() {
  return (
    <div className="card p-4 text-sm flex items-center gap-2" style={{ color: "var(--ink-2)" }}>
      <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--lime)" }} />
      Reading the notes and matching against carrier rules…
    </div>
  );
}

function SummaryCard({ summary, conditions }: { summary: string; conditions: string[] }) {
  return (
    <div className="card p-4" style={{ background: "var(--card-2)" }}>
      <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--ink-3)" }}>
        Wizard&apos;s read
      </div>
      <div className="text-sm leading-relaxed" style={{ color: "var(--ink-1)" }}>{summary}</div>
      {conditions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {conditions.map((c) => (
            <span key={c} className="chip" data-on="true">{c}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function CountPill({ outcome, n }: { outcome: Outcome; n: number }) {
  const theme = useTheme();
  const s = outcomeStyles(theme)[outcome];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px]"
      style={{ background: s.bg, color: s.fg, border: `1px solid ${s.border}` }}
    >
      <span className="font-semibold text-sm">{n}</span>
      <span className="opacity-80 uppercase tracking-wider">{s.label}</span>
    </span>
  );
}

// ─── Rated IUL rendering ───────────────────────────────────────────────────────

// Bucket a rate-class ladder index onto the existing 5-outcome palette so the
// rated tiles share the wizard's color language: preferred tiers read green,
// standard yellow, table ratings orange, decline red.
function classOutcome(idx: number): Outcome {
  if (idx >= 12) return "Decline";
  if (idx >= 5) return "Graded";      // Table A–H
  if (idx >= 3) return "Conditional"; // Select / Standard
  return "Approved";                  // Preferred Elite / Plus / Preferred
}

function RatedOutlook({
  assessments,
  conditionCount,
}: {
  assessments: RatedAssessment[];
  conditionCount: number;
}) {
  if (assessments.length === 0) return null;
  const issuable = assessments.filter((a) => !a.declined).length;
  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="display text-lg text-white leading-none">Carrier outlook — best-case rate class</div>
          <div className="text-[11px] uppercase tracking-wider mt-1" style={{ color: "var(--ink-3)" }}>
            {conditionCount > 0
              ? <>Across {conditionCount} condition{conditionCount === 1 ? "" : "s"} · {issuable} of {assessments.length} products issuable</>
              : <>No conditions detected · best-case class for {assessments.length} products</>}
          </div>
        </div>
      </div>

      <div
        className="text-xs mb-4 px-3 py-2 rounded-md"
        style={{
          borderLeft: "3px solid rgba(250,204,21,0.55)",
          background: "rgba(250,204,21,0.06)",
          color: "var(--ink-2)",
          lineHeight: 1.5,
        }}
      >
        <span style={{ color: "#FACC15", fontWeight: 600 }}>Heads up — </span>
        these are best-case rate classes estimated from each carrier&apos;s published guidelines,
        assuming optimal control and that labs (blood pressure, cholesterol) come back clean. Tables,
        flat extras, MIB/Rx/MVR hits, and carrier discretion can move the real offer. Always submit and
        let the carrier underwrite.
      </div>

      <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {assessments.map((a) => (
          <RatedTile key={a.productId} a={a} />
        ))}
      </div>
    </section>
  );
}

function RatedChip({
  on,
  onLabel,
  offLabel,
  flag,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  flag?: boolean;
}) {
  const label = on ? onLabel : offLabel;
  if (!label) return null;
  const color = flag ? "#FACC15" : on ? "#00DF81" : "#94A3B8";
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded"
      style={{ border: `1px solid ${color}55`, color, background: `${color}14` }}
    >
      {label}
    </span>
  );
}

function RatedTile({ a }: { a: RatedAssessment }) {
  const theme = useTheme();
  const s = outcomeStyles(theme)[classOutcome(a.classIndex)];
  const portalUrl = portalUrlForCarrier(a.carrier);

  const inner = (
    <>
      <div className="flex items-start gap-1">
        <div className="text-sm font-medium truncate" style={{ color: s.fg }} title={a.carrier}>
          {a.carrier}
        </div>
        {portalUrl && (
          <span aria-hidden className="text-xs shrink-0" style={{ color: s.fg, opacity: 0.7 }}>↗</span>
        )}
      </div>
      <div className="text-[13px] font-semibold mt-0.5" style={{ color: s.fg }}>{a.className}</div>
      <div className="text-[11px] mt-1" style={{ color: "var(--ink-2)", lineHeight: 1.4 }}>{a.bindingConstraint}</div>
      {!a.declined && (
        <>
          <div className="text-[11px] mt-1.5" style={{ color: "var(--ink-3)" }}>
            <span style={{ color: "var(--ink-2)" }}>Needs:</span> {a.requirements.join(", ")}
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            <RatedChip on={a.livingBenefits} onLabel="Living benefits ✓" offLabel="No living benefits" />
            {a.pendingLabs && <RatedChip on flag onLabel="Best case — pending labs" offLabel="" />}
            {a.unknownConditions.length > 0 && (
              <RatedChip on flag onLabel={`⚠ ${a.unknownConditions.length} unrecognized — verify`} offLabel="" />
            )}
          </div>
        </>
      )}
      {a.note && (
        <div
          className="text-[10px] mt-1.5 pt-1.5"
          style={{ color: "var(--ink-3)", lineHeight: 1.4, fontStyle: "italic", borderTop: "1px solid var(--line-2)" }}
        >
          {a.note}
        </div>
      )}
    </>
  );

  const cls = "rounded-md px-3 py-2 block";
  const style: React.CSSProperties = {
    background: s.bg,
    border: `1px solid ${s.border}`,
    textDecoration: "none",
    cursor: portalUrl ? "pointer" : "default",
  };
  return portalUrl ? (
    <a
      href={portalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cls}
      style={style}
      onClick={() => track("carrier_link_clicked", { carrier: a.carrier })}
    >
      {inner}
    </a>
  ) : (
    <div className={cls} style={style}>{inner}</div>
  );
}

function CarrierTile({
  carrier, outcome, perCondition,
}: {
  carrier: string;
  outcome: Outcome;
  perCondition: AggregatedCarrier["perCondition"];
}) {
  const theme = useTheme();
  const palette = outcomeStyles(theme);
  const s = palette[outcome];
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const tileRef = useRef<HTMLElement | null>(null);
  const hasDetail = perCondition.length > 0;
  const portalUrl = portalUrlForCarrier(carrier);

  const TIP_W = 384;
  // Measure the tile and place the card as a viewport-fixed overlay, clamped on
  // screen and flipped above the tile when there's more room up than down.
  const showTip = () => {
    const el = tileRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.left, window.innerWidth - TIP_W - 8));
      const spaceBelow = window.innerHeight - r.bottom - 12;
      const spaceAbove = r.top - 12;
      if (spaceBelow >= 180 || spaceBelow >= spaceAbove) {
        setPos({ left, top: r.bottom + 4, maxHeight: spaceBelow });
      } else {
        setPos({ left, bottom: window.innerHeight - r.top + 4, maxHeight: spaceAbove });
      }
    }
    setOpen(true);
  };
  const hideTip = () => setOpen(false);

  const inner = (
    <>
      <div className="flex items-start gap-1">
        <div className="text-sm font-medium truncate" style={{ color: s.fg }} title={carrier}>
          {carrier}
        </div>
        {portalUrl && (
          <span aria-hidden className="text-xs shrink-0" style={{ color: s.fg, opacity: 0.7 }}>↗</span>
        )}
      </div>
      <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: s.fg, opacity: 0.85 }}>
        {s.label}
      </div>
    </>
  );

  // Rendered into <body> as a fixed overlay so it never shifts page layout
  // (an in-flow card caused a scrollbar flicker that toggled the hover state).
  const tip =
    open && hasDetail && pos && typeof document !== "undefined"
      ? createPortal(
          <div
            className="rounded-lg p-3 text-[11px] leading-relaxed pointer-events-none shadow-xl"
            style={{
              position: "fixed",
              left: pos.left,
              top: pos.top,
              bottom: pos.bottom,
              width: TIP_W,
              maxWidth: "calc(100vw - 16px)",
              maxHeight: pos.maxHeight,
              overflowY: "auto",
              zIndex: 60,
              background: "var(--card-1)",
              border: "1px solid var(--line-2)",
              color: "var(--ink-1)",
            }}
          >
            <div className="font-medium mb-2" style={{ color: "var(--ink-0)" }}>{carrier}</div>
            {perCondition.map((p) => {
              const ps = palette[p.outcome];
              const rules = humanizeRawInfo(p.rawInfo);
              const hasRules = rules.length > 0;
              return (
                <div key={p.condition} className="mb-2.5 last:mb-0">
                  <div style={{ color: "var(--ink-2)" }}>{p.condition}</div>
                  <div style={{ color: ps.fg, fontWeight: 500 }}>{ps.label}</div>
                  {hasRules && (
                    <ul className="mt-1 space-y-0.5" style={{ listStyle: "none", paddingLeft: 0 }}>
                      {rules.map((r, i) => (
                        <li key={i} className="flex gap-1.5" style={{ color: "var(--ink-2)" }}>
                          <span style={{ color: "var(--ink-3)" }}>•</span>
                          <span>
                            <span>{r.when}</span>
                            <span style={{ color: "var(--ink-3)" }}> → </span>
                            <span style={{ color: "var(--ink-1)" }}>{r.then}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>,
          // Portal into the .ll-analytics wrapper (not <body>) so the design
          // tokens — var(--card-1), --ink-*, --line-2 — stay in scope. Outside
          // it they resolve to nothing and the card renders transparent.
          tileRef.current?.closest(".ll-analytics") ?? document.body
        )
      : null;

  const tileClass = "rounded-md px-3 py-2 block";
  const tileStyle: React.CSSProperties = {
    background: s.bg,
    border: `1px solid ${s.border}`,
    cursor: portalUrl ? "pointer" : hasDetail ? "help" : "default",
    textDecoration: "none",
  };

  // The whole tile is a link to the carrier's agent portal when we have one.
  return portalUrl ? (
    <a
      ref={(el) => { tileRef.current = el; }}
      href={portalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={tileClass}
      style={tileStyle}
      onMouseEnter={showTip}
      onMouseLeave={hideTip}
      onClick={() => track("carrier_link_clicked", { carrier })}
    >
      {inner}
      {tip}
    </a>
  ) : (
    <div
      ref={(el) => { tileRef.current = el; }}
      className={tileClass}
      style={tileStyle}
      onMouseEnter={showTip}
      onMouseLeave={hideTip}
    >
      {inner}
      {tip}
    </div>
  );
}
