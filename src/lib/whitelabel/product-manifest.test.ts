import manifest from "../../../config/whitelabel-customer-migrations.json";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CLEAN_CUSTOMER_MIGRATIONS } from "./provisioning/clean-schema";
import { CURRENT_CUSTOMER_SCHEMA_RELEASE } from "./verification";

describe("versioned Whitelabel product manifest", () => {
  it("matches the customer migration runtime contract exactly", () => {
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.customerMigrations).toEqual([...CLEAN_CUSTOMER_MIGRATIONS]);
    expect(manifest.schemaRelease).toBe(CURRENT_CUSTOMER_SCHEMA_RELEASE);
    expect(manifest.schemaRelease).toBe(
      manifest.customerMigrations.at(-1)?.replace(/\.sql$/, ""),
    );
  });
});
