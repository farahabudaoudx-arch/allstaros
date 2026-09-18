import { describe, expect, it } from "vitest";

import {
  assertLocalWhitelabelMutationTarget,
  assertRemoteWhitelabelMutationAllowed,
} from "./environment-safety";

describe("Whitelabel environment safety", () => {
  it("allows explicitly classified local control/customer targets", () => {
    expect(() => assertLocalWhitelabelMutationTarget({
      projectRef: "local-control",
      role: "control-plane-local",
      operation: "SQL mutation",
    })).not.toThrow();
    expect(() => assertLocalWhitelabelMutationTarget({
      projectRef: "local-customer-a",
      role: "customer-local",
      operation: "SQL mutation",
    })).not.toThrow();
  });

  it("rejects a local control-plane project when a customer target is required", () => {
    expect(() => assertLocalWhitelabelMutationTarget({
      projectRef: "local-control",
      role: "control-plane-local",
      expectedRole: "customer-local",
      operation: "customer SQL mutation",
    })).toThrow(/expected customer-local/i);
  });

  it("blocks all remote provider mutation while local-only mode is enabled", () => {
    expect(() => assertRemoteWhitelabelMutationAllowed({
      provider: "supabase",
      projectRef: "remote-customer",
      operation: "SQL mutation",
      env: { WHITELABEL_LOCAL_ONLY: "1" },
    })).toThrow(/remote supabase mutations are disabled/i);
  });

  it("blocks explicitly protected dev Preview and production refs", () => {
    expect(() => assertRemoteWhitelabelMutationAllowed({
      provider: "supabase",
      projectRef: "preview-ref",
      operation: "SQL mutation",
      env: { WHITELABEL_DEV_PREVIEW_SUPABASE_PROJECT_REF: "preview-ref" },
    })).toThrow(/protected/i);

    expect(() => assertRemoteWhitelabelMutationAllowed({
      provider: "vercel",
      projectRef: "prod-project",
      operation: "deployment",
      env: { WHITELABEL_PRODUCTION_VERCEL_PROJECT_REF: "prod-project" },
    })).toThrow(/protected/i);
  });

  it("allows an unprotected remote customer target outside local-only mode", () => {
    expect(() => assertRemoteWhitelabelMutationAllowed({
      provider: "supabase",
      projectRef: "customer-ref",
      operation: "SQL mutation",
      env: {},
    })).not.toThrow();
  });
});
