import type { ManualTargetContext } from "./manual";
import { scorecardPeriodFromStart, validateClosedScorecardPeriod, type ScorecardPeriod } from "./period";
import type { ScorecardPeriodKind } from "./run";

export type ManualApplicableCardType = "producer" | "builder";

export type ManualApplicabilityErrorCode =
  | "missing_person"
  | "person_not_found"
  | "missing_period_start"
  | "invalid_period_kind"
  | "invalid_period_start"
  | "period_not_closed"
  | "no_role_fact"
  | "inactive_at_period_end"
  | "no_applicable_card";

export type ManualApplicabilityResult =
  | {
      status: "ok";
      period: ScorecardPeriod;
      target: ManualTargetContext;
      applicableCardTypes: ManualApplicableCardType[];
    }
  | {
      status: "needs_target";
      period: ScorecardPeriod;
    }
  | {
      status: "error";
      code: ManualApplicabilityErrorCode;
      message: string;
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function periodUnit(kind: ScorecardPeriodKind): "month" | "quarter" | "year" {
  if (kind === "quarterly") return "quarter";
  if (kind === "annual") return "year";
  return "month";
}

function periodNotClosedMessage(period: ScorecardPeriod): string {
  return `Scorecards can only be checked for closed periods. This ${periodUnit(period.kind)} ends on ${period.end}.`;
}

export function evaluateManualApplicability(input: {
  personId?: string | null;
  periodKind?: string | null;
  periodStart?: string | null;
  today: string;
  /** Whether the personId exists in the people directory. Ignored when personId is empty. */
  personExists?: boolean;
  /**
   * `undefined` = target not loaded yet (period-only check).
   * `null` = loaded, no depth-0 historical fact.
   */
  target?: ManualTargetContext | null;
}): ManualApplicabilityResult {
  const personId = (input.personId ?? "").trim();
  const periodKindRaw = (input.periodKind ?? "").trim();
  const periodStart = (input.periodStart ?? "").trim();

  if (!personId) {
    return {
      status: "error",
      code: "missing_person",
      message: "Choose one person before checking applicability.",
    };
  }
  if (!UUID.test(personId) || input.personExists === false) {
    return {
      status: "error",
      code: "person_not_found",
      message: "The selected person could not be found.",
    };
  }

  if (!periodKindRaw || !["monthly", "quarterly", "annual"].includes(periodKindRaw)) {
    return {
      status: "error",
      code: "invalid_period_kind",
      message: "Choose a valid period type (Monthly, Quarterly, or Annual).",
    };
  }
  const periodKind = periodKindRaw as ScorecardPeriodKind;

  if (!periodStart) {
    return {
      status: "error",
      code: "missing_period_start",
      message: "Enter a valid period start date.",
    };
  }

  let period: ScorecardPeriod;
  try {
    period = scorecardPeriodFromStart(periodKind, periodStart);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enter a valid period start date.";
    if (message === "Enter a valid ISO Scorecard period start date.") {
      return {
        status: "error",
        code: "invalid_period_start",
        message: "Enter a valid period start date.",
      };
    }
    return {
      status: "error",
      code: "invalid_period_start",
      message,
    };
  }

  try {
    period = validateClosedScorecardPeriod({
      kind: period.kind,
      start: period.start,
      end: period.end,
      today: input.today,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Choose a valid closed Scorecard period.";
    if (message === "Scorecard runs can only start after the period is closed.") {
      return {
        status: "error",
        code: "period_not_closed",
        message: periodNotClosedMessage(period),
      };
    }
    return {
      status: "error",
      code: "invalid_period_start",
      message,
    };
  }

  if (input.target === undefined) {
    return { status: "needs_target", period };
  }

  const target = input.target;
  if (!target) {
    return {
      status: "error",
      code: "no_role_fact",
      message: `No historical period-end role fact exists for this person on ${period.end}.`,
    };
  }

  if (!target.activeAtPeriodEnd) {
    return {
      status: "error",
      code: "inactive_at_period_end",
      message: `${target.fullName || "This person"} was inactive at period end (${period.label}), so no Scorecard applies.`,
    };
  }

  const applicableCardTypes: ManualApplicableCardType[] = [
    ...(target.producerAtPeriodEnd ? (["producer"] as const) : []),
    ...(target.builderAtPeriodEnd ? (["builder"] as const) : []),
  ];

  if (applicableCardTypes.length === 0) {
    return {
      status: "error",
      code: "no_applicable_card",
      message: `${target.fullName || "This person"} was active at period end but was neither a Producer nor a Builder, so no Scorecard applies.`,
    };
  }

  return {
    status: "ok",
    period,
    target,
    applicableCardTypes,
  };
}
