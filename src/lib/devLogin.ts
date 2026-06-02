import accounts from "./devAccounts.json";

/**
 * Dev-only "sign in as" bypass. Lets you jump between the recruit / producer /
 * builder versions of the app without the magic-link round-trip.
 *
 * HARD-GATED: only active when DEV_LOGIN_ENABLED=true *and* not in production.
 * The seeded accounts and shared password must never exist in a real env.
 */
export const DEV_LOGIN_ENABLED =
  process.env.NODE_ENV !== "production" &&
  process.env.DEV_LOGIN_ENABLED === "true";

export const DEV_LOGIN_PASSWORD =
  process.env.DEV_LOGIN_PASSWORD ?? "allstar-dev-login";

export type DevRole = "builder" | "producer" | "recruit";

export type DevAccount = {
  role: DevRole;
  email: string;
  fullName: string;
  is_builder: boolean;
  is_producer: boolean;
  label: string;
  description: string;
};

export const DEV_ACCOUNTS = accounts as DevAccount[];

export function devAccountByRole(role: string): DevAccount | undefined {
  return DEV_ACCOUNTS.find((a) => a.role === role);
}
