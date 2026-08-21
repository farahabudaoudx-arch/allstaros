export type ProducerQueryPhase =
  | "tracker"
  | "clients"
  | "deposits"
  | "lead_purchases"
  | "people"
  | "leaderboard_aggregates"
  | "unread";

/** Tagged Error thrown from metrics query failures so routes can tag Sentry. */
export class ProducerQueryError extends Error {
  readonly queryPhase: ProducerQueryPhase;

  constructor(message: string, queryPhase: ProducerQueryPhase) {
    super(message);
    this.name = "ProducerQueryError";
    this.queryPhase = queryPhase;
  }
}
