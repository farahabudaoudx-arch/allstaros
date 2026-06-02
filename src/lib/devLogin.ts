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

/**
 * Secret-link bypass for the *deployed* site. Production hard-disables
 * DEV_LOGIN_ENABLED, so the only way to reach the "sign in as" screen on Vercel
 * is to arrive with ?key=<DEV_LOGIN_SECRET>. The secret is a long random string
 * set as an env var — leave it unset to keep the door fully closed.
 */
export const DEV_LOGIN_SECRET = process.env.DEV_LOGIN_SECRET ?? "";

/**
 * True when dev login should be allowed for this request: either we're local
 * (DEV_LOGIN_ENABLED) or the caller presented the correct secret key. An unset
 * secret never authorizes — a blank key can't match a blank secret.
 */
export function devLoginAuthorized(key: string | null | undefined): boolean {
  if (DEV_LOGIN_ENABLED) return true;
  return DEV_LOGIN_SECRET.length > 0 && key === DEV_LOGIN_SECRET;
}

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
