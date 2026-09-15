import { notFound } from "next/navigation";
import { Badge, Button, Card, Field, LinkButton, PageShell } from "@/components/ui";
import {
  adminFinalizeOsBuildHandoff,
  adminGenerateOsHandoffDocuments,
  adminRecordOsBuildHandoff,
  adminUploadOsHandoffArtifact,
} from "@/lib/actions/admin/os-verification";
import { loadOsBuildForAdmin } from "@/lib/whitelabel/admin";
import { loadVerificationForAdmin } from "@/lib/whitelabel/verification/admin";

const FLASH: Record<string, string> = {
  recorded: "Handoff preparation created. Generate the documents and register the matching source package before delivery.",
  "already-prepared": "This handoff preparation already exists.",
  delivered: "Canonical handoff delivered. The 5-business-day review and 90-day defect windows are now fixed.",
  "artifact-saved": "Private handoff artifact saved with a SHA-256 checksum.",
  "documents-generated": "Handoff PDF and safe manifest generated as new private artifact revisions.",
};

export default async function OsBuildHandoffPage({
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
          <p className="text-xs uppercase tracking-[0.18em] text-mute">OS Assembly Line · Handoff</p>
          <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em]">{build.agency_name}</h1>
          <p className="mt-2 max-w-2xl text-sm text-subtle">
            The handoff is immutable lifecycle history. Artifact revisions can change; the original handoff date and support windows cannot.
          </p>
        </div>
        <div className="flex gap-2">
          <LinkButton href={`/admin/os-builds/${id}/verification`}>Verification</LinkButton>
          <LinkButton href={`/admin/os-builds/${id}/operations`}>Operations</LinkButton>
          <LinkButton href={`/admin/os-builds/${id}`}>Build</LinkButton>
        </div>
      </div>

      {flash.ok ? <p className="mt-6 rounded-xl border border-pos/30 bg-pos/[0.08] px-4 py-2.5 text-sm text-pos">{FLASH[flash.ok] ?? "Saved."}</p> : null}
      {flash.error ? <p className="mt-6 rounded-xl border border-neg/30 bg-neg/[0.08] px-4 py-2.5 text-sm text-neg">{flash.error}</p> : null}

      {!view.available ? (
        <Card className="mt-8">
          <h2 className="text-xl font-semibold text-ink">Ticket 5 migration not installed</h2>
          <p className="mt-2 text-sm text-subtle">No handoff can be recorded until the control-plane migration is explicitly approved and applied later.</p>
        </Card>
      ) : view.handoff ? (
        <>
          <Card className="mt-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-ink">Canonical handoff</h2>
                <a href={view.handoff.os_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-accent underline underline-offset-4">{view.handoff.os_url}</a>
              </div>
              <Badge tone={view.handoff.status === "delivered" ? "pos" : "warn"}>{view.handoff.status}</Badge>
            </div>
            <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border border-hairline bg-card-hi p-3"><dt className="text-mute">Handoff at</dt><dd className="mt-1 text-ink">{view.handoff.handoff_at ? new Date(view.handoff.handoff_at).toLocaleString("en-US") : "Starts on delivery"}</dd></div>
              <div className="rounded-xl border border-hairline bg-card-hi p-3"><dt className="text-mute">5-business-day review deadline</dt><dd className="mt-1 text-ink">{view.handoff.review_deadline ?? "Starts on delivery"}</dd></div>
              <div className="rounded-xl border border-hairline bg-card-hi p-3"><dt className="text-mute">90-day defect deadline</dt><dd className="mt-1 text-ink">{view.handoff.defect_deadline ?? "Starts on delivery"}</dd></div>
              <div className="rounded-xl border border-hairline bg-card-hi p-3"><dt className="text-mute">Installed source</dt><dd className="mt-1 break-all text-ink">{view.handoff.installed_source_sha}</dd></div>
              <div className="rounded-xl border border-hairline bg-card-hi p-3"><dt className="text-mute">Vercel project</dt><dd className="mt-1 break-all text-ink">{view.handoff.vercel_project_ref}</dd></div>
              <div className="rounded-xl border border-hairline bg-card-hi p-3"><dt className="text-mute">Supabase project</dt><dd className="mt-1 break-all text-ink">{view.handoff.supabase_project_ref}</dd></div>
              <div className="rounded-xl border border-hairline bg-card-hi p-3"><dt className="text-mute">Initial admin</dt><dd className="mt-1 text-ink">{view.handoff.initial_admin_email}</dd></div>
              <div className="rounded-xl border border-hairline bg-card-hi p-3"><dt className="text-mute">Maintenance</dt><dd className="mt-1 text-ink">{view.handoff.maintenance_status}{view.handoff.maintenance_price_cents ? " / $197/month" : ""}</dd></div>
            </dl>
          </Card>

          <Card className="mt-5">
            <h2 className="text-xl font-semibold text-ink">Private handoff artifacts</h2>
            <p className="mt-1 text-sm text-subtle">Artifacts are versioned, checksum-addressed records. Replacing a document creates a new revision and does not alter the handoff date.</p>
            <div className="mt-4 grid gap-2">
              {view.artifacts.length === 0 ? <p className="text-sm text-mute">No artifacts uploaded yet.</p> : view.artifacts.map((artifact) => (
                <div key={artifact.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-card-hi p-3 text-sm">
                  <div><span className="font-medium text-ink">{artifact.kind.replaceAll("_", " ")}</span> <span className="text-mute">r{artifact.revision} · {artifact.byte_size.toLocaleString()} bytes · SHA {artifact.sha256.slice(0, 12)}…</span></div>
                  {artifact.signedUrl ? <a href={artifact.signedUrl} className="text-accent underline underline-offset-4">Download (15 min)</a> : null}
                </div>
              ))}
            </div>
            <form action={adminGenerateOsHandoffDocuments} className="mt-5">
              <input type="hidden" name="build_id" value={id} />
              <input type="hidden" name="handoff_id" value={view.handoff.id} />
              <Button type="submit" variant="primary">{view.handoff.status === "delivered" ? "Regenerate final PDF + manifest" : "Generate delivery PDF + manifest"}</Button>
            </form>
            <form action={adminUploadOsHandoffArtifact} className="mt-5 grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-end">
              <input type="hidden" name="build_id" value={id} />
              <input type="hidden" name="handoff_id" value={view.handoff.id} />
              <Field label="Artifact kind" htmlFor="artifact-kind">
                <select id="artifact-kind" name="kind" className="w-full rounded-xl border border-hairline bg-card-hi px-3.5 py-2.5 text-sm text-ink">
                  <option value="handoff_pdf">Handoff PDF</option>
                  <option value="manifest">Manifest</option>
                </select>
              </Field>
              <Field label="File" htmlFor="artifact-file">
                <input id="artifact-file" name="artifact" type="file" required className="block w-full rounded-xl border border-hairline bg-card-hi px-3 py-2 text-sm text-ink" />
              </Field>
              <Button type="submit">Upload revision</Button>
            </form>
            <p className="mt-3 text-xs text-mute">
              Source packages are intentionally not uploaded through Vercel. Build and upload the exact Git SHA with <span className="font-mono">scripts/build-whitelabel-source-package.mjs</span>; the script performs the secret/control-plane scan before private storage registration.
            </p>
            {view.handoff.status === "preparing" ? (
              <form action={adminFinalizeOsBuildHandoff} className="mt-5 rounded-xl border border-hairline bg-card-hi p-4">
                <input type="hidden" name="build_id" value={id} />
                <input type="hidden" name="handoff_id" value={view.handoff.id} />
                <p className="mb-3 text-sm text-subtle">Deliver only after the generated PDF, safe manifest, and matching secret-scanned source package are registered. Support windows begin at this action.</p>
                <Button type="submit" variant="primary">Deliver canonical handoff</Button>
              </form>
            ) : null}
          </Card>
        </>
      ) : (
        <Card className="mt-8">
          <h2 className="text-xl font-semibold text-ink">Record handoff</h2>
          {view.run?.status === "passed" ? (
            <>
              <p className="mt-2 text-sm text-subtle">Verification passed for source <span className="font-mono text-ink">{view.run.source_sha}</span>. Prepare the handoff now; support windows start only after all required artifacts are registered and delivery is finalized.</p>
              <form action={adminRecordOsBuildHandoff} className="mt-5">
                <input type="hidden" name="build_id" value={id} />
                <input type="hidden" name="run_id" value={view.run.id} />
                <Button type="submit" variant="primary">Prepare handoff</Button>
              </form>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-subtle">A passed handoff verification is required first.</p>
              <LinkButton href={`/admin/os-builds/${id}/verification`} className="mt-4">Open verification</LinkButton>
            </>
          )}
        </Card>
      )}
    </PageShell>
  );
}
