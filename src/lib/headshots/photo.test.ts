import { describe, it, expect } from "vitest";
import { approvedPhotoUrl } from "./photo";

describe("approvedPhotoUrl", () => {
  it("returns the url only when the review status is approved", () => {
    expect(
      approvedPhotoUrl({ photo_url: "http://x/a.jpg", photo_review_status: "approved" }),
    ).toBe("http://x/a.jpg");
  });

  it("returns null while pending or rejected (revert to initials)", () => {
    expect(
      approvedPhotoUrl({ photo_url: "http://x/a.jpg", photo_review_status: "pending" }),
    ).toBeNull();
    expect(
      approvedPhotoUrl({ photo_url: "http://x/a.jpg", photo_review_status: "rejected" }),
    ).toBeNull();
  });

  it("returns null when there is no photo url or no status", () => {
    expect(approvedPhotoUrl({ photo_url: null, photo_review_status: "approved" })).toBeNull();
    expect(approvedPhotoUrl({ photo_url: "http://x/a.jpg", photo_review_status: null })).toBeNull();
    expect(approvedPhotoUrl({ photo_url: null, photo_review_status: null })).toBeNull();
  });
});
