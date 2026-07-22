import { describe, it, expect } from "vitest";
import {
  PHOTO_REVIEW_STATUSES,
  isPhotoReviewStatus,
} from "./status";

describe("PHOTO_REVIEW_STATUSES", () => {
  it("is exactly pending, approved, rejected in that order", () => {
    expect(PHOTO_REVIEW_STATUSES).toEqual([
      "pending",
      "approved",
      "rejected",
    ]);
  });
});

describe("isPhotoReviewStatus", () => {
  it("accepts the three valid statuses", () => {
    expect(isPhotoReviewStatus("pending")).toBe(true);
    expect(isPhotoReviewStatus("approved")).toBe(true);
    expect(isPhotoReviewStatus("rejected")).toBe(true);
  });

  it("rejects anything else, including null and account statuses", () => {
    expect(isPhotoReviewStatus("active")).toBe(false);
    expect(isPhotoReviewStatus("removed")).toBe(false);
    expect(isPhotoReviewStatus("")).toBe(false);
    expect(isPhotoReviewStatus("Approved")).toBe(false);
    expect(isPhotoReviewStatus(null)).toBe(false);
    expect(isPhotoReviewStatus(undefined)).toBe(false);
    expect(isPhotoReviewStatus(3)).toBe(false);
  });
});
