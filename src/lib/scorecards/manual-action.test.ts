import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const actions = readFileSync(join(process.cwd(), "src/lib/actions/scorecards.ts"), "utf8");
const manualService = readFileSync(join(process.cwd(), "src/lib/scorecards/manual.ts"), "utf8");
const manualAction = actions.slice(actions.indexOf("export async function generateManualScorecard"));
const correctionAction = actions.slice(actions.indexOf("export async function correctPublishedScorecard"));

describe("manual Scorecard server-action boundary", () => {
  it("requires canonical admin authorization before invoking the manual generation service", () => {
    const auth = manualAction.indexOf("await requireAdmin()");
    const invoke = manualAction.indexOf("generateManualScorecardService({");
    expect(auth).toBeGreaterThanOrEqual(0);
    expect(invoke).toBeGreaterThan(auth);
  });

  it("revalidates person identity, card type, and canonical closed period server-side", () => {
    expect(manualAction).toContain("UUID.test(personId)");
    expect(manualAction).toContain('cardType !== "producer" && cardType !== "builder"');
    expect(manualAction).toContain("scorecardPeriodFromStart");
    expect(manualAction).toContain("validateClosedScorecardPeriod");
  });

  it("does not send email directly from the manual action or service", () => {
    expect(manualAction).not.toMatch(/sendEmail\s*\(|resend/i);
    expect(manualService).not.toMatch(/sendEmail\s*\(|resend/i);
    expect(manualService).toContain('service.rpc("publish_manual_scorecard"');
  });


  it("requires canonical admin authorization and validates the correction selection before service invocation", () => {
    const auth = correctionAction.indexOf("await requireAdmin()");
    const uuid = correctionAction.indexOf("UUID.test(snapshotId)");
    const reason = correctionAction.indexOf("correctionReason.length < 5 || correctionReason.length > 500");
    const invoke = correctionAction.indexOf("generateScorecardCorrectionService({");
    expect(auth).toBeGreaterThanOrEqual(0);
    expect(uuid).toBeGreaterThan(auth);
    expect(reason).toBeGreaterThan(uuid);
    expect(invoke).toBeGreaterThan(reason);
  });

  it("keeps correction outcomes explicit and refreshes both admin and member archives", () => {
    expect(correctionAction).toContain('result.status === "success" || result.status === "existing"');
    expect(correctionAction).toContain('result.status === "no_changes"');
    expect(correctionAction).toContain('revalidatePath("/admin/scorecards")');
    expect(correctionAction).toContain('revalidatePath("/producer/scorecards")');
    expect(correctionAction).toContain('correctionError: "message" in result ? result.message');
  });
});
