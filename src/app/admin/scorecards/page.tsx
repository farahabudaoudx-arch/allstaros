import Link from "next/link";
import { ManualScorecardSelector, type ManualScorecardPersonOption } from "@/components/admin/ManualScorecardSelector";
import { SubmitButton } from "@/components/SubmitButton";
import { correctPublishedScorecard, generateManualScorecard, startScorecardRun } from "@/lib/actions/scorecards";
import { requireAdmin } from "@/lib/admin/guard";
import {
  evaluateManualApplicability,
  type ManualApplicabilityResult,
} from "@/lib/scorecards/manual-applicability";
import { loadManualTargetContext } from "@/lib/scorecards/manual";
import { recentClosedScorecardPeriods, scorecardPeriodFromStart, type ScorecardPeriod } from "@/lib/scorecards/period";
import type { ScorecardPeriodKind } from "@/lib/scorecards/run";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function chicagoToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function periodKindLabel(kind: ScorecardPeriod["kind"]) {
  if (kind === "monthly") return "Months";
  if (kind === "quarterly") return "Quarters";
  return "Years";
}

function cardTypeLabel(cardType: "producer" | "builder") {
  return cardType === "producer" ? "Producer" : "Builder";
}

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
  correction_reason: string | null;
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

type CorrectableSnapshotRow = {
  id: string;
  person_id: string;
  card_type: "producer" | "builder";
  period_kind: "monthly" | "quarterly" | "annual";
  period_start: string;
  period_end: string;
  lifecycle_status: "final" | "corrected";
  revision: number;
  metric_run_id: string;
  finalized_at: string;
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
    correctionResult?: string;
    correctionError?: string;
    correctionSnapshotId?: string;
    correctedSnapshotId?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const today = chicagoToday();
  const closedPeriods = recentClosedScorecardPeriods(today);
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("scorecard_metric_run")
    .select("id, period_label, period_kind, revision, status, eligible_producer_count, eligible_builder_count, checked_count, passed_count, failed_count, held_count, generated_count, published_count, delivery_error_count, source_manifest, generation_scope, target_person_id, target_card_type, correction_reason, created_at")
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

  const [{ data: peopleData, error: peopleError }, { data: snapshotData, error: snapshotError }] = await Promise.all([
    service.from("person").select("id, full_name, email").order("full_name", { ascending: true }),
    service
      .from("scorecard_snapshot")
      .select("id, person_id, card_type, period_kind, period_start, period_end, lifecycle_status, revision, metric_run_id, finalized_at")
      .in("lifecycle_status", ["final", "corrected"])
      .not("finalized_at", "is", null)
      .not("metric_run_id", "is", null)
      .order("period_start", { ascending: false })
      .order("revision", { ascending: false }),
  ]);
  if (peopleError) throw new Error(`Unable to load people for Scorecard administration: ${peopleError.message}`);
  if (snapshotError) throw new Error(`Unable to load published Scorecards for correction: ${snapshotError.message}`);
  const people = (peopleData ?? []).map((person) => ({
    id: String(person.id),
    fullName: String(person.full_name),
    email: String(person.email ?? ""),
  })) satisfies ManualScorecardPersonOption[];
  const personNameById = new Map(people.map((person) => [person.id, person.fullName]));

  const latestCorrectable = new Map<string, CorrectableSnapshotRow>();
  for (const snapshot of (snapshotData ?? []) as CorrectableSnapshotRow[]) {
    const key = `${snapshot.person_id}:${snapshot.card_type}:${snapshot.period_kind}:${snapshot.period_start}`;
    if (!latestCorrectable.has(key)) latestCorrectable.set(key, snapshot);
  }
  const correctableSnapshots = [...latestCorrectable.values()];

  const manualPeriodKind = ["monthly", "quarterly", "annual"].includes(params.manualPeriodKind ?? "")
    ? params.manualPeriodKind as ScorecardPeriodKind
    : "monthly";
  const checkAttempted = params.manualPersonId != null || params.manualPeriodStart != null;
  const fallbackToolsOpen = Boolean(
    params.started || params.error || checkAttempted || params.manualError || params.manualResult || params.snapshotId,
  );
  let applicability: ManualApplicabilityResult | null = null;
  if (checkAttempted) {
    const personId = params.manualPersonId ?? "";
    const personExists = personId ? people.some((person) => person.id === personId) : false;
    const periodCheck = evaluateManualApplicability({
      personId,
      periodKind: params.manualPeriodKind,
      periodStart: params.manualPeriodStart,
      today,
      personExists,
      target: undefined,
    });
    if (periodCheck.status === "needs_target") {
      const context = await loadManualTargetContext(service, personId, periodCheck.period.end, false);
      const target = context.find((row) => row.personId === personId && row.depth === 0) ?? null;
      applicability = evaluateManualApplicability({
        personId,
        periodKind: params.manualPeriodKind,
        periodStart: params.manualPeriodStart,
        today,
        personExists,
        target,
      });
    } else {
      applicability = periodCheck;
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <h1 className="text-4xl font-semibold tracking-[-0.03em] text-ink md:text-5xl">Scorecard publishing</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-subtle">
        Scorecards are published for completed Months, Quarters, and Years. Custom date windows and one-person generation are not the normal publishing model.
      </p>
      <Link href="/admin/scorecards/coverage" className="mt-4 inline-block text-sm font-semibold text-accent underline underline-offset-4">Open Gateway Coverage</Link>

      {params.error ? <p role="alert" className="mt-6 border-l-2 border-neg pl-4 text-sm text-neg">{params.error}</p> : null}
      {params.started ? <p role="status" className="mt-6 border-l-2 border-pos pl-4 text-sm text-pos">Closed-period fallback rollout completed. Published cards remain frozen in member archives.</p> : null}

      <section className="mt-10 border border-hairline bg-card p-6" aria-labelledby="publishing-model-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="publishing-model-title" className="text-xl font-semibold text-ink">Period publishing</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-subtle">
              The intended normal path is one complete organization publication after Gateway has finished the Month, Quarter, or Year. The Gateway-completion trigger is intentionally handled by the later automation work; this screen no longer asks administrators to invent start/end dates.
            </p>
          </div>
          <p className="shrink-0 text-xs font-medium uppercase tracking-[0.14em] text-accent">Month · Quarter · Year</p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            ["1", "Gateway period completes", "Wait for the finished reporting period rather than publishing a partial custom window."],
            ["2", "Canonical validation runs", "The same frozen roster, source coverage, scoring, and independent verification gates still apply."],
            ["3", "Cards publish and deliver", "Final or corrected revisions stay immutable in the archive and use the normal delivery outbox."],
          ].map(([number, title, body]) => (
            <div key={number} className="border-l-2 border-accent pl-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mute">Step {number}</p>
              <h3 className="mt-2 font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-subtle">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 border border-hairline bg-card p-6" aria-labelledby="correction-title">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="correction-title" className="text-xl font-semibold text-ink">Correct a published Scorecard</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-subtle">
              Fix the source data first, then rebuild the latest published card from canonical sources. A correction creates the next immutable revision with an audit reason; it never edits or deletes the prior snapshot in place.
            </p>
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-mute">Authorized admins only</p>
        </div>

        {params.correctionError ? <p role="alert" className="mt-5 border-l-2 border-neg pl-4 text-sm text-neg">{params.correctionError}</p> : null}
        {params.correctionResult === "no_changes" ? (
          <p role="status" className="mt-5 border-l-2 border-accent pl-4 text-sm text-subtle">No published Scorecard values changed, so no correction revision was created.</p>
        ) : null}
        {(params.correctionResult === "success" || params.correctionResult === "existing") && params.correctedSnapshotId ? (
          <div role="status" className="mt-5 border-l-2 border-pos pl-4 text-sm text-pos">
            <p>{params.correctionResult === "existing" ? "That correction revision already exists; the canonical artifact was returned." : "Corrected Scorecard published as a new revision. Delivery remains queued through the normal Scorecard outbox."}</p>
            <Link href={`/admin/scorecards/${params.correctedSnapshotId}`} className="mt-2 inline-block font-semibold underline underline-offset-4">Open corrected Scorecard</Link>
          </div>
        ) : null}

        {correctableSnapshots.length === 0 ? (
          <p className="mt-6 text-sm text-subtle">No finalized run-backed Scorecards are available for correction.</p>
        ) : (
          <form action={correctPublishedScorecard} className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_auto] lg:items-end">
            <label className="text-sm text-subtle">
              Latest published Scorecard
              <select name="snapshotId" required defaultValue={params.correctionSnapshotId ?? ""} className="mt-2 w-full rounded-lg border border-hairline bg-background px-3 py-2.5 text-ink">
                <option value="">Choose a Scorecard</option>
                {correctableSnapshots.map((snapshot) => {
                  const period = scorecardPeriodFromStart(snapshot.period_kind, snapshot.period_start);
                  const personName = personNameById.get(snapshot.person_id) ?? "Unknown member";
                  return (
                    <option key={snapshot.id} value={snapshot.id}>
                      {period.label} · {personName} · {cardTypeLabel(snapshot.card_type)} · revision {snapshot.revision}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="text-sm text-subtle">
              Correction reason
              <textarea
                name="correctionReason"
                required
                minLength={5}
                maxLength={500}
                rows={3}
                placeholder="What source truth was corrected?"
                className="mt-2 w-full resize-y rounded-lg border border-hairline bg-background px-3 py-2.5 text-ink"
              />
            </label>
            <SubmitButton
              pendingLabel="Publishing correction…"
              className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Publish correction
            </SubmitButton>
          </form>
        )}
      </section>

      <details open={fallbackToolsOpen} className="mt-10 border border-hairline bg-card p-6">
        <summary className="cursor-pointer text-xl font-semibold text-ink">Fallback publishing tools</summary>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-subtle">
          These are recovery/transition tools, not the normal publishing workflow. They accept only named, fully closed Months, Quarters, or Years. Use them when an automated period publication is unavailable or a missing initial card must be recovered.
        </p>

        <section className="mt-8 border-t border-hairline pt-7" aria-labelledby="fallback-run-title">
          <h2 id="fallback-run-title" className="text-lg font-semibold text-ink">Closed-period rollout fallback</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-subtle">
            Publishes every eligible Producer and Builder card for one closed period when Gateway coverage is complete. This temporary fallback remains capped at 40 cards until automatic Gateway-completion publishing is connected.
          </p>
          <form action={startScorecardRun} className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <label className="text-sm text-subtle">
              Closed period
              <select name="periodSelection" required className="mt-2 w-full rounded-lg border border-hairline bg-background px-3 py-2.5 text-ink">
                {(["monthly", "quarterly", "annual"] as const).map((kind) => (
                  <optgroup key={kind} label={periodKindLabel(kind)}>
                    {closedPeriods.filter((period) => period.kind === kind).map((period) => (
                      <option key={`${period.kind}:${period.start}`} value={`${period.kind}:${period.start}`}>{period.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <SubmitButton pendingLabel="Publishing period…" className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
              Publish closed period
            </SubmitButton>
          </form>
        </section>

        <section className="mt-8 border-t border-hairline pt-7" aria-labelledby="manual-scorecard-title">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 id="manual-scorecard-title" className="text-lg font-semibold text-ink">One-person recovery</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-subtle">
                Recover one missing initial Producer or Builder card for a closed named period. Do not use this to change an already-published card; use the correction workflow above instead.
              </p>
            </div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-mute">One person · one initial card</p>
          </div>

          {params.manualError ? <p role="alert" className="mt-5 border-l-2 border-neg pl-4 text-sm text-neg">{params.manualError}</p> : null}
          {params.manualResult && params.snapshotId ? (
            <div role="status" className="mt-5 border-l-2 border-pos pl-4 text-sm text-pos">
              <p>{params.manualResult === "existing" ? "This exact initial Scorecard was already published; the existing artifact was returned." : "Recovery Scorecard published. Delivery remains queued through the normal Scorecard outbox."}</p>
              <Link href={`/admin/scorecards/${params.snapshotId}`} className="mt-2 inline-block font-semibold underline underline-offset-4">Open published Scorecard</Link>
            </div>
          ) : null}

          <ManualScorecardSelector
            people={people}
            periods={closedPeriods}
            initialPersonId={params.manualPersonId}
            initialPeriodKind={manualPeriodKind}
            initialPeriodStart={params.manualPeriodStart}
          />

          {checkAttempted && applicability ? (
            <div className="mt-6 border-t border-hairline pt-6">
              {applicability.status === "ok" ? (
                <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
                  <div>
                    <p className="text-sm font-semibold text-ink">{applicability.target.fullName}</p>
                    <p className="mt-1 text-sm text-subtle">{applicability.target.email}</p>
                    <p className="mt-3 text-sm text-subtle">{applicability.period.label} · closed period · period-end status active</p>
                    <p className="mt-1 text-sm text-subtle">
                      Applicable cards: {applicability.applicableCardTypes.map((card) => cardTypeLabel(card)).join(" + ")}
                    </p>
                  </div>
                  <form action={generateManualScorecard} className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] lg:min-w-[28rem]">
                    <input type="hidden" name="personId" value={applicability.target.personId} />
                    <input type="hidden" name="periodKind" value={applicability.period.kind} />
                    <input type="hidden" name="periodStart" value={applicability.period.start} />
                    <label className="text-sm text-subtle">
                      Scorecard type
                      <select name="cardType" required className="mt-2 w-full rounded-lg border border-hairline bg-background px-3 py-2.5 text-ink">
                        {applicability.applicableCardTypes.map((card) => (
                          <option key={card} value={card}>{cardTypeLabel(card)}</option>
                        ))}
                      </select>
                    </label>
                    <SubmitButton pendingLabel="Recovering…" className="self-end rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
                      Recover initial card
                    </SubmitButton>
                  </form>
                </div>
              ) : applicability.status === "error" ? (
                <p role="alert" className="border-l-2 border-neg pl-4 text-sm text-neg">{applicability.message}</p>
              ) : null}
            </div>
          ) : null}
        </section>
      </details>

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
                        ? ` · ${run.revision > 1 ? "Correction" : "Recovery"} · ${run.target_person_id ? personNameById.get(run.target_person_id) ?? "Selected person" : "Selected person"} · ${run.target_card_type === "builder" ? "Builder" : "Producer"}`
                        : ""}
                    </p>
                    {run.revision > 1 && run.correction_reason ? <p className="mt-2 text-sm text-mute">Reason: {run.correction_reason}</p> : null}
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
                      <p className="font-medium text-ink">{problem.card_type ? `${cardTypeLabel(problem.card_type)} · ` : ""}{problem.check_code}{problem.field_name ? ` · ${problem.field_name}` : ""}</p>
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
