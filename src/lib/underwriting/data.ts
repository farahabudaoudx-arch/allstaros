// Underwriting rules data — imported from data.json (a trimmed copy of the
// LifeLeads carrier matrix, restricted to the carriers this app sells). Bundled
// with the code so there's no DB table, no seed step, and no runtime fs read.

import rawData from "./data.json";
import type { ConditionResult, Outcome, Toolkit } from "./types";
import { ratedCarrierNames } from "./iul-rated";

type RawCellData = { outcome?: string; rawInfo?: string };
type RawCondition = {
  condition: string;
  category?: string;
  toolkits?: Partial<Record<Toolkit, Record<string, RawCellData>>>;
};
type RawData = { conditions?: RawCondition[] };

// ─── Outcome normalization ────────────────────────────────────────────────────
// The new (post-spreadsheet) JSON already uses the canonical 4 outcomes for FEX.
// SIUL still carries carrier-product tier strings (Preferred, Level,
// SimpliNow Legacy, etc.) — the maps below bucket those into the 4 categories.

const APPROVED_TIER = new Set([
  "approved", "immediate", "level",
  "preferred", "preferred plus",
  "select", "standard", "standard plus",
  "simplinow legacy", "simplinow legacy max",
  "not asked / allowed", "see other condition",
]);

const GRADED_TIER = new Set([
  "graded", "modified", "substandard",
  "guaranteed issue", "gi",
  "rop", "return of premium",
  "eagle guaranteed",
]);

function normalizeOutcome(raw: string): Outcome {
  if (!raw) return "Unknown";
  const s = String(raw).trim();
  const lower = s.toLowerCase();
  if (lower === "unknown") return "Unknown";
  if (s.startsWith("⚡") || lower.startsWith("conditional")) return "Conditional";
  if (APPROVED_TIER.has(lower)) return "Approved";
  if (GRADED_TIER.has(lower)) return "Graded";
  if (lower === "decline") return "Decline";
  // Anything else (unrecognized tier name) → flag as Unknown rather than
  // silently defaulting to Approved, which was the bug behind "active breast
  // cancer → Approved everywhere".
  return "Unknown";
}

function buildRawInfo(rawOutcome: string, rawInfo: string): string {
  const outcome = (rawOutcome ?? "").trim();
  const info = (rawInfo ?? "").trim();
  if (!info) return outcome;
  if (!outcome) return info;
  if (info.toLowerCase().includes(outcome.toLowerCase())) return info;
  return `${outcome} — ${info}`;
}

// ─── Index ───────────────────────────────────────────────────────────────────

type Cell = { outcome: Outcome; rawInfo: string };

type Index = {
  conditions: Array<{ condition: string; category: string }>;
  carriers: string[];
  byCondition: Map<string, { category: string; carriers: Map<string, Cell> }>;
};

function buildIndex(raw: RawData, toolkit: Toolkit): Index {
  const conditions: Index["conditions"] = [];
  const carriersSet = new Set<string>();
  const byCondition = new Map<string, { category: string; carriers: Map<string, Cell> }>();

  for (const c of raw.conditions ?? []) {
    const cond = c.condition;
    if (!cond) continue;
    const category = c.category ?? "General";
    const tk = c.toolkits?.[toolkit];
    if (!tk) continue;

    const carrierMap = new Map<string, Cell>();
    for (const [carrier, info] of Object.entries(tk)) {
      const rawOut = info?.outcome ?? "";
      const rawInf = info?.rawInfo ?? "";
      carrierMap.set(carrier, {
        outcome: normalizeOutcome(rawOut),
        rawInfo: buildRawInfo(rawOut, rawInf).slice(0, 2000),
      });
      carriersSet.add(carrier);
    }
    if (carrierMap.size === 0) continue;

    conditions.push({ condition: cond, category });
    byCondition.set(cond, { category, carriers: carrierMap });
  }

  return {
    conditions,
    carriers: Array.from(carriersSet).sort((a, b) => a.localeCompare(b)),
    byCondition,
  };
}

// Only FEX and SIUL are data.json-backed. IUL is the rated toolkit — it shares
// the canonical condition list but its carriers/outcomes come from iul-rated.ts.
type BuiltToolkit = "FEX" | "SIUL";

// Built lazily on first access so cold-start cost is paid by the first request,
// not by import-time work in unrelated routes.
let indexCache: Record<BuiltToolkit, Index> | null = null;
function indexes(): Record<BuiltToolkit, Index> {
  if (indexCache) return indexCache;
  const raw = rawData as RawData;
  indexCache = {
    FEX:  buildIndex(raw, "FEX"),
    SIUL: buildIndex(raw, "SIUL"),
  };
  return indexCache;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getConditionsForToolkit(toolkit: Toolkit) {
  // IUL reuses the shared canonical list (FEX and SIUL carry the same 287 rows).
  if (toolkit === "IUL") return indexes().FEX.conditions;
  return indexes()[toolkit].conditions;
}

export function getCarriersForToolkit(toolkit: Toolkit): string[] {
  if (toolkit === "IUL") return ratedCarrierNames();
  return indexes()[toolkit].carriers;
}

export function lookupCarrierOutcomes(
  toolkit: Toolkit,
  conditions: string[]
): ConditionResult[] {
  // Rated IUL doesn't use the per-condition carrier-cell grid; the wizard runs
  // the rate-class engine client-side from the detected conditions.
  if (toolkit === "IUL") return [];
  const idx = indexes()[toolkit];
  const results: ConditionResult[] = [];
  for (const cond of conditions) {
    const bucket = idx.byCondition.get(cond);
    if (!bucket) continue;
    const carriers: ConditionResult["carriers"] = {};
    for (const [carrier, cell] of bucket.carriers) {
      carriers[carrier] = { outcome: cell.outcome, rawInfo: cell.rawInfo };
    }
    results.push({ condition: cond, category: bucket.category, carriers });
  }
  return results;
}

// Substring search used by the freeform chat route.
export function searchConditionsByTerms(
  toolkit: Toolkit,
  terms: string[]
): ConditionResult[] {
  if (toolkit === "IUL") return [];
  const idx = indexes()[toolkit];
  const lcTerms = terms
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length >= 2);
  if (lcTerms.length === 0) return [];
  const matched = idx.conditions
    .filter((c) => {
      const lc = c.condition.toLowerCase();
      return lcTerms.some((t) => lc.includes(t));
    })
    .map((c) => c.condition);
  return lookupCarrierOutcomes(toolkit, matched);
}
