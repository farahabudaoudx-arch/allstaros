// Rated IUL engine (Phase 2).
//
// Final Expense and simplified-issue IUL answer a binary-ish question (Approved /
// Graded / Decline). Fully-underwritten IUL answers a *graded* one: what RATE
// CLASS — Preferred Elite → Standard → Table A–H → Decline. The class can triple
// the premium, so collapsing it to "Approved" (as the FEX/SIUL model does) throws
// away the whole point. This module is a separate, self-contained engine that
// returns a best-case rate class per product.
//
// Sources: Transamerica FFIUL II / FCIUL II field guide (BMI→class table p.13,
// medical impairments p.21–24, living-benefit exclusions p.14, age/face
// requirement grids p.7–9) and the National Life Group underwriting guide
// (SummitLife/PeakLife/FlexLife/BasicSecure/TotalSecure grids p.21–26, build
// tables p.32, ratings p.34–37).
//
// Caps are a CURATED best-case estimate. Where a guide is explicit (uninsurable
// lists, qualifying lists), we follow it. Elsewhere we assign the most credit a
// well-controlled, uncomplicated case could earn, then flag anything unrecognized
// — matching the "show best-case assuming labs pass, and flag" decision. The
// wizard already carries the heavy "this is an estimate, the carrier decides"
// disclaimer.

// ─── Rate-class ladder ─────────────────────────────────────────────────────────
// One canonical ordered ladder, best (0) → worst. Each carrier maps its own
// label names onto these indices. A condition or build factor contributes a
// CAP (a floor on the index); the final class is the worst (highest) cap.

export const LADDER = [
  "Preferred Elite", // 0
  "Preferred Plus",  // 1
  "Preferred",       // 2
  "Select",          // 3
  "Standard",        // 4
  "Table A",         // 5  (125%)
  "Table B",         // 6  (150%)
  "Table C",         // 7  (175%)
  "Table D",         // 8  (200%)
  "Table E",         // 9  (225%)
  "Table F",         // 10 (250%)
  "Table H",         // 11 (300%)
  "Decline",         // 12
] as const;

// Named indices for readability in the cap tables below.
const ELITE = 0, PREF_PLUS = 1, PREFERRED = 2, SELECT = 3, STANDARD = 4;
const TABLE_A = 5, TABLE_B = 6, TABLE_C = 7, TABLE_D = 8, TABLE_E = 9, TABLE_F = 10, TABLE_H = 11;
export const DECLINE = 12;
const BEST = ELITE; // a condition/build with no penalty allows the best class

// ─── Carrier label maps ────────────────────────────────────────────────────────
// Transamerica IUL classes: Preferred Elite / Preferred Plus / Preferred /
// Nontobacco(=Standard) + Table A–H; tobacco collapses to Preferred Tobacco /
// Tobacco. NLG: Elite / Preferred / Select / Standard + Table B–H (no Table A).

type CarrierFamily = "transam" | "nlg";

const TRANSAM_NT = [
  "Preferred Elite", "Preferred Plus", "Preferred", "Nontobacco", "Nontobacco",
  "Table A", "Table B", "Table C", "Table D", "Table E", "Table F", "Table H", "Decline",
];
const NLG_NT = [
  "Elite", "Preferred NT", "Preferred NT", "Select NT", "Standard NT",
  "Table B", "Table B", "Table C", "Table D", "Table E", "Table F", "Table H", "Decline",
];

// Map a ladder index + tobacco flag to the carrier's display label.
export function labelFor(family: CarrierFamily, idx: number, tobacco: boolean): string {
  if (idx >= DECLINE) return "Decline";
  const nt = (family === "transam" ? TRANSAM_NT : NLG_NT)[idx];
  if (!tobacco) return nt;
  // Tobacco classes: the best preferred tiers collapse to "Preferred Tobacco";
  // standard collapses to "… Tobacco"; tables keep the table + Tobacco.
  if (idx <= PREFERRED) return "Preferred Tobacco";
  if (idx <= STANDARD) return family === "transam" ? "Tobacco" : "Standard Tobacco";
  return `${LADDER[idx]} Tobacco`;
}

// ─── Product catalog ───────────────────────────────────────────────────────────

export type RatedProduct = {
  id: string;
  carrier: string;   // display name, "Carrier (Product)" — matches existing tile convention
  family: CarrierFamily;
  ageMin: number;
  ageMax: number;
  faceMin: number;
  faceMax: number;   // Infinity when only a floor applies
  note?: string;     // optional per-product caveat shown on the tile
};

export const RATED_PRODUCTS: RatedProduct[] = [
  { id: "ffiul2",     carrier: "Transamerica (FFIUL II)",        family: "transam", ageMin: 0,  ageMax: 85, faceMin: 25_000,    faceMax: Infinity },
  { id: "fciul2",     carrier: "Transamerica (FCIUL II)",        family: "transam", ageMin: 0,  ageMax: 85, faceMin: 250_000,   faceMax: Infinity },
  { id: "summitlife", carrier: "National Life Group (SummitLife)", family: "nlg",   ageMin: 0,  ageMax: 85, faceMin: 1_000_000, faceMax: Infinity },
  { id: "peaklife",   carrier: "National Life Group (PeakLife)",   family: "nlg",   ageMin: 18, ageMax: 85, faceMin: 1_000_000, faceMax: Infinity },
  { id: "flexlife",   carrier: "National Life Group (FlexLife)",   family: "nlg",   ageMin: 0,  ageMax: 85, faceMin: 25_000,    faceMax: Infinity },
  { id: "basicsecure", carrier: "National Life Group (BasicSecure)", family: "nlg", ageMin: 0,  ageMax: 85, faceMin: 25_000,    faceMax: Infinity },
  { id: "totalsecure", carrier: "National Life Group (TotalSecure)", family: "nlg", ageMin: 0,  ageMax: 85, faceMin: 25_000,    faceMax: Infinity },
  // SurvivorLife is survivorship — it insures TWO lives on one policy. The wizard
  // models one life, so we assess it for the person entered and tell the agent to
  // run the partner separately. Survivorship blends both lives' mortality, so an
  // impaired or even uninsurable life can often still be placed when paired with a
  // healthier partner — the single-life read here is conservative.
  {
    id: "survivorlife", carrier: "National Life Group (SurvivorLife)", family: "nlg",
    ageMin: 0, ageMax: 85, faceMin: 250_000, faceMax: Infinity,
    note: "Survivorship policy — covers two lives. This is the read for the person entered; run the wizard again for the partner. A survivorship case can often still be placed when one life is impaired and the other is healthier.",
  },
];

// ─── Build → class ─────────────────────────────────────────────────────────────

export function bmiFrom(heightIn: number, weightLb: number): number {
  if (!heightIn || !weightLb) return NaN;
  return (703 * weightLb) / (heightIn * heightIn);
}

// Transamerica blended BMI table (guide p.13), with the separate 60+ band.
export function transamBuildClass(bmi: number, age: number): number {
  if (Number.isNaN(bmi)) return BEST;
  if (bmi <= 16) return DECLINE;
  if (age >= 60) {
    if (bmi < 18) return STANDARD;     // "Individual Consideration" — treat as Standard
    if (bmi < 28) return ELITE;
    if (bmi < 30) return PREFERRED;
    if (bmi < 32) return SELECT;
    if (bmi < 35) return STANDARD;
  } else {
    if (bmi < 17) return STANDARD;
    if (bmi < 28) return ELITE;
    if (bmi < 30) return PREFERRED;
    if (bmi < 32) return SELECT;
    if (bmi < 35) return STANDARD;
  }
  if (bmi < 37) return TABLE_A;
  if (bmi < 39) return TABLE_B;
  if (bmi < 41) return TABLE_C;
  if (bmi < 42) return TABLE_D;
  if (bmi < 43) return TABLE_E;
  if (bmi < 44) return TABLE_F;
  if (bmi < 46) return TABLE_H;
  return DECLINE;
}

// NLG permanent-product build table (guide p.32). NLG has no Table A; its Express
// classes map onto mid-table ratings.
export function nlgBuildClass(bmi: number): number {
  if (Number.isNaN(bmi)) return BEST;
  if (bmi >= 46.5) return DECLINE;
  if (bmi >= 42.5) return TABLE_F;
  if (bmi >= 37.5) return TABLE_C;
  if (bmi >= 32.7) return STANDARD;
  if (bmi >= 29.9) return SELECT;
  if (bmi >= 27.1) return PREFERRED;
  if (bmi >= 18.5) return ELITE;
  return STANDARD; // low BMI → individual consideration
}

function buildClass(product: RatedProduct, bmi: number, age: number): number {
  return product.family === "transam" ? transamBuildClass(bmi, age) : nlgBuildClass(bmi);
}

// ─── Condition → cap ───────────────────────────────────────────────────────────
// Best-case ladder cap a condition allows (DECLINE = uninsurable). A condition
// absent from this map carries no penalty (Preferred-Elite eligible). Optimally
// controlled, uncomplicated cases are assumed; the cap is the ceiling, not a
// guarantee.

export const CONDITION_CAP: Record<string, number> = {
  // ── Uninsurable on fully-underwritten IUL ──
  "ALS (Lou Gehrig's Disease)": DECLINE,
  "Alzheimer's / Dementia": DECLINE,
  "Huntington's Disease": DECLINE,
  "Cystic Fibrosis": DECLINE,
  "Mental Incapacity": DECLINE,
  "Schizophrenia": DECLINE,
  "Down Syndrome": DECLINE,
  "Current Cancer (excluding basal/squamous cell skin cancer)": DECLINE,
  "Chemotherapy (Current)": DECLINE,
  "Brain Tumor (Not Removed, Malignant)": DECLINE,
  "Hodgkin's Lymphoma (Current)": DECLINE,
  "Leukemia (Current)": DECLINE,
  "Melanoma (Current)": DECLINE,
  "Multiple Myeloma (Current)": DECLINE,
  "Non-Hodgkin's Lymphoma (Current)": DECLINE,
  "Cirrhosis (Stage C or D)": DECLINE,
  "Liver Failure": DECLINE,
  "Kidney Dialysis": DECLINE,
  "Kidney Failure (ESRD)": DECLINE,
  "Kidney Disease (Stage 5)": DECLINE,
  "Organ Transplant (Awaiting)": DECLINE,
  "Defibrillator": DECLINE,
  "Respiratory Failure": DECLINE,
  "Oxygen (Continuous use)": DECLINE,
  "Pulmonary Fibrosis": DECLINE,
  "AIDS": DECLINE,
  "ARC (Aids Related Complex)": DECLINE,
  "ADLs - Activities of Daily Living (Eating, Bathing, Dressing, etc)": DECLINE,
  "Bedridden": DECLINE,
  "Hospice": DECLINE,
  "Long Term Care Facility": DECLINE,
  "Nursing Home": DECLINE,
  "Wheelchair (Confined)": DECLINE,
  "Quadriplegia": DECLINE,
  "Disability": DECLINE,
  "Awaiting Surgery": DECLINE,
  "Pending Surgery": DECLINE,
  "Pending Hospitalization": DECLINE,
  "Awaiting Results from Diagnostic Testing": DECLINE,
  "Abdominal aortic aneurysm (Not corrected)": DECLINE,
  "Thoracic aortic aneurysm (Not corrected)": DECLINE,
  "Cerebral aneurysm (Not corrected)": DECLINE,

  // ── Table-rated (issuable but capped) ──
  // Cardiac
  "Coronary Artery Disease (CAD)": TABLE_D,
  "Heart Attack": TABLE_D,
  "Coronary Artery Bypass Surgery": TABLE_D,
  "Angioplasty": TABLE_D,
  "Stent Placement (Heart or brain)": TABLE_D,
  "Heart Blockage": TABLE_D,
  "Clogged Arteries": TABLE_D,
  "Heart Disease": TABLE_D,
  "Heart Surgery": TABLE_D,
  "Heart Valve Surgery": TABLE_D,
  "Circulatory Surgery (Heart or brain)": TABLE_D,
  "Angina (Chest Pain)": TABLE_D,
  "CHF (Congestive Heart Failure)": TABLE_H,
  "Cardiomyopathy": TABLE_F,
  "Hypertrophic Cardiomyopathy": TABLE_F,
  "Atrial Fibrillation (AFIB)": TABLE_B,
  "Heart Arrhythmia": TABLE_B,
  "Irregular Heartbeat": TABLE_B,
  "Wolff-Parkinson-White Syndrome": TABLE_B,
  "Cardiac ablation": TABLE_B,
  "Cardioversion Treatment": TABLE_B,
  "Watchman Implant": TABLE_C,
  "Pacemaker": TABLE_C,
  "Peripheral Vascular Disease (PVD)": TABLE_D,
  "Peripheral Artery Disease (PAD)": TABLE_D,
  // Cerebrovascular
  "Stroke": TABLE_D,
  "Hemorrhagic Stroke": TABLE_D,
  "Transient Ischemic Attack (TIA or Mini-Stroke)": TABLE_D,
  // Endocrine / diabetes
  "Diabetes (No Complications)": STANDARD,
  "Diabetes (With Complications)": TABLE_F,
  "Diabetic Neuropathy (Nerve)": TABLE_F,
  "Diabetic Nephropathy (Kidney)": TABLE_F,
  "Diabetic Retinopathy (Eye)": TABLE_F,
  "Diabetic Coma": TABLE_F,
  "Insulin Shock": TABLE_F,
  // Pulmonary
  "Chronic Obstructive Pulmonary Disease (COPD)": TABLE_D,
  "Emphysema": TABLE_D,
  "Bronchitis (Chronic)": TABLE_C,
  "Black Lung": TABLE_D,
  "Asthma (Chronic)": TABLE_B,
  "Asthma (Mild)": STANDARD,
  "Sleep Apnea (not requiring oxygen use)": STANDARD,
  "Sleep Apnea (requiring oxygen use)": TABLE_C,
  "Pulmonary Sarcoidosis (Stage 3 or 4)": TABLE_F,
  "Pulmonary Sarcoidosis (Stage 1 or 2)": STANDARD,
  // Liver / hepatitis
  "Hepatitis B (Chronic)": TABLE_C,
  "Hepatitis C (Chronic)": TABLE_C,
  "Hepatitis B (Cured)": STANDARD,
  "Hepatitis C (Cured)": STANDARD,
  "Cirrhosis (Stage A or B)": TABLE_F,
  "Liver Disease": TABLE_D,
  // GI
  "Crohn's Disease": TABLE_C,
  "Ulcerative Colitis": TABLE_C,
  // Kidney
  "Kidney Disease (Stage 1)": STANDARD,
  "Kidney Disease (Stage 2)": TABLE_B,
  "Kidney Disease (Stage 3)": TABLE_D,
  "Kidney Disease (Stage 4)": TABLE_F,
  "Kidney Insufficiency": TABLE_D,
  // Autoimmune / neuro
  "Systemic Lupus": TABLE_D,
  "Lupus (Non-Systemic)": STANDARD,
  "Multiple Sclerosis (MS)": TABLE_D,
  "Muscular Dystrophy": TABLE_F,
  "Parkinson's": TABLE_F,
  "Myasthenia Gravis": TABLE_D,
  "Rheumatoid Arthritis": TABLE_B,
  // HIV
  "HIV": TABLE_F,
  // Past cancers (remission)
  "Past Cancer (excluding basal/squamous cell skin cancer)": TABLE_C,
  "Hodgkin's Lymphoma (Past)": TABLE_C,
  "Leukemia (Past)": TABLE_C,
  "Melanoma (Past)": TABLE_C,
  "Multiple Myeloma (Past)": TABLE_D,
  "Non-Hodgkin's Lymphoma (Past)": TABLE_C,
  "Brain Tumor (Removed, Malignant)": TABLE_C,
  "Squamous cell skin cancer": STANDARD,
  // Mental health
  "Bipolar Disorder": TABLE_C,
  "Depression": STANDARD,
  "PTSD": STANDARD,
  "Anxiety Disorder": STANDARD,
  // Substance / lifestyle
  "Alcohol Abuse / Drug Abuse": TABLE_C,
  "Rehab Facility (Substance Abuse)": TABLE_C,
  "Illegal Drug Use": TABLE_C,
  "Felony": TABLE_C,
  "DUI / DWI": STANDARD,
  // Vascular / weight-loss surgery / aneurysm corrected
  "Gastric Bypass Surgery": STANDARD,
  "Gastric Sleeve Surgery": STANDARD,
  "Lap Band Surgery": STANDARD,
  "Abdominal aortic aneurysm (Corrected)": TABLE_B,
  "Thoracic aortic aneurysm (Corrected)": TABLE_B,
  "Cerebral aneurysm (Corrected)": TABLE_B,
  // Blood pressure (uncontrolled caps; controlled is Preferred-eligible → no entry)
  "High Blood Pressure (Uncontrolled)": TABLE_B,
};

// Conditions that disqualify living-benefit riders (Transamerica p.14).
const NO_LIVING_BENEFIT = new Set<string>([
  "Alcohol Abuse / Drug Abuse", "Illegal Drug Use", "Rehab Facility (Substance Abuse)",
  "Current Cancer (excluding basal/squamous cell skin cancer)", "Chemotherapy (Current)",
  "Past Cancer (excluding basal/squamous cell skin cancer)",
  "Coronary Artery Disease (CAD)", "Heart Attack", "Coronary Artery Bypass Surgery",
  "Heart Blockage", "Clogged Arteries", "Heart Disease",
  "Diabetes (With Complications)",
  "ADLs - Activities of Daily Living (Eating, Bathing, Dressing, etc)",
  "ALS (Lou Gehrig's Disease)", "Multiple Sclerosis (MS)", "Muscular Dystrophy", "Parkinson's",
  "Stroke", "Hemorrhagic Stroke", "Transient Ischemic Attack (TIA or Mini-Stroke)",
  "Systemic Lupus",
]);

// ─── Requirements (what the client will have to complete) ──────────────────────
// Simplified from the age × face requirement grids (Transam p.7–9, NLG p.21–26).
// Captures the meaningful thresholds (accelerated/fluidless vs full exam vs APS),
// not every cell.

function transamRequirements(age: number, face: number): string[] {
  if (age >= 70) return ["Exam", "Blood", "Urine", "MVR", "Cognitive screen"];
  if (age >= 61) return ["Exam", "Blood", "Urine", "MVR"];
  // Younger ages: low/mid face may qualify fluidless (accelerated UW).
  if (face <= 1_000_000) return ["Application", "MVR", "Accelerated UW possible (fluidless)"];
  if (face <= 2_000_000 && age <= 50) return ["Application", "MVR", "Accelerated UW possible (fluidless)"];
  return ["Exam", "Blood", "Urine", "MVR"];
}

function nlgRequirements(age: number, face: number): string[] {
  if (age >= 70) return ["Exam", "Blood", "Urine", "EKG", "Senior assessment", "APS"];
  const reqs = (face <= 1_000_000 && age <= 65) ? ["Application"] : ["Exam", "Blood", "Urine"];
  // Routine APS thresholds (NLG p.8).
  const apsAt = age <= 40 ? 5_000_001 : age <= 60 ? 2_000_001 : 1_000_001;
  if (face >= apsAt) reqs.push("APS");
  return reqs;
}

// ─── The engine ────────────────────────────────────────────────────────────────

export type RatedProfile = {
  age: number;           // NaN when unknown
  heightIn: number;      // 0 when unknown
  weightLb: number;      // 0 when unknown
  tobacco: boolean;
  face: number;          // 0 when unknown
  // Optional vitals — when absent the engine assumes they pass and flags it.
  bp?: string;
  cholesterol?: string;
};

export type RatedAssessment = {
  carrier: string;
  productId: string;
  declined: boolean;
  classIndex: number;        // ladder index of the best-case class (DECLINE if declined)
  className: string;         // carrier-specific display label
  bindingConstraint: string; // what holds the class back / why declined
  requirements: string[];
  livingBenefits: boolean;   // Critical/Chronic/LTC riders available?
  pendingLabs: boolean;      // best-case assumes BP/cholesterol pass (not supplied)
  unknownConditions: string[]; // detected conditions with no published cap rule
  note?: string;             // per-product caveat (e.g. SurvivorLife is two-life)
};

export function assessProduct(
  product: RatedProduct,
  profile: RatedProfile,
  conditions: string[]
): RatedAssessment {
  const base = {
    carrier: product.carrier,
    productId: product.id,
    requirements: [] as string[],
    livingBenefits: false,
    pendingLabs: false,
    unknownConditions: [] as string[],
    note: product.note,
  };
  const declineWith = (reason: string): RatedAssessment => ({
    ...base,
    declined: true,
    classIndex: DECLINE,
    className: "Decline",
    bindingConstraint: reason,
    requirements: [],
  });

  // 1. Hard knockouts: age band, face band.
  if (!Number.isNaN(profile.age) && (profile.age < product.ageMin || profile.age > product.ageMax)) {
    return declineWith(`Age ${profile.age} is outside this product's issue ages (${product.ageMin}–${product.ageMax}).`);
  }
  if (profile.face > 0 && (profile.face < product.faceMin || profile.face > product.faceMax)) {
    const range = product.faceMax === Infinity
      ? `minimum face $${product.faceMin.toLocaleString()}`
      : `$${product.faceMin.toLocaleString()}–$${product.faceMax.toLocaleString()}`;
    return declineWith(`Requested face $${profile.face.toLocaleString()} is below/outside this product's range (${range}).`);
  }

  // 2. Condition declines + caps.
  let conditionCap = BEST;
  let conditionDriver = "";
  const unknown: string[] = [];
  for (const c of conditions) {
    const cap = CONDITION_CAP[c];
    if (cap === undefined) {
      // No published rule. Don't silently penalize — flag for review.
      unknown.push(c);
      continue;
    }
    if (cap >= DECLINE) return { ...declineWith(`${c} is an uninsurable risk for this product.`), unknownConditions: unknown };
    if (cap > conditionCap) { conditionCap = cap; conditionDriver = c; }
  }

  // 3. Build cap.
  const bmi = bmiFrom(profile.heightIn, profile.weightLb);
  const buildCap = buildClass(product, bmi, profile.age);
  if (buildCap >= DECLINE) {
    return { ...declineWith(`Build (BMI ${bmi.toFixed(1)}) is over this product's limit.`), unknownConditions: unknown };
  }

  // 4. Worst-of, then tobacco clamp (no Elite/Plus for tobacco users).
  let idx = Math.max(conditionCap, buildCap);
  const driver =
    conditionCap >= buildCap && conditionDriver
      ? `${conditionDriver} caps the class at ${LADDER[conditionCap]}.`
      : !Number.isNaN(bmi)
        ? `Build (BMI ${bmi.toFixed(1)}) caps the class at ${LADDER[buildCap]}.`
        : "No rate-class penalties detected — best class assumed.";
  let binding = driver;
  if (profile.tobacco && idx < PREFERRED) {
    idx = PREFERRED;
    binding = `Tobacco use caps the class at Preferred Tobacco.`;
  }

  // 5. Outputs.
  const requirements = product.family === "transam"
    ? transamRequirements(profile.age, profile.face)
    : nlgRequirements(profile.age, profile.face);

  const livingBenefits = idx <= TABLE_D && !conditions.some((c) => NO_LIVING_BENEFIT.has(c));

  // A preferred-tier offer hinges on BP/cholesterol the agent hasn't entered.
  const pendingLabs = idx <= PREFERRED && !profile.bp && !profile.cholesterol;

  return {
    carrier: product.carrier,
    productId: product.id,
    declined: false,
    classIndex: idx,
    className: labelFor(product.family, idx, profile.tobacco),
    bindingConstraint: binding,
    requirements,
    livingBenefits,
    pendingLabs,
    unknownConditions: unknown,
    note: product.note,
  };
}

// Assess every rated product for a client profile + detected conditions.
export function assessAllProducts(profile: RatedProfile, conditions: string[]): RatedAssessment[] {
  return RATED_PRODUCTS.map((p) => assessProduct(p, profile, conditions));
}

// The rated product display names (for the conditions/carriers API).
export function ratedCarrierNames(): string[] {
  return RATED_PRODUCTS.map((p) => p.carrier).sort((a, b) => a.localeCompare(b));
}
