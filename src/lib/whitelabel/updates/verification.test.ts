import { describe, expect, it } from "vitest";
import { buildCompatibilityVerification, buildPostUpdateVerification } from "./verification";

describe("Ticket 6 operational verification builders", () => {
  it("requires exact post-update live source/schema and complete release markers", () => {
    const verification = buildPostUpdateVerification({
      liveVersion: {
        ok: false,
        summary: "schema mismatch",
        evidence: { osUrl: "https://customer.example", expectedSha: "b".repeat(40), actualSha: "b".repeat(40), expectedSchema: "schema-2", actualSchema: "schema-1" },
      },
      expectedMigrationNames: ["one.sql", "two.sql"],
      actualMigrationNames: ["one.sql"],
    });
    expect(verification.kind).toBe("post_update");
    expect(verification.items.map((item) => item.status)).toEqual(["failed", "failed"]);
  });

  it("blocks automatic rejoin on unknown source/schema/markers or changed provider refs", () => {
    const blocked = buildCompatibilityVerification({
      liveSourceSha: "c".repeat(40),
      liveSchemaRelease: "custom-schema",
      knownSourceShas: ["a".repeat(40)],
      knownSchemaReleases: ["schema-1"],
      actualMigrationNames: ["one.sql", "customer-hotfix.sql"],
      knownMigrationNames: ["one.sql"],
      providerRefsMatch: false,
    });
    expect(blocked.compatible).toBe(false);
    expect(blocked.items.filter((item) => item.status === "failed").map((item) => item.checkKey)).toEqual([
      "known-source",
      "known-schema",
      "migration-drift",
      "provider-refs",
    ]);

    const compatible = buildCompatibilityVerification({
      liveSourceSha: "a".repeat(40),
      liveSchemaRelease: "schema-1",
      knownSourceShas: ["a".repeat(40)],
      knownSchemaReleases: ["schema-1"],
      actualMigrationNames: ["one.sql", "__whitelabel_clean_customer_data_v1__"],
      knownMigrationNames: ["one.sql"],
      providerRefsMatch: true,
    });
    expect(compatible.compatible).toBe(true);
  });
});
