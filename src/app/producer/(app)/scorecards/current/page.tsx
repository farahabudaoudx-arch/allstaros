import Link from "next/link";
import { redirect } from "next/navigation";
import { ProducerScorecardPreview } from "@/components/scorecards/ProducerScorecardPreview";
import { getCurrentPerson } from "@/lib/auth";
import { createMonthlyProducerPreview } from "@/lib/scorecards/lifecycle";
import {
  currentMonthlyPeriod,
  loadCurrentMonthlyProducerOverview,
  loadCurrentMonthlyProducerSource,
} from "@/lib/scorecards/source";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function loadCurrentScorecard(
  person: NonNullable<Awaited<ReturnType<typeof getCurrentPerson>>>,
  now: Date,
) {
  const service = createServiceRoleClient();
  const source = await loadCurrentMonthlyProducerSource(service, person.id, now);
  const preview = createMonthlyProducerPreview(source);
  const overview = await loadCurrentMonthlyProducerOverview(
    service,
    person,
    preview.totalIssuedIpCents,
    now,
  );
  return { preview, overview };
}

function CurrentScorecardUnavailable() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 md:px-10 md:py-12">
      <Link href="/producer/scorecards" className="text-sm font-medium text-accent hover:underline">
        Back to Scorecards
      </Link>
      <section className="mt-8 rounded-2xl border border-hairline bg-card px-6 py-10 sm:px-10">
        <p className="text-sm font-medium text-neg">Current Scorecard unavailable</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-ink">Your published history is still available.</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-subtle">
          We couldn&apos;t calculate the live month right now. Go back to Scorecards to view your published reports and try the live card again later.
        </p>
      </section>
    </main>
  );
}

export default async function CurrentScorecardPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/scorecards/current");

  if (!person.is_producer && !person.is_builder) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 md:px-10 md:py-12">
        <Link href="/producer/scorecards" className="text-sm font-medium text-accent hover:underline">
          Back to Scorecards
        </Link>
        <section className="mt-8 rounded-2xl border border-hairline bg-card px-6 py-10 sm:px-10">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-ink">No current Scorecard applies to this account.</h1>
          <p className="mt-3 text-sm leading-6 text-subtle">
            Producer and Builder roles receive Scorecards. Your other All Star OS pages remain available.
          </p>
        </section>
      </main>
    );
  }

  const now = new Date();
  const period = currentMonthlyPeriod(now);
  const service = createServiceRoleClient();
  const { data: published, error: publishedError } = await service
    .from("scorecard_snapshot")
    .select("id")
    .eq("person_id", person.id)
    .eq("card_type", "producer")
    .eq("period_kind", "monthly")
    .eq("period_start", period.start)
    .in("lifecycle_status", ["final", "corrected"])
    .not("finalized_at", "is", null)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (publishedError) return <CurrentScorecardUnavailable />;
  if (published?.id) redirect(`/producer/scorecards/${published.id}`);

  let live: Awaited<ReturnType<typeof loadCurrentScorecard>> | null = null;
  try {
    live = await loadCurrentScorecard(person, now);
  } catch {
    live = null;
  }
  if (!live) return <CurrentScorecardUnavailable />;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-10 md:py-12">
      <Link href="/producer/scorecards" className="text-sm font-medium text-accent hover:underline">
        Back to Scorecards
      </Link>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-accent/50 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-accent">
          In progress
        </span>
        <p className="text-sm leading-6 text-subtle">
          This live {period.label} card updates as new tracking, lead spend, and Gateway reports arrive.
        </p>
      </div>
      <div className="mt-6">
        <ProducerScorecardPreview preview={live.preview} overview={live.overview} periodKind="monthly" />
      </div>
    </main>
  );
}
