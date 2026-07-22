import { describe, it, expect } from "vitest";
import {
  HEADSHOT_BUCKET,
  MAX_HEADSHOT_BYTES,
  ALLOWED_HEADSHOT_TYPES,
  headshotObjectKey,
  headshotStoragePath,
  validateHeadshotUpload,
} from "./upload";

describe("headshotObjectKey / headshotStoragePath", () => {
  it("keys the object by person id inside the bucket", () => {
    expect(headshotObjectKey("abc-123")).toBe("abc-123.jpg");
    expect(headshotStoragePath("abc-123")).toBe(`${HEADSHOT_BUCKET}/abc-123.jpg`);
  });
});

describe("validateHeadshotUpload", () => {
  it("accepts a normal jpeg/png/webp under the size cap", () => {
    expect(validateHeadshotUpload({ type: "image/jpeg", size: 100_000 }).ok).toBe(true);
    expect(validateHeadshotUpload({ type: "image/png", size: 100_000 }).ok).toBe(true);
    expect(validateHeadshotUpload({ type: "image/webp", size: 100_000 }).ok).toBe(true);
    expect(ALLOWED_HEADSHOT_TYPES.has("image/jpeg")).toBe(true);
  });

  it("rejects a non-image type", () => {
    const r = validateHeadshotUpload({ type: "application/pdf", size: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/image/i);
  });

  it("rejects an empty file", () => {
    const r = validateHeadshotUpload({ type: "image/jpeg", size: 0 });
    expect(r.ok).toBe(false);
  });

  it("rejects a file over the size cap", () => {
    const r = validateHeadshotUpload({ type: "image/jpeg", size: MAX_HEADSHOT_BYTES + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/large|big|size/i);
  });
});
