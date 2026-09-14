import { afterEach, describe, expect, it } from "vitest";
import { backupAppOrigin, flaggedAppHost, marketingHosts } from "./routing";

const original = { ...process.env };

afterEach(() => {
  for (const key of ["MARKETING_HOSTS", "FLAGGED_APP_HOST", "BACKUP_APP_ORIGIN"]) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe("installation routing", () => {
  it("preserves current All Star routing defaults", () => {
    delete process.env.MARKETING_HOSTS;
    delete process.env.FLAGGED_APP_HOST;
    delete process.env.BACKUP_APP_ORIGIN;
    expect(marketingHosts()).toEqual(new Set(["allstarlifegroup.com", "www.allstarlifegroup.com", "marketing.localhost"]));
    expect(flaggedAppHost()).toBe("app.allstarlifegroup.com");
    expect(backupAppOrigin()).toBe("https://all-star-agency.vercel.app");
  });

  it("accepts customer host configuration without database access", () => {
    process.env.MARKETING_HOSTS = "agency.test, www.agency.test";
    process.env.FLAGGED_APP_HOST = "app.agency.test";
    process.env.BACKUP_APP_ORIGIN = "https://agency-backup.vercel.app/some/path";
    expect(marketingHosts()).toEqual(new Set(["agency.test", "www.agency.test"]));
    expect(flaggedAppHost()).toBe("app.agency.test");
    expect(backupAppOrigin()).toBe("https://agency-backup.vercel.app");
  });

  it("can disable the temporary flagged-host redirect and rejects unsafe backup origins", () => {
    process.env.FLAGGED_APP_HOST = "";
    process.env.BACKUP_APP_ORIGIN = "http://unsafe.example.com";
    expect(flaggedAppHost()).toBeNull();
    expect(backupAppOrigin()).toBeNull();
  });
});
