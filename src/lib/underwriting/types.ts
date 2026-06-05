export type Toolkit = "FEX" | "SIUL";

// "Unknown" = the carrier hasn't published a clear rule for this condition.
// Surface it explicitly instead of defaulting to Approved so the agent knows
// to research rather than assume.
export type Outcome = "Approved" | "Graded" | "Decline" | "Conditional" | "Unknown";

export type CarrierCell = {
  outcome: Outcome;
  rawInfo: string;
};

export type ConditionResult = {
  condition: string;
  category: string;
  carriers: Record<string, CarrierCell>;
};

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResponse = {
  aiMessage: string;
  extractedConditions: string[];
  timings: Record<string, string>;
  severity: Record<string, string>;
  medications: string[];
  carrierResults: ConditionResult[];
};
