import Link from "next/link";

export default function ScorecardNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 items-center px-5 py-12 md:px-10">
      <section className="w-full rounded-[1.4rem] border border-hairline bg-card px-6 py-10 sm:px-10">
        <p className="text-sm font-medium text-mute">Scorecard not found</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-ink">
          This Scorecard is not available to your account.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-subtle">
          It may not exist, may not be published yet, or may belong to someone outside your permitted downline.
        </p>
        <Link
          href="/producer/scorecards"
          className="mt-6 inline-flex rounded-xl border border-hairline bg-card-hi px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent"
        >
          Back to Scorecards
        </Link>
      </section>
    </main>
  );
}
