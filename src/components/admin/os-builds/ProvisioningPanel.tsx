import { Badge, Button, Card, Field, Input } from "@/components/ui";
import { adminRunNextOsBuildProvisioning, adminStartOsBuildProvisioning } from "@/lib/actions/admin/os-provisioning";
import { PROVISIONING_STEP_LABELS } from "@/lib/whitelabel/provisioning/plan";
import type { ProvisioningAdminView } from "@/lib/whitelabel/provisioning/admin";
import type { ProvisioningStepStatus } from "@/lib/whitelabel/provisioning/plan";

function tone(status: ProvisioningStepStatus | "pending" | "running" | "blocked" | "failed" | "succeeded" | "cancelled") {
  if (status === "succeeded") return "pos" as const;
  if (status === "failed") return "neg" as const;
  if (status === "blocked") return "warn" as const;
  if (status === "running") return "accent" as const;
  return "default" as const;
}

export function ProvisioningPanel({
  buildId,
  ready,
  sourceSha,
  view,
}: {
  buildId: string;
  ready: boolean;
  sourceSha: string;
  view: ProvisioningAdminView;
}) {
  if (!view.available) {
    return (
      <Card className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Clean deployment</h2>
        <p className="mt-2 text-sm text-warn">
          Provisioning control-plane migration is not installed on this environment. No customer deployment action is available until it is applied explicitly.
        </p>
      </Card>
    );
  }

  const state = view.state;
  return (
    <Card className="mt-8" accent={Boolean(state && state.run.status !== "succeeded")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ink">Clean deployment</h2>
          <p className="mt-1 max-w-3xl text-sm text-subtle">
            Runs against this customer&apos;s verified Supabase and Vercel projects only. Steps are durable and retryable; completed work is verified and skipped on resume.
          </p>
        </div>
        {state ? <Badge tone={tone(state.run.status)}>{state.run.status}</Badge> : null}
      </div>

      {!state ? (
        <form action={adminStartOsBuildProvisioning} className="mt-5 max-w-xl">
          <input type="hidden" name="build_id" value={buildId} />
          <Field label="Source Git SHA" htmlFor="source_sha" hint="Immutable release commit to deploy to the customer project.">
            <Input id="source_sha" name="source_sha" defaultValue={sourceSha} required minLength={7} maxLength={64} />
          </Field>
          <Button type="submit" variant="primary" className="mt-4" disabled={!ready}>
            Start clean provisioning
          </Button>
          {!ready ? <p className="mt-2 text-xs text-warn">Resolve every readiness item above before provisioning can start.</p> : null}
        </form>
      ) : (
        <>
          <div className="mt-5 grid gap-3 text-sm md:grid-cols-3">
            <div className="rounded-xl border border-hairline bg-card-hi p-3">
              <span className="block text-xs uppercase tracking-[0.14em] text-mute">Source</span>
              <span className="mt-1 block break-all font-mono text-xs text-ink">{state.run.source_sha}</span>
            </div>
            <div className="rounded-xl border border-hairline bg-card-hi p-3">
              <span className="block text-xs uppercase tracking-[0.14em] text-mute">Current step</span>
              <span className="mt-1 block text-ink">{state.run.current_step ? PROVISIONING_STEP_LABELS[state.run.current_step] : "Not started"}</span>
            </div>
            <div className="rounded-xl border border-hairline bg-card-hi p-3">
              <span className="block text-xs uppercase tracking-[0.14em] text-mute">Deployment</span>
              {state.run.deployment_url ? <a href={state.run.deployment_url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-accent hover:underline">{state.run.deployment_url}</a> : <span className="mt-1 block text-mute">Not created yet</span>}
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {state.steps.map((step) => (
              <div key={step.id} className="rounded-xl border border-hairline bg-card-hi px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{step.ordinal}. {PROVISIONING_STEP_LABELS[step.step_key]}</p>
                    <p className="mt-0.5 text-xs text-mute">Attempts: {step.attempt_count}</p>
                  </div>
                  <Badge tone={tone(step.status)}>{step.status}</Badge>
                </div>
                {step.last_error ? <p className={`mt-2 text-xs ${step.status === "blocked" ? "text-warn" : step.status === "failed" ? "text-neg" : "text-subtle"}`}>{step.last_error}</p> : null}
                {step.external_url ? <a href={step.external_url} target="_blank" rel="noreferrer" className="mt-2 block break-all text-xs text-accent hover:underline">{step.external_url}</a> : null}
              </div>
            ))}
          </div>

          {state.run.status !== "succeeded" && state.run.status !== "cancelled" ? (
            <form action={adminRunNextOsBuildProvisioning} className="mt-5">
              <input type="hidden" name="build_id" value={buildId} />
              <input type="hidden" name="run_id" value={state.run.id} />
              <Button type="submit" variant="primary">Run / retry next step</Button>
              <p className="mt-2 text-xs text-mute">Long schema work is intentionally split into small idempotent batches. Re-run the same step until it advances.</p>
            </form>
          ) : null}
        </>
      )}
    </Card>
  );
}
