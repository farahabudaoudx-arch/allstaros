import { describe, it, expect } from "vitest";
import { initialsFor } from "./initials";

describe("initialsFor", () => {
  it("takes first letter of first and last name, uppercased", () => {
    expect(initialsFor("Jane Doe")).toBe("JD");
    expect(initialsFor("jane doe")).toBe("JD");
  });

  it("uses first and LAST word when there are middle names", () => {
    expect(initialsFor("Jane Q Public")).toBe("JP");
  });

  it("returns a single letter for a one-word name", () => {
    expect(initialsFor("Cher")).toBe("C");
  });

  it("collapses extra whitespace", () => {
    expect(initialsFor("  Jane   Doe  ")).toBe("JD");
  });

  it("falls back to ? for empty or blank input", () => {
    expect(initialsFor("")).toBe("?");
    expect(initialsFor("   ")).toBe("?");
  });
});
