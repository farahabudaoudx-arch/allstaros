import { describe, it, expect } from "vitest";
import {
  assessProduct,
  assessAllProducts,
  transamBuildClass,
  nlgBuildClass,
  bmiFrom,
  labelFor,
  CONDITION_CAP,
  RATED_PRODUCTS,
  LADDER,
  DECLINE,
} from "./iul-rated";
import { getConditionsForToolkit } from "./data";

const ffiul = RATED_PRODUCTS.find((p) => p.id === "ffiul2")!;
const summit = RATED_PRODUCTS.find((p) => p.id === "summitlife")!;

// A healthy 45-year-old, 5'10" / 175 lb (BMI ~25), non-tobacco, $500k.
const healthy = { age: 45, heightIn: 70, weightLb: 175, tobacco: false, face: 500_000 };

describe("build → class", () => {
  it("BMI 25 earns the best class on both carrier tables", () => {
    expect(transamBuildClass(25, 45)).toBe(0); // Preferred Elite / Elite
    expect(nlgBuildClass(25)).toBe(0);
  });
  it("declines an off-the-chart BMI", () => {
    expect(transamBuildClass(48, 45)).toBe(DECLINE);
    expect(nlgBuildClass(48)).toBe(DECLINE);
  });
  it("steps down through tables as BMI climbs (Transamerica p.13)", () => {
    expect(transamBuildClass(33, 45)).toBe(4);  // Standard
    expect(transamBuildClass(36, 45)).toBe(5);  // Table A
    expect(transamBuildClass(40, 45)).toBe(7);  // Table C
  });
  it("bmiFrom matches the standard formula", () => {
    expect(Math.round(bmiFrom(70, 175))).toBe(25);
  });
});

describe("assessProduct — happy path", () => {
  it("a healthy applicant gets the best class, no conditions", () => {
    const a = assessProduct(ffiul, healthy, []);
    expect(a.declined).toBe(false);
    expect(a.classIndex).toBe(0);
    expect(a.className).toBe("Preferred Elite");
    expect(a.livingBenefits).toBe(true);
  });

  it("flags pending labs when a preferred tier is claimed without BP/cholesterol", () => {
    expect(assessProduct(ffiul, healthy, []).pendingLabs).toBe(true);
    const withLabs = assessProduct(ffiul, { ...healthy, bp: "120/80", cholesterol: "180" }, []);
    expect(withLabs.pendingLabs).toBe(false);
  });
});

describe("condition caps & worst-of", () => {
  it("a single condition caps the class to its ceiling", () => {
    const a = assessProduct(ffiul, healthy, ["Atrial Fibrillation (AFIB)"]);
    expect(LADDER[a.classIndex]).toBe("Table B");
    expect(a.bindingConstraint).toMatch(/Atrial Fibrillation/);
  });

  it("takes the worst cap across multiple conditions", () => {
    const a = assessProduct(ffiul, healthy, [
      "Sleep Apnea (not requiring oxygen use)", // Standard
      "Coronary Artery Disease (CAD)",          // Table D (worst)
    ]);
    expect(LADDER[a.classIndex]).toBe("Table D");
    expect(a.bindingConstraint).toMatch(/Coronary Artery Disease/);
  });

  it("build can be the binding constraint over a milder condition", () => {
    // BMI ~37 → Table A on Transam, worse than mild asthma (Standard).
    const a = assessProduct(ffiul, { ...healthy, weightLb: 258 }, ["Asthma (Mild)"]);
    expect(a.bindingConstraint).toMatch(/Build/);
  });

  it("an uninsurable condition declines the product", () => {
    const a = assessProduct(ffiul, healthy, ["ALS (Lou Gehrig's Disease)"]);
    expect(a.declined).toBe(true);
    expect(a.bindingConstraint).toMatch(/uninsurable/);
  });

  it("flags an unrecognized condition instead of silently penalizing it", () => {
    const a = assessProduct(ffiul, healthy, ["Allergies"]);
    expect(a.unknownConditions).toContain("Allergies");
    expect(a.classIndex).toBe(0); // no penalty applied
  });
});

describe("knockouts", () => {
  it("declines under the product's minimum face", () => {
    const a = assessProduct(summit, { ...healthy, face: 500_000 }, []); // SummitLife min $1M
    expect(a.declined).toBe(true);
    expect(a.bindingConstraint).toMatch(/minimum face/i);
  });
  it("declines outside the issue-age band", () => {
    const a = assessProduct(summit, { ...healthy, age: 90 }, []);
    expect(a.declined).toBe(true);
    expect(a.bindingConstraint).toMatch(/issue ages/);
  });
});

describe("tobacco clamp", () => {
  it("a tobacco user cannot beat Preferred Tobacco", () => {
    const a = assessProduct(ffiul, { ...healthy, tobacco: true }, []);
    expect(a.classIndex).toBe(2); // Preferred
    expect(a.className).toBe("Preferred Tobacco");
    expect(a.bindingConstraint).toMatch(/Tobacco/);
  });
});

describe("living-benefit riders", () => {
  it("are withdrawn for an excluded condition even at a fine class", () => {
    const a = assessProduct(ffiul, healthy, ["Multiple Sclerosis (MS)"]);
    expect(a.declined).toBe(false);
    expect(a.livingBenefits).toBe(false);
  });
});

describe("requirements", () => {
  it("escalates to a full workup at older ages", () => {
    const young = assessProduct(ffiul, { ...healthy, age: 40, face: 500_000 }, []);
    expect(young.requirements.join(" ")).toMatch(/Accelerated|Application/);
    const old = assessProduct(ffiul, { ...healthy, age: 72 }, []);
    expect(old.requirements).toContain("Exam");
    expect(old.requirements).toContain("Cognitive screen");
  });
});

describe("label mapping", () => {
  it("maps the ladder to carrier-specific labels", () => {
    expect(labelFor("transam", 0, false)).toBe("Preferred Elite");
    expect(labelFor("nlg", 0, false)).toBe("Elite");
    expect(labelFor("transam", 4, true)).toBe("Tobacco");
    expect(labelFor("nlg", 4, true)).toBe("Standard Tobacco");
    expect(labelFor("transam", DECLINE, false)).toBe("Decline");
  });
});

describe("data integrity", () => {
  it("every CONDITION_CAP key is a real canonical condition", () => {
    const canonical = new Set(getConditionsForToolkit("FEX").map((c) => c.condition));
    for (const key of Object.keys(CONDITION_CAP)) {
      expect(canonical.has(key), `unknown condition key: ${key}`).toBe(true);
    }
  });
  it("assessAllProducts returns one assessment per rated product", () => {
    expect(assessAllProducts(healthy, [])).toHaveLength(RATED_PRODUCTS.length);
  });
  it("SurvivorLife carries its two-life note (even when declined)", () => {
    const survivor = RATED_PRODUCTS.find((p) => p.id === "survivorlife")!;
    const issued = assessProduct(survivor, healthy, []);
    expect(issued.note).toMatch(/two lives|partner/i);
    const declined = assessProduct(survivor, { ...healthy, face: 100_000 }, []); // under $250k min
    expect(declined.declined).toBe(true);
    expect(declined.note).toMatch(/two lives|partner/i);
  });
});
