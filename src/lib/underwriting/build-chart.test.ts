import { describe, it, expect } from "vitest";
import { parseHeightInches, parseWeightLbs, classifyBuild } from "./build-chart";

describe("parseHeightInches", () => {
  it("parses feet-inches notations to total inches", () => {
    expect(parseHeightInches("5'8\"")).toBe(68);
    expect(parseHeightInches("5'8")).toBe(68);
    expect(parseHeightInches("5 ft 8 in")).toBe(68);
    expect(parseHeightInches("5ft8")).toBe(68);
    expect(parseHeightInches("5'10")).toBe(70);
  });

  it("parses two bare numbers as feet + inches", () => {
    expect(parseHeightInches("5 8")).toBe(68);
  });

  it("reads a single number in the inches range as inches", () => {
    expect(parseHeightInches("68")).toBe(68);
    expect(parseHeightInches("68in")).toBe(68);
  });

  it("reads a small single number as whole feet", () => {
    expect(parseHeightInches("6")).toBe(72);
  });

  it("returns null for unparseable input", () => {
    expect(parseHeightInches("")).toBeNull();
    expect(parseHeightInches("tall")).toBeNull();
  });
});

describe("parseWeightLbs", () => {
  it("extracts the weight number from common notations", () => {
    expect(parseWeightLbs("180 lbs")).toBe(180);
    expect(parseWeightLbs("180")).toBe(180);
    expect(parseWeightLbs("180lb")).toBe(180);
  });

  it("returns null when no positive number is present", () => {
    expect(parseWeightLbs("")).toBeNull();
    expect(parseWeightLbs("none")).toBeNull();
  });
});

describe("classifyBuild — build knockout (a wrong band = wrong carrier eligibility)", () => {
  // At 5'8" (68") the chart cutoffs are thin=115, immediate=290, borderline=305.
  it("classifies the four bands with correct (inclusive) boundary handling", () => {
    expect(classifyBuild("5'8", "100")!.status).toBe("TooThin"); // below thin
    expect(classifyBuild("5'8", "115")!.status).toBe("Immediate"); // == thin (inclusive)
    expect(classifyBuild("5'8", "180")!.status).toBe("Immediate");
    expect(classifyBuild("5'8", "290")!.status).toBe("Immediate"); // == immediate (inclusive)
    expect(classifyBuild("5'8", "291")!.status).toBe("Borderline"); // just over immediate
    expect(classifyBuild("5'8", "305")!.status).toBe("Borderline"); // == borderline (inclusive)
    expect(classifyBuild("5'8", "306")!.status).toBe("OverLimit"); // over borderline
  });

  it("exposes the band cutoffs that applied", () => {
    expect(classifyBuild("5'8", "180")).toMatchObject({
      thin: 115,
      immediate: 290,
      borderline: 305,
      weight: 180,
    });
  });

  it("clamps off-chart heights to the nearest row and flags offChart", () => {
    const tall = classifyBuild("7'0", "200")!; // 84" clamps to the 81" max row
    expect(tall.offChart).toBe(true);
    expect(tall.rowInches).toBe(81);
  });

  it("returns null when either field is unparseable (caller hides the indicator)", () => {
    expect(classifyBuild("", "180")).toBeNull();
    expect(classifyBuild("5'8", "")).toBeNull();
  });
});
