"use server";

export type SignUpInput = {
  code: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
};

export type SignUpResult = { ok: true } | { ok: false; error: string };

/**
 * Public self-serve signup is DISABLED.
 *
 * Accounts are created only by a builder's email invite — see
 * `inviteRecruitByEmail` in `actions/recruits.ts`, which mints a one-time setup
 * link and lands the recruit on `/welcome`. This function is kept as a
 * fail-closed stub so any lingering caller (the legacy `/join` wizard) refuses
 * instead of creating an account.
 */
export async function signUpViaReferral(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for the call signature; the body intentionally ignores input.
  input: SignUpInput,
): Promise<SignUpResult> {
  return {
    ok: false,
    error: "Signups are invite-only. Ask your upline to send you an invite.",
  };
}
