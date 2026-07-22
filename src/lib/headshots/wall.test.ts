import { describe, it, expect } from "vitest";
import { isPhotoRequired, isBehindHeadshotWall } from "./wall";

const base = { is_builder: false, is_producer: false, photo_review_status: null as string | null };

describe("isPhotoRequired", () => {
  it("is true for builders and producers", () => {
    expect(isPhotoRequired({ ...base, is_producer: true })).toBe(true);
    expect(isPhotoRequired({ ...base, is_builder: true })).toBe(true);
  });
  it("is false for a pure recruit (neither builder nor producer)", () => {
    expect(isPhotoRequired({ ...base })).toBe(false);
  });
});

describe("isBehindHeadshotWall", () => {
  it("walls a required person with no photo", () => {
    expect(isBehindHeadshotWall({ ...base, is_producer: true, photo_review_status: null })).toBe(true);
  });
  it("walls a required person whose photo was rejected", () => {
    expect(isBehindHeadshotWall({ ...base, is_producer: true, photo_review_status: "rejected" })).toBe(true);
  });
  it("lets a required person in once they have uploaded (pending) or are approved", () => {
    expect(isBehindHeadshotWall({ ...base, is_producer: true, photo_review_status: "pending" })).toBe(false);
    expect(isBehindHeadshotWall({ ...base, is_producer: true, photo_review_status: "approved" })).toBe(false);
  });
  it("never walls someone who is not required (a recruit), whatever their photo state", () => {
    expect(isBehindHeadshotWall({ ...base, photo_review_status: null })).toBe(false);
    expect(isBehindHeadshotWall({ ...base, photo_review_status: "rejected" })).toBe(false);
  });
});
