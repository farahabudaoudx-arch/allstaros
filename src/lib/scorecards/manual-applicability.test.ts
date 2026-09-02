import { describe, expect, it } from "vitest";
import { evaluateManualApplicability } from "./manual-applicability";
import type { ManualTargetContext } from "./manual";

const PERSON_ID = "11111111-1111-4111-8111-111111111111";

function target(overrides: Partial<ManualTargetContext> = {}): ManualTargetContext {
  return {
    personId: PERSON_ID,
    fullName: "Jordan Hale",
    email: "jordan@example.com",
    photoUrl: null,
    photoReviewStatus: null,
    npn: null,
    npnStatus: null,
    npnVerifiedAt: null,
    recruitId: null,
    recruitCreatedAt: null,
    recruitRemovedAt: null,
    uplineId: null,
    activeAtPeriodEnd: true,
    producerAtPeriodEnd: true,
    builderAtPeriodEnd: false,
    depth: 0,
    ...overrides,
  };
}

describe("evaluateManualApplicability", () => {
  it("requires a person before checking", () => {
    expect(evaluateManualApplicability({
      personId: "",
      periodKind: "monthly",
      periodStart: "2026-06-01",
      today: "2026-09-03",
      personExists: false,
    })).toMatchObject({
      status: "error",
      code: "missing_person",
      message: "Choose one person before checking applicability.",
    });
  });

  it("rejects unknown people", () => {
    expect(evaluateManualApplicability({
      personId: PERSON_ID,
      periodKind: "monthly",
      periodStart: "2026-06-01",
      today: "2026-09-03",
      personExists: false,
    })).toMatchObject({
      status: "error",
      code: "person_not_found",
      message: "The selected person could not be found.",
    });
  });

  it("rejects invalid period kinds", () => {
    expect(evaluateManualApplicability({
      personId: PERSON_ID,
      periodKind: "weekly",
      periodStart: "2026-06-01",
      today: "2026-09-03",
      personExists: true,
    })).toMatchObject({
      status: "error",
      code: "invalid_period_kind",
    });
  });

  it("rejects missing period starts", () => {
    expect(evaluateManualApplicability({
      personId: PERSON_ID,
      periodKind: "monthly",
      periodStart: "",
      today: "2026-09-03",
      personExists: true,
    })).toMatchObject({
      status: "error",
      code: "missing_period_start",
      message: "Enter a valid period start date.",
    });
  });

  it("rejects non-boundary period starts with specific messages", () => {
    expect(evaluateManualApplicability({
      personId: PERSON_ID,
      periodKind: "monthly",
      periodStart: "2026-06-15",
      today: "2026-09-03",
      personExists: true,
    })).toMatchObject({
      status: "error",
      code: "invalid_period_start",
      message: "Scorecard periods must start on a calendar boundary.",
    });

    expect(evaluateManualApplicability({
      personId: PERSON_ID,
      periodKind: "quarterly",
      periodStart: "2026-02-01",
      today: "2026-09-03",
      personExists: true,
    })).toMatchObject({
      status: "error",
      code: "invalid_period_start",
      message: "Quarterly runs require an exact calendar quarter.",
    });

    expect(evaluateManualApplicability({
      personId: PERSON_ID,
      periodKind: "annual",
      periodStart: "2026-03-01",
      today: "2026-09-03",
      personExists: true,
    })).toMatchObject({
      status: "error",
      code: "invalid_period_start",
      message: "Annual runs require an exact calendar year.",
    });
  });

  it("rejects periods that are still open", () => {
    expect(evaluateManualApplicability({
      personId: PERSON_ID,
      periodKind: "monthly",
      periodStart: "2026-09-01",
      today: "2026-09-03",
      personExists: true,
    })).toMatchObject({
      status: "error",
      code: "period_not_closed",
      message: "Scorecards can only be checked for closed periods. This month ends on 2026-09-30.",
    });
  });

  it("asks the caller to load target after a closed period validates", () => {
    expect(evaluateManualApplicability({
      personId: PERSON_ID,
      periodKind: "monthly",
      periodStart: "2026-06-01",
      today: "2026-09-03",
      personExists: true,
      target: undefined,
    })).toMatchObject({
      status: "needs_target",
      period: {
        kind: "monthly",
        start: "2026-06-01",
        end: "2026-06-30",
        label: "June 2026",
      },
    });
  });

  it("rejects missing historical role facts", () => {
    expect(evaluateManualApplicability({
      personId: PERSON_ID,
      periodKind: "monthly",
      periodStart: "2026-06-01",
      today: "2026-09-03",
      personExists: true,
      target: null,
    })).toMatchObject({
      status: "error",
      code: "no_role_fact",
      message: "No historical period-end role fact exists for this person on 2026-06-30.",
    });
  });

  it("rejects inactive period-end people", () => {
    expect(evaluateManualApplicability({
      personId: PERSON_ID,
      periodKind: "monthly",
      periodStart: "2026-06-01",
      today: "2026-09-03",
      personExists: true,
      target: target({ activeAtPeriodEnd: false, producerAtPeriodEnd: true }),
    })).toMatchObject({
      status: "error",
      code: "inactive_at_period_end",
      message: "Jordan Hale was inactive at period end (June 2026), so no Scorecard applies.",
    });
  });

  it("rejects active people with neither Producer nor Builder role", () => {
    expect(evaluateManualApplicability({
      personId: PERSON_ID,
      periodKind: "monthly",
      periodStart: "2026-06-01",
      today: "2026-09-03",
      personExists: true,
      target: target({ producerAtPeriodEnd: false, builderAtPeriodEnd: false }),
    })).toMatchObject({
      status: "error",
      code: "no_applicable_card",
      message: "Jordan Hale was active at period end but was neither a Producer nor a Builder, so no Scorecard applies.",
    });
  });

  it("returns applicable card types on success", () => {
    expect(evaluateManualApplicability({
      personId: PERSON_ID,
      periodKind: "monthly",
      periodStart: "2026-06-01",
      today: "2026-09-03",
      personExists: true,
      target: target({ producerAtPeriodEnd: true, builderAtPeriodEnd: true }),
    })).toMatchObject({
      status: "ok",
      applicableCardTypes: ["producer", "builder"],
      period: {
        kind: "monthly",
        start: "2026-06-01",
        end: "2026-06-30",
        label: "June 2026",
      },
    });
  });
});
