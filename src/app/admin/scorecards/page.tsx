import Link from "next/link";
import { ManualScorecardSelector, type ManualScorecardPersonOption } from "@/components/admin/ManualScorecardSelector";
import { SubmitButton } from "@/components/SubmitButton";
import { generateManualScorecard, startScorecardRun } from "@/lib/actions/scorecards";
import { requireAdmin } from "@/lib/admin/guard";
import { loadManualTargetContext } from "@/lib/scorecards/manual";
import { scorecardPeriodFromStart } from "@/lib/scorecards/period";
import type { ScorecardPeriodKind } from "@/lib/scorecards/run";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RunRow = {
  id: string;
  period_label: string;
  period_kind: "monthly" | "quarterly" | "annual";
  revision: number;
  status: string;
  eligible_producer_count: number;
  eligible_builder_count: number;
  checked_count: number;
  passed_count: number;
  failed_count: number;
  held_count: number;
  generated_count: number;
  published_count: number;
  delivery_error_count: number;
  source_manifest: Record<string, unknown>;
  generation_scope: "population" | "manual_person";
  target_person_id: string | null;
  target_card_type: "producer" | "builder" | null;
  created_at: string;
};

type ValidationRow = {
  id: string;
  run_id: string;
  card_type: "producer" | "builder" | null;
  person_id: string | null;
  check_code: string;
  field_name: string | null;
  status: "failed" | "held";
  expected_value: unknown;
  actual_value: unknown;
  source_context: Record<string, unknown>;
  safe_next_action: string | null;
  first_verified_at: string;
  latest_verified_at: string;
};

const statusCopy: Record<string, string> = {
  capturing: "Capturing source data",
  validating: "Validating every metric row",
  blocked: "Blocked — action required",
  ready: "Both complete datasets are accurate",
  generating: "Generating artifacts",
  published: "Published",
  delivery_errors: "Published with delivery errors",
};

export default async function AdminScorecardsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    started?: string;
    manualPersonId?: string;
    manualPeriodKind?: string;
    manualPeriodStart?: string;
    manualResult?: string;
    manualError?: string;
    snapshotId?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("scorecard_metric_run")
    .select("id, period_label, period_kind, revision, status, eligible_producer_count, eligible_builder_count, checked_count, passed_count, failed_count, held_count, generated_count, published_count, delivery_error_count, source_manifest, generation_scope, target_person_id, target_card_type, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Unable to load Scorecard runs: ${error.message}`);
  const runs = (data ?? []) as RunRow[];
  const runIds = runs.map((run) => run.id);
  const validationResult = runIds.length > 0
    ? await service
        .from("scorecard_validation_result")
        .select("id, run_id, card_type, person_id, check_code, field_name, status, expected_value, actual_value, source_context, safe_next_action, first_verified_at, latest_verified_at")
        .in("run_id", runIds)
        .in("status", ["failed", "held"])
        .order("first_verified_at", { ascending: true })
    : { data: [], error: null };
  if (validationResult.error) throw new Error(`Unable to load Scorecard validation problems: ${validationResult.error.message}`);
  const validations = (validationResult.data ?? []) as ValidationRow[];
  const { data: peopleData, error: peopleError } = await service
    .from("person")
    .select("id, full_name, email")
    .order("full_name", { ascending: true });
  if (peopleError) throw new Error(`Unable to load people for manual Scorecards: ${peopleError.message}`);
  const people = (peopleData ?? []).map((person) => ({
    id: String(person.id),
    fullName: String(person.full_name),
    email: String(person.email ?? ""),
  })) satisfies ManualScorecardPersonOption[];
  const personNameById = new Map(people.map((person) => [person.id, person.fullName]));

  const manualPeriodKind = ["monthly", "quarterly", "annual"].includes(params.manualPeriodKind ?? "")
    ? params.manualPeriodKind as ScorecardPeriodKind
    : "monthly";
  let manualPeriod: ReturnType<typeof scorecardPeriodFromStart> | null = null;
  let manualTarget: Awaited<ReturnType<typeof loadManualTargetContext>>[number] | null = null;
  let applicabilityError: string | null = null;
  if (params.manualPersonId && params.manualPeriodStart) {
    try {
      manualPeriod = scorecardPeriodFromStart(manualPeriodKind, params.manualPeriodStart);
      const context = await loadManualTargetContext(service, params.manualPersonId, manualPeriod.end, false);
      manualTarget = context.find((row) => row.personId === params.manualPersonId && row.depth === 0) ?? null;
      if (!manualTarget) applicabilityError = "No historical period-end role fact exists for that person and period.";
    } catch {
      applicabilityError = "Choose a valid calendar period before checking applicability.";
    }
  }
  const applicableCardTypes = manualTarget?.activeAtPeriodEnd
    ? [
        ...(manualTarget.producerAtPeriodEnd ? ["producer" as const] : []),
        ...(manualTarget.builderAtPeriodEnd ? ["builder" as const] : []),
      ]
    : [];

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <h1 className="text-4xl font-semibold tracking-[-0.03em] text-ink md:text-5xl">Scorecard rollout</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-subtle">Start one closed-period run, then monitor source coverage, complete-population validation, generation, publication, and delivery from one place.</p>
      <Link href="/admin/scorecards/coverage" className="mt-4 inline-block text-sm font-semibold text-accent underline underline-offset-4">Open Gateway Coverage</Link>

      {params.error ? <p role="alert" className="mt-6 border-l-2 border-neg pl-4 text-sm text-neg">{params.error}</p> : null}
      {params.started ? <p role="status" className="mt-6 border-l-2 border-pos pl-4 text-sm text-pos">Completed-period Scorecards published. Open each member&apos;s card from Run history or /producer/scorecards.</p> : null}

      <section className="mt-10 border border-hairline bg-card p-6" aria-labelledby="manual-scorecard-title">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="manual-scorecard-title" className="text-xl font-semibold text-ink">Manual Scorecard Generation</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-subtle">
              Generate exactly one closed-period Producer or Builder Scorecard. Historical period-end roles determine which card types are allowed.
            </p>
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-mute">One person · one card</p>
        </div>

        {params.manualError ? (
          <p role="alert" className="mt-5 border-l-2 border-neg pl-4 text-sm text-neg">{params.manualError}</p>
        ) : null}
        {params.manualResult && params.snapshotId ? (
          <div role="status" className="mt-5 border-l-2 border-pos pl-4 text-sm text-pos">
            <p>{params.manualResult === "existing" ? "This exact Scorecard was already published; the existing artifact was returned." : "Manual Scorecard published. Delivery remains queued through the normal Scorecard outbox."}</p>
            <Link href={`/producer/scorecards/${params.snapshotId}`} className="mt-2 inline-block font-semibold underline underline-offset-4">
              Open published Scorecard
            </Link>
          </div>
        ) : null}

        <ManualScorecardSelector
          people={people}
          initialPersonId={params.manualPersonId}
          initialPeriodKind={manualPeriodKind}
          initialPeriodStart={params.manualPeriodStart}
        />

        {params.manualPersonId && params.manualPeriodStart ? (
          <div className="mt-6 border-t border-hairline pt-6">
            {manualTarget && manualPeriod ? (
              <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
                <div>
                  <p className="text-sm font-semibold text-ink">{manualTarget.fullName}</p>
                  <p className="mt-1 text-sm text-subtle">{manualTarget.email}</p>
                  <p className="mt-3 text-sm text-subtle">
                    {manualPeriod.label} · period-end status {manualTarget.activeAtPeriodEnd ? "active" : "inactive"}
                  </p>
                  <p className="mt-1 text-sm text-subtle">
                    Applicable cards: {applicableCardTypes.length > 0
                      ? applicableCardTypes.map((card) => card === "producer" ? "Producer" : "Builder").join(" + ")
                      : "none"}
                  </p>
                </div>
                {applicableCardTypes.length > 0 ? (
                  <form action={generateManualScorecard} className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] lg:min-w-[28rem]">
                    <input type="hidden" name="personId" value={params.manualPersonId} />
                    <input type="hidden" name="periodKind" value={manualPeriod.kind} />
                    <input type="hidden" name="periodStart" value={manualPeriod.start} />
                    <label className="text-sm text-subtle">
                      Scorecard type
                      <select name="cardType" required className="mt-2 w-full rounded-lg border border-hairline bg-background px-3 py-2.5 text-ink">
                        {applicableCardTypes.map((card) => (
                          <option key={card} value={card}>{card === "producer" ? "Producer" : "Builder"}</option>
                        ))}
                      </select>
                    </label>
                    <SubmitButton
                      pendingLabel="Generating…"
                      className="self-end rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Generate
                    </SubmitButton>
                  </form>
                ) : (
                  <p className="text-sm text-mute">No manual Scorecard can be generated for this period-end role.</p>
                )}
              </div>
            ) : (
              <p role="status" className="text-sm text-mute">{applicabilityError ?? "Choose one person and a valid period to check applicability."}</p>
            )}
          </div>
        ) : null}
      </section>
      <section className="mt-10 border border-hairline bg-card p-6" aria-labelledby="start-run-title">
        <h2 id="start-run-title" className="text-xl font-semibold text-ink">Start a completed-period run</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-subtle">
          Publishes a Producer and Builder Scorecard for every person who was in role at period end, when Gateway coverage is complete and the roster is 40 cards or fewer. The demo seed uses monthly June 2026 (2026-06-01 through 2026-06-30).
        </p>
        <form action={startScorecardRun} className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm text-subtle">Period type
            <select name="periodKind" required className="mt-2 w-full rounded-lg border border-hairline bg-background px-3 py-2.5 text-ink">
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </label>
          <label className="text-sm text-subtle">Period start
            <input name="periodStart" type="date" required className="mt-2 w-full rounded-lg border border-hairline bg-background px-3 py-2.5 text-ink" />
          </label>
          <label className="text-sm text-subtle">Period end
            <input name="periodEnd" type="date" required className="mt-2 w-full rounded-lg border border-hairline bg-background px-3 py-2.5 text-ink" />
          </label>
          <p className="self-end text-sm leading-6 text-mute">The public period label is derived from these exact calendar boundaries.</p>
          <button type="submit" className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 md:col-span-2 lg:col-span-1">Start run</button>
        </form>
      </section>

      <section className="mt-12" aria-labelledby="run-history-title">
        <h2 id="run-history-title" className="text-2xl font-semibold text-ink">Run history</h2>
        {runs.length === 0 ? <p className="mt-4 text-sm text-subtle">No Scorecard runs have been started.</p> : (
          <div className="mt-5 space-y-4">
            {runs.map((run) => (
              <article key={run.id} className="border border-hairline bg-card p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-ink">{run.period_label}</h3>
                    <p className="mt-1 text-sm text-subtle">
                      {run.period_kind === "annual" ? "Annual" : run.period_kind === "quarterly" ? "Quarterly" : "Monthly"} · Revision {run.revision}
                      {run.generation_scope === "manual_person"
                        ? ` · Manual · ${run.target_person_id ? personNameById.get(run.target_person_id) ?? "Selected person" : "Selected person"} · ${run.target_card_type === "builder" ? "Builder" : "Producer"}`
                        : ""}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-accent">{statusCopy[run.status] ?? run.status}</p>
                </div>
                <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-hairline pt-5 sm:grid-cols-4 lg:grid-cols-8">
                  {[
                    ["Producers", run.eligible_producer_count],
                    ["Builders", run.eligible_builder_count],
                    ["Checked", run.checked_count],
                    ["Passed", run.passed_count],
                    ["Failed", run.failed_count],
                    ["Held", run.held_count],
                    ["Generated", run.generated_count],
                    ["Published", run.published_count],
                    ["Delivery errors", run.delivery_error_count],
                  ].map(([label, value]) => <div key={label}><dt className="text-xs text-mute">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</dd></div>)}
                </dl>
                <details className="mt-5 border-t border-hairline pt-4">
                  <summary className="cursor-pointer text-sm font-medium text-subtle">Source manifest and validation problems</summary>
                  <pre className="mt-4 overflow-x-auto whitespace-pre-wrap text-xs leading-5 text-mute">{JSON.stringify(run.source_manifest, null, 2)}</pre>
                  {validations.filter((problem) => problem.run_id === run.id).map((problem) => (
                    <div key={problem.id} className="mt-4 border-l-2 border-neg pl-4 text-sm">
                      <p className="font-medium text-ink">{problem.card_type ? `${problem.card_type === "producer" ? "Producer" : "Builder"} · ` : ""}{problem.check_code}{problem.field_name ? ` · ${problem.field_name}` : ""}</p>
                      <p className="mt-1 text-subtle">Person: {problem.person_id ?? "Population-wide"}</p>
                      <p className="mt-1 text-subtle">Expected {JSON.stringify(problem.expected_value)} · received {JSON.stringify(problem.actual_value)}</p>
                      {Object.keys(problem.source_context).length > 0 ? <p className="mt-1 text-mute">Source: {JSON.stringify(problem.source_context)}</p> : null}
                      {problem.safe_next_action ? <p className="mt-2 text-ink">Next: {problem.safe_next_action}</p> : null}
                      <p className="mt-2 text-xs text-mute">First verified {new Date(problem.first_verified_at).toLocaleString("en-US")} · latest retry {new Date(problem.latest_verified_at).toLocaleString("en-US")}</p>
                    </div>
                  ))}
                </details>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
