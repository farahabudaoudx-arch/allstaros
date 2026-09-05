import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { completeGatewayDevelopmentConnection } from "@/lib/actions/gateway";

export default async function GatewayDevelopmentConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; next?: string; challenge?: string; error?: string }>;
}) {
  if (process.env.NODE_ENV !== "development" || process.env.DEV_LOGIN_ENABLED !== "true") {
    redirect("/producer");
  }
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer");
  const params = await searchParams;
  if (!params.state) redirect("/producer?settings=gateway");
  const returnTo = params.next?.startsWith("/producer") ? params.next : "/producer?settings=gateway";
  const gatewayAskedForTwoFactor = params.challenge === "2fa";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl items-center px-5 py-12">
      <section className="w-full rounded-2xl border border-hairline bg-card p-6 sm:p-8">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">Secure Gateway connection</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">Connect your personal Gateway</h1>
        <p className="mt-3 text-sm leading-6 text-subtle">
          Continue to authorize All Star OS to use your personal Gateway connection for scheduled reports.
          Your Gateway password and verification codes are not stored by All Star OS.
        </p>

        {gatewayAskedForTwoFactor ? (
          <div className="mt-7 rounded-xl border border-hairline bg-background/40 p-5">
            <p className="font-semibold text-ink">Verify your Gateway sign-in</p>
            <p className="mt-2 text-sm text-subtle">Enter the verification code Gateway requested to finish connecting.</p>
            {params.error === "code_required" ? <p role="alert" className="mt-3 text-sm text-neg">Enter the code Gateway requested.</p> : null}
            <form action={completeGatewayDevelopmentConnection} className="mt-5 space-y-4">
              <input type="hidden" name="state" value={params.state} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="twoFactorRequested" value="1" />
              <label className="block text-sm text-ink">
                Verification code
                <input name="twoFactorCode" autoComplete="one-time-code" inputMode="numeric" className="mt-2 w-full rounded-lg border border-hairline bg-background px-3 py-2.5" />
              </label>
              <button type="submit" className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-black">Verify and connect</button>
            </form>
          </div>
        ) : (
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <form action={completeGatewayDevelopmentConnection}>
              <input type="hidden" name="state" value={params.state} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button type="submit" className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-black">Continue</button>
            </form>
            <Link
              href={`/producer/gateway/connect/mock?state=${encodeURIComponent(params.state)}&challenge=2fa&next=${encodeURIComponent(returnTo)}`}
              className="rounded-full border border-hairline px-5 py-2.5 text-center text-sm font-semibold text-ink"
            >
              Use a verification code
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
