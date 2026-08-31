import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const actions = readFileSync(join(process.cwd(), "src/lib/actions/scorecards.ts"), "utf8");
const manualService = readFileSync(join(process.cwd(), "src/lib/scorecards/manual.ts"), "utf8");
const manualAction = actions.slice(actions.indexOf("export async function generateManualScorecard"));

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
});