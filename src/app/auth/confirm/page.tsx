import Image from "next/image";
import { Button, LinkButton } from "@/components/ui";
import { confirmOtp } from "./actions";

type SearchParams = Promise<{
  token_hash?: string;
  type?: string;
  next?: string;
}>;

/**
 * Interstitial for an emailed setup / reset link. We deliberately do NOT verify
 * the token on load — that lets background link-scanners (desktop mail clients,
 * corporate filters, safe-browsing) burn the single-use token before the human
 * clicks. Instead we render one button that POSTs to the `confirmOtp` Server
 * Action, so verification only happens on a real human press. See actions.ts.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { token_hash = "", type = "", next = "/" } = await searchParams;
  const missing = !token_hash || !type;
  const isRecovery = type === "recovery";

  const heading = isRecovery
    ? "Reset your password"
    : "Finish setting up your account";
  const blurb = isRecovery
    ? "Click below to continue to the password reset screen."
    : "You're one tap away. Click below to securely sign in and set up your account.";

  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-md rounded-2xl border border-hairline bg-card p-10">
        <div className="mb-8 text-center">
          <Image
            src="/logo.png"
            alt="All Star OS"
            width={140}
            height={79}
            priority
            className="mx-auto h-10 w-auto"
          />
          <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em]">
            {missing ? "This link is incomplete" : heading}
          </h1>
          <p className="mt-3 text-sm text-mute">
            {missing
              ? "Open the most recent email we sent you and tap the button there. If it keeps failing, ask for a new invite."
              : blurb}
          </p>
        </div>

        {missing ? (
          <LinkButton
            href="/auth/signin"
            variant="secondary"
            className="w-full py-2.5 text-center"
          >
            Go to sign in
          </LinkButton>
        ) : (
          <form action={confirmOtp}>
            <input type="hidden" name="token_hash" value={token_hash} />
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="next" value={next} />
            <Button
              type="submit"
              variant="primary"
              className="w-full py-2.5"
            >
              Continue
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
