import { Badge, Button, Card, Field, Input, LinkButton, PageShell, Textarea, type Tone } from "@/components/ui";
import {
  adminCompleteOsRelease,
  adminCreateOsRelease,
  adminMarkOsReleaseReady,
  adminResumeOsRelease,
  adminWithdrawOsRelease,
} from "@/lib/actions/admin/os-updates";
import { loadReleasesForAdmin } from "@/lib/whitelabel/updates/persistence";

type UnknownRecord = Record<string, unknown>;

const FLASH: Record<string, string> = {
  "release-created": "Release created from the exact current runtime source and pinned customer migration snapshot.",
  "release-ready": "Release marked ready for managed rollout scheduling.",
  "release-resumed": "Paused release resumed.",
  "release-completed": "Release marked complete after all scheduled rollouts resolved.",
  "release-withdrawn": "Release withdrawn from future rollout scheduling.",
};

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function text(value: unknown, ...keys: string[]): string | null {
  const row = asRecord(value);
  if (!row) return null;
  for (const key of keys) {
    const candidate = row[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  }
  return null;
}

function number(value: unknown, ...keys: string[]): number | null {
  const row = asRecord(value);
  if (!row) return null;
  for (const key of keys) {
    const candidate = row[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string" && candidate.trim() && Number.isFinite(Number(candidate))) return Number(candidate);
  }
  return null;
}

function statusTone(value: string | null): Tone {
  if (["ready", "completed"].includes(value ?? "")) return "pos";
  if (["paused"].includes(value ?? "")) return "warn";
  if (["withdrawn"].includes(value ?? "")) return "neg";
  if (["running"].includes(value ?? "")) return "accent";
  return "default";
}

function label(value: string | null): string {
  return value ? value.replaceAll("_", " ") : "unknown";
}

function compactSha(value: string | null): string {
  if (!value) return "Not recorded";
  return value.length > 14 ? `${value.slice(0, 12)}…` : value;
}

function formatDate(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

export default async function OsUpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const flash = await searchParams;
  const view = await loadReleasesForAdmin();
  const releases: unknown[] = Array.isArray(view.releases) ? view.releases : [];

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-mute">OS Assembly Line · Releases</p>
          <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">Managed OS releases</h1>
          <p className="mt-3 max-w-3xl text-sm text-subtle">
            Create immutable update releases from the exact Assembly Line runtime source. Each release pins its customer migration SQL and SHA-256 digests before it can be marked ready for rollout scheduling.
          </p>
        </div>
        <LinkButton href="/admin/os-builds">OS builds</LinkButton>
      </div>

      {flash.ok ? (
        <p className="mt-6 rounded-xl border border-pos/30 bg-pos/[0.08] px-4 py-2.5 text-sm text-pos">
          {FLASH[flash.ok] ?? label(flash.ok)}
        </p>
      ) : null}
      {flash.error ? (
        <p className="mt-6 rounded-xl border border-neg/30 bg-neg/[0.08] px-4 py-2.5 text-sm text-neg">{flash.error}</p>
      ) : null}

      {!view.available ? (
        <Card className="mt-8">
          <h2 className="text-xl font-semibold text-ink">Ticket 6 control-plane migration not installed</h2>
          <p className="mt-2 max-w-3xl text-sm text-subtle">
            Release records are unavailable until the Ticket 6 control-plane schema exists. No customer installation depends on this page to keep operating.
          </p>
        </Card>
      ) : (
        <>
          <Card className="mt-8" accent>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
              <div>
                <h2 className="text-xl font-semibold text-ink">Create release snapshot</h2>
                <p className="mt-2 max-w-2xl text-sm text-subtle">
                  Release creation uses the exact current runtime Git SHA and snapshots the approved customer migration lineage with immutable SQL bodies and digests. It does not deploy to a customer by itself.
                </p>
                <div className="mt-4 grid gap-2 text-xs text-subtle">
                  <p>• Source SHA is pinned to the running Assembly Line build.</p>
                  <p>• Customer migration SQL is stored with SHA-256 provenance.</p>
                  <p>• Destructive in-place migration contracts are rejected before managed rollout.</p>
                </div>
              </div>
              <form action={adminCreateOsRelease} className="rounded-xl border border-accent/25 bg-card p-4">
                <Field label="Release key" htmlFor="release-key" hint="Stable operator-facing identifier, for example 2026.09.15-r1.">
                  <Input id="release-key" name="release_key" required maxLength={160} placeholder="2026.09.15-r1" />
                </Field>
                <Field label="Release notes" htmlFor="release-notes" className="mt-3">
                  <Textarea id="release-notes" name="release_notes" rows={4} maxLength={4000} placeholder="Safe summary of the customer-visible changes and rollout notes." />
                </Field>
                <Button type="submit" variant="primary" className="mt-4">Create immutable release</Button>
              </form>
            </div>
          </Card>

          <section className="mt-10">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-ink">Release history</h2>
                <p className="mt-1 text-sm text-subtle">Ready releases may be scheduled from an individual customer&apos;s Operations page.</p>
              </div>
              <span className="text-xs text-mute">Newest first</span>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {releases.map((release, index) => {
                const releaseId = text(release, "id") ?? `release-${index}`;
                const status = text(release, "status");
                const rolloutCount = number(release, "rollout_total", "rolloutTotal", "rollout_count", "rolloutCount");
                const rolloutCounts = asRecord(asRecord(release)?.rollout_counts);
                const succeededCount = rolloutCounts ? number(rolloutCounts, "succeeded") : null;
                const failedCount = rolloutCounts ? number(rolloutCounts, "failed") : null;
                const migrationCount = number(release, "migration_count", "migrationCount");
                return (
                  <Card key={releaseId}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-semibold text-ink">{text(release, "release_key", "releaseKey") ?? "Unnamed release"}</h3>
                        <p className="mt-1 font-mono text-xs text-mute" title={text(release, "source_sha", "sourceSha") ?? undefined}>
                          {compactSha(text(release, "source_sha", "sourceSha"))}
                        </p>
                      </div>
                      <Badge tone={statusTone(status)}>{label(status)}</Badge>
                    </div>

                    <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-hairline bg-card-hi p-3">
                        <dt className="text-[10px] uppercase tracking-[0.14em] text-mute">Schema release</dt>
                        <dd className="mt-1 break-all font-mono text-xs text-ink">{text(release, "schema_release", "schemaRelease") ?? "Not recorded"}</dd>
                      </div>
                      <div className="rounded-xl border border-hairline bg-card-hi p-3">
                        <dt className="text-[10px] uppercase tracking-[0.14em] text-mute">Created</dt>
                        <dd className="mt-1 text-sm text-ink">{formatDate(text(release, "created_at", "createdAt"))}</dd>
                      </div>
                      {migrationCount !== null ? (
                        <div className="rounded-xl border border-hairline bg-card-hi p-3">
                          <dt className="text-[10px] uppercase tracking-[0.14em] text-mute">Pinned migrations</dt>
                          <dd className="mt-1 text-sm text-ink">{migrationCount}</dd>
                        </div>
                      ) : null}
                      {rolloutCount !== null ? (
                        <div className="rounded-xl border border-hairline bg-card-hi p-3">
                          <dt className="text-[10px] uppercase tracking-[0.14em] text-mute">Rollouts</dt>
                          <dd className="mt-1 text-sm text-ink">
                            {rolloutCount}{succeededCount !== null ? ` · ${succeededCount} succeeded` : ""}{failedCount !== null ? ` · ${failedCount} failed` : ""}
                          </dd>
                        </div>
                      ) : null}
                    </dl>

                    {text(release, "release_notes", "releaseNotes") ? (
                      <p className="mt-4 whitespace-pre-wrap text-sm text-subtle">{text(release, "release_notes", "releaseNotes")}</p>
                    ) : null}

                    <div className="mt-5 flex flex-wrap gap-2 border-t border-hairline pt-4">
                      {status === "draft" ? (
                        <form action={adminMarkOsReleaseReady}>
                          <input type="hidden" name="release_id" value={releaseId} />
                          <Button type="submit" variant="primary">Mark ready</Button>
                        </form>
                      ) : null}
                      {status === "paused" ? (
                        <form action={adminResumeOsRelease}>
                          <input type="hidden" name="release_id" value={releaseId} />
                          <Button type="submit" variant="primary">Resume release</Button>
                        </form>
                      ) : null}
                      {status === "running" ? (
                        <form action={adminCompleteOsRelease}>
                          <input type="hidden" name="release_id" value={releaseId} />
                          <Button type="submit" variant="primary">Complete release</Button>
                        </form>
                      ) : null}
                      {status !== "withdrawn" && status !== "completed" ? (
                        <form action={adminWithdrawOsRelease}>
                          <input type="hidden" name="release_id" value={releaseId} />
                          <Button type="submit" variant="danger">Withdraw</Button>
                        </form>
                      ) : null}
                    </div>
                  </Card>
                );
              })}
            </div>

            {releases.length === 0 ? (
              <Card className="mt-4">
                <p className="text-sm text-subtle">No Ticket 6 release snapshots have been created yet.</p>
              </Card>
            ) : null}
          </section>
        </>
      )}
    </PageShell>
  );
}
