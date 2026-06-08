// Height/weight "average build" guide. Used to gauge — purely on build —
// whether a client likely lands at Immediate, in a borderline band, or over
// the limit, before any medical conditions are considered.
//
// Source: Americo, Mutual of Omaha, and Corebridge build guides. Carriers vary
// by roughly ±10 lbs, so a weight sitting near a cutoff should be treated as
// soft, not a hard answer.

export type BuildStatus = "TooThin" | "Immediate" | "Borderline" | "OverLimit";

export type BuildResult = {
  status: BuildStatus;
  inches: number;    // actual parsed height, in total inches (for display)
  rowInches: number; // clamped to the chart's range (for cutoff lookup / row highlight)
  offChart: boolean; // true when the height is taller/shorter than the chart covers
  weight: number;    // parsed weight, in lbs
  // The band cutoffs that applied at this height (interpolated for in-between
  // heights). Exposed so the UI can show "Immediate range 115–290", etc.
  thin: number;
  immediate: number;
  borderline: number;
};

type BuildRow = {
  inches: number;     // total height in inches
  thin: number;       // weight strictly below this → Too Thin
  immediate: number;  // thin..immediate (inclusive) → Immediate
  borderline: number; // immediate(excl)..borderline (incl) → Borderline; above → Over Limit
};

// The published chart, in 2-inch steps (plus a 6'9" row). In-between heights
// are linearly interpolated; heights outside the range clamp to the ends.
export const BUILD_ROWS: BuildRow[] = [
  { inches: 56, thin: 85,  immediate: 200, borderline: 220 }, // 4'8"
  { inches: 58, thin: 90,  immediate: 215, borderline: 230 }, // 4'10"
  { inches: 60, thin: 95,  immediate: 230, borderline: 245 }, // 5'0"
  { inches: 62, thin: 100, immediate: 245, borderline: 260 }, // 5'2"
  { inches: 64, thin: 105, immediate: 260, borderline: 275 }, // 5'4"
  { inches: 66, thin: 110, immediate: 275, borderline: 290 }, // 5'6"
  { inches: 68, thin: 115, immediate: 290, borderline: 305 }, // 5'8"
  { inches: 70, thin: 120, immediate: 305, borderline: 320 }, // 5'10"
  { inches: 72, thin: 125, immediate: 320, borderline: 335 }, // 6'0"
  { inches: 74, thin: 130, immediate: 335, borderline: 350 }, // 6'2"
  { inches: 76, thin: 135, immediate: 350, borderline: 370 }, // 6'4"
  { inches: 78, thin: 140, immediate: 365, borderline: 385 }, // 6'6"
  { inches: 80, thin: 145, immediate: 380, borderline: 400 }, // 6'8"
  { inches: 81, thin: 150, immediate: 395, borderline: 415 }, // 6'9"
];

const MIN_INCHES = BUILD_ROWS[0].inches;
const MAX_INCHES = BUILD_ROWS[BUILD_ROWS.length - 1].inches;

export const BUILD_STATUS_META: Record<
  BuildStatus,
  { label: string; dot: string; note: string }
> = {
  TooThin:    { label: "Too Thin",   dot: "#60A5FA", note: "Underweight for height — may signal frailty or chronic illness; expect extra scrutiny." },
  Immediate:  { label: "Immediate",  dot: "#00DF81", note: "Build is within the standard range — likely qualifies for immediate coverage if otherwise healthy." },
  Borderline: { label: "Borderline", dot: "#FACC15", note: "Near the upper cutoff — may still qualify Immediate if otherwise healthy. Carriers vary ±10 lbs." },
  OverLimit:  { label: "Over Limit", dot: "#F87171", note: "Above the build limit for this height — likely graded or decline on build alone." },
};

// "5'8\"", "5'8", "5 ft 8 in", "5ft8", "68", "68in" → total inches. Returns
// null when nothing parseable is found.
export function parseHeightInches(raw: string): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();

  // feet + optional inches: 5'8", 5' 8, 5 ft 8 in, 5ft8, 5 feet 8
  const ft = s.match(/(\d+)\s*(?:'|’|ft\.?|feet|f)\s*(\d+(?:\.\d+)?)?/);
  if (ft) {
    const feet = parseInt(ft[1], 10);
    const inch = ft[2] ? parseFloat(ft[2]) : 0;
    const total = feet * 12 + inch;
    return total > 0 ? total : null;
  }

  // two bare numbers: "5 8" → 5 ft 8 in
  const two = s.match(/^(\d+)\s+(\d+)$/);
  if (two) return parseInt(two[1], 10) * 12 + parseInt(two[2], 10);

  // single bare number: 36–96 reads as inches, 4–7 reads as whole feet
  const one = s.match(/^(\d+(?:\.\d+)?)\s*(?:"|”|in\.?|inch(?:es)?)?$/);
  if (one) {
    const n = parseFloat(one[1]);
    if (n >= 36 && n <= 96) return n;
    if (n >= 4 && n <= 7) return n * 12;
  }
  return null;
}

// "180 lbs", "180", "180lb" → 180. Returns null when no number is present.
export function parseWeightLbs(raw: string): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return n > 0 ? n : null;
}

// Linear interpolation of a band cutoff at an arbitrary height.
function cutoffAt(inches: number, key: keyof Omit<BuildRow, "inches">): number {
  const clamped = Math.min(MAX_INCHES, Math.max(MIN_INCHES, inches));
  for (let i = 0; i < BUILD_ROWS.length - 1; i++) {
    const lo = BUILD_ROWS[i];
    const hi = BUILD_ROWS[i + 1];
    if (clamped >= lo.inches && clamped <= hi.inches) {
      const t = (clamped - lo.inches) / (hi.inches - lo.inches);
      return Math.round(lo[key] + t * (hi[key] - lo[key]));
    }
  }
  // clamped == MAX_INCHES falls through the loop's <= on the last pair, but
  // guard anyway.
  return BUILD_ROWS[BUILD_ROWS.length - 1][key];
}

// Classify a client's build. Returns null when either field can't be parsed,
// so the caller can simply hide the indicator until both are filled in.
export function classifyBuild(
  heightRaw: string,
  weightRaw: string
): BuildResult | null {
  const inches = parseHeightInches(heightRaw);
  const weight = parseWeightLbs(weightRaw);
  if (inches == null || weight == null) return null;

  const thin = cutoffAt(inches, "thin");
  const immediate = cutoffAt(inches, "immediate");
  const borderline = cutoffAt(inches, "borderline");

  let status: BuildStatus;
  if (weight < thin) status = "TooThin";
  else if (weight <= immediate) status = "Immediate";
  else if (weight <= borderline) status = "Borderline";
  else status = "OverLimit";

  const clampedInches = Math.min(MAX_INCHES, Math.max(MIN_INCHES, inches));
  return {
    status,
    inches,                       // show what the agent actually typed
    rowInches: clampedInches,     // cutoffs/row highlight use the nearest charted row
    offChart: inches !== clampedInches,
    weight,
    thin,
    immediate,
    borderline,
  };
}

// Pretty-print total inches as 5'8" for chart labels.
export function formatHeight(inches: number): string {
  const ft = Math.floor(inches / 12);
  const inch = Math.round(inches - ft * 12);
  return `${ft}'${inch}"`;
}
