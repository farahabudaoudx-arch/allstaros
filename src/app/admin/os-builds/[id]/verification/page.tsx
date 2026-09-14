import { notFound } from "next/navigation";
import { Badge, Button, Card, Field, LinkButton, PageShell, Textarea } from "@/components/ui";
import {
  adminFinalizeOsBuildVerification,
  adminRefreshOsBuildAutomatedVerification,
  adminSaveOsVerificationItem,
  adminStartOsBuildVerification,
} from "@/lib/actions/admin/os-verification";
import { loadOsBuildForAdmin } from "@/lib/whitelabel/admin";
import { loadVerificationForAdmin, type WhitelabelVerificationItem } from "@/lib/whitelabel/verification/admin";

const FLASH: Record<string, string> = {
  started: "Handoff verification started from the latest succeeded customer deployment.",
  "item-saved": "Verification result saved.",
  "automated-refreshed": "Automated source, schema, deployment, and provider-evidence checks were refreshed.",
  passed: "All required handoff checks passed. The handoff can now be recorded.",
  blocked: "Verification remains blocked. Every required check must have a recorded pass result.",
};

function statusTone(status: WhitelabelVerificationItem["status"]): "default" | "pos" | "warn" | "neg" {
  if (status === "passed") return "pos";
  if (status === "failed") return "neg";
  if (status === "deferred") return "warn";
  return "default";
}

export default async function OsBuildVerificationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const flash = await searchParams;
  const [build, view] = await Promise.all([
    loadOsBuildForAdmin(id),
    loadVerificationForAdmin(id),
  ]);
  if (!build) notFound();

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-mute">OS Assembly Line · Verification</p>
          <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em]">{build.agency_name}</h1>
          <p className="mt-2 max-w-2xl text-sm text-subtle">
            Record actual handoff results. A purchased launch addition or required base flow cannot be deferred.
          </p>
        </div>
        <div className="flex gap-2">
          <LinkButton href={`/admin/os-builds/${id}/handoff`}>Handoff</LinkButton>
          <LinkButton href={`/admin/os-builds/${id}`}>Build</LinkButton>
        </div>
      </div>

      {flash.ok ? <p className="mt-6 rounded-xl border border-pos/30 bg-pos/[0.08] px-4 py-2.5 text-sm text-pos">{FLASH[flash.ok] ?? "Saved."}</p> : null}
      {flash.error ? <p className="mt-6 rounded-xl border border-neg/30 bg-neg/[0.08] px-4 py-2.5 text-sm text-neg">{flash.error}</p> : null}

      {!view.available ? (
        <Card className="mt-8">
          <h2 className="text-xl font-semibold text-ink">Ticket 5 migration not installed</h2>
          <p className="mt-2 text-sm text-subtle">
            No database change was applied. The verification code can be reviewed and tested safely, but a real run starts only after the control-plane migration is explicitly approved later.
          </p>
        </Card>
      ) : !view.run ? (
        <Card className="mt-8">
          <h2 className="text-xl font-semibold text-ink">Start handoff verification</h2>
          <p className="mt-2 text-sm text-subtle">
            The run is pinned to the latest succeeded provisioning SHA and deployment. Starting it does not deploy or modify the customer installation.
          </p>
          <form action={adminStartOsBuildVerification} className="mt-5">
            <input type="hidden" name="build_id" value={id} />
            <Button type="submit" variant="primary">Start verification</Button>
          </form>
        </Card>
      ) : (
        <>
          <Card className="mt-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-ink">Verification run</h2>
                <p className="mt-1 text-sm text-subtle">Source {view.run.source_sha} · schema {view.run.schema_release}</p>
                <a href={view.run.deployment_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-accent underline underline-offset-4">
                  {view.run.deployment_url}
                </a>
              </div>
              <Badge tone={view.run.status === "passed" ? "pos" : view.run.status === "blocked" ? "neg" : "default"}>
                {view.run.status}
              </Badge>
            </div>
          </Card>

          <div className="mt-5 grid gap-4">
            {view.items.map((item) => (
              <Card key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={statusTone(item.status)}>{item.status.replaceAll("_", " ")}</Badge>
                      <Badge>{item.mode}</Badge>
                      {item.required_for_handoff ? <Badge tone="warn">required for handoff</Badge> : <Badge>not launch-blocking</Badge>}
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-ink">{item.label}</h3>
                    <p className="mt-1 max-w-3xl text-sm text-subtle">{item.expected_summary}</p>
                  </div>
                </div>

                {item.actual_summary ? (
                  <div className="mt-4 rounded-xl border border-hairline bg-card-hi p-3 text-sm text-subtle">
                    <span className="font-medium text-ink">Observed:</span> {item.actual_summary}
                  </div>
                ) : null}

                {item.mode === "manual" && item.required_for_handoff ? (
                  <form action={adminSaveOsVerificationItem} className="mt-5 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                    <input type="hidden" name="build_id" value={id} />
                    <input type="hidden" name="run_id" value={view.run!.id} />
                    <input type="hidden" name="item_id" value={item.id} />
                    <Field label="Result" htmlFor={`${item.id}-status`}>
                      <select id={`${item.id}-status`} name="status" defaultValue={item.status === "deferred" || item.status === "not_applicable" ? "pending" : item.status} className="w-full rounded-xl border border-hairline bg-card-hi px-3.5 py-2.5 text-sm text-ink">
                        <option value="pending">Pending</option>
                        <option value="passed">Passed</option>
                        <option value="failed">Failed</option>
                      </select>
                    </Field>
                    <Field label="Observed result / evidence (no credentials)" htmlFor={`${item.id}-evidence`}>
                      <Textarea id={`${item.id}-evidence`} name="actual_summary" rows={3} defaultValue={item.actual_summary ?? ""} placeholder="What was tested, what happened, and any safe non-secret reference" />
                    </Field>
                    <div className="md:col-start-2">
                      <Button type="submit">Save result</Button>
                    </div>
                  </form>
                ) : null}
              </Card>
            ))}
          </div>

          <Card className="mt-5">
            <h2 className="text-xl font-semibold text-ink">Finalize verification</h2>
            <p className="mt-2 text-sm text-subtle">
              Finalization is server-enforced. Any required result other than <strong>passed</strong> leaves the run blocked.
            </p>
            <form action={adminFinalizeOsBuildVerification} className="mt-4">
              <input type="hidden" name="build_id" value={id} />
              <input type="hidden" name="run_id" value={view.run.id} />
              <Button type="submit" variant="primary">Evaluate handoff gate</Button>
            </form>
            {!view.handoff ? (
              <form action={adminRefreshOsBuildAutomatedVerification} className="mt-3">
                <input type="hidden" name="build_id" value={id} />
                <input type="hidden" name="run_id" value={view.run.id} />
                <Button type="submit">Refresh automated checks</Button>
              </form>
            ) : null}
          </Card>
        </>
      )}
    </PageShell>
  );
}
