import { notFound } from "next/navigation";
import { Badge, Button, Card, Field, Input, LinkButton, PageShell, Textarea, type Tone } from "@/components/ui";
import {
  adminBeginOsCompatibilityRejoin as adminStartOsCompatibilityCheck,
  adminBootstrapOsOperations as adminInitializeOsOperations,
  adminAdvanceOsUpdate,
  adminEnterOsIndependentOperation as adminSetOsIndependent,
  adminScheduleOsUpdate,
  adminStartOsRecovery,
  adminSyncOsEntitlements,
  adminTransitionOsMaintenance as adminSetOsMaintenance,
} from "@/lib/actions/admin/os-updates";
import { loadOsBuildForAdmin } from "@/lib/whitelabel/admin";
import { loadOperationsForAdmin } from "@/lib/whitelabel/updates/persistence";

type UnknownRecord = Record<string, unknown>;

const FLASH: Record<string, string> = {
  "operations-bootstrapped": "Post-handoff operations initialized from the canonical handoff.",
  initialized: "Post-handoff operations initialized from the canonical handoff.",
  "maintenance-updated": "Maintenance state updated.",
  "maintenance-saved": "Maintenance state updated.",
  "entitlements-synced": "Purchased additions synchronized into the managed entitlement ledger.",
  "independent-operation": "Installation moved to independent operation.",
  independent: "Installation moved to independent operation.",
  "rejoin-complete": "Compatibility passed and the installation rejoined managed operation.",
  "rejoin-blocked": "Compatibility did not pass. The installation remains in rejoin review.",
  "compatibility-started": "Compatibility and rejoin verification started.",
  "update-scheduled": "Managed update scheduled with its notice window.",
  "update-advanced": "Update lifecycle advanced to its next safe checkpoint.",
  "recovery-advanced": "Recovery lifecycle advanced.",
  "recovery-started": "Recovery started for the failed managed update.",
};

const selectClass =
  "w-full rounded-xl border border-hairline bg-card-hi px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-accent";

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

function bool(value: unknown, ...keys: string[]): boolean | null {
  const row = asRecord(value);
  if (!row) return null;
  for (const key of keys) {
    if (typeof row[key] === "boolean") return row[key] as boolean;
  }
  return null;
}

function nested(value: unknown, ...keys: string[]): UnknownRecord | null {
  const row = asRecord(value);
  if (!row) return null;
  for (const key of keys) {
    const candidate = asRecord(row[key]);
    if (candidate) return candidate;
  }
  return null;
}

function label(value: string | null | undefined): string {
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

function statusTone(value: string | null): Tone {
  if (!value) return "default";
  if (["active", "managed", "ready", "succeeded", "verified", "completed", "passed"].includes(value)) return "pos";
  if (["failed", "recovery_required", "blocked", "withdrawn", "ended"].includes(value)) return "neg";
  if (["paused", "pending_delivery", "rejoining", "recovering", "verifying", "notified", "scheduled"].includes(value)) return "warn";
  if (["running", "queued", "draft", "pending"].includes(value)) return "accent";
  return "default";
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function releaseFor(releases: unknown[], releaseId: string | null): UnknownRecord | null {
  if (!releaseId) return null;
  return releases.map(asRecord).find((release) => release && text(release, "id") === releaseId) ?? null;
}

function rolloutAttempt(rollout: unknown): UnknownRecord | null {
  return nested(rollout, "attempt", "latestAttempt", "latest_attempt", "updateAttempt", "update_attempt");
}

function rolloutRecovery(rollout: unknown): UnknownRecord | null {
  return nested(rollout, "recovery", "latestRecovery", "latest_recovery", "recoveryRun", "recovery_run");
}

function attemptId(rollout: unknown): string | null {
  const attempt = rolloutAttempt(rollout);
  return text(attempt, "id")
    ?? text(rollout, "update_attempt_id", "updateAttemptId", "attempt_id", "attemptId");
}

function installationMode(installation: unknown): string {
  return text(installation, "operation_mode", "operationMode")
    ?? (bool(installation, "managed_mode", "managedMode") === false ? "independent" : "managed");
}

function HiddenLifecycleIds({ buildId, installationId, rolloutId, attempt }: {
  buildId: string;
  installationId?: string | null;
  rolloutId?: string | null;
  attempt?: string | null;
}) {
  return (
    <>
      <input type="hidden" name="build_id" value={buildId} />
      {installationId ? <input type="hidden" name="installation_id" value={installationId} /> : null}
      {rolloutId ? <input type="hidden" name="rollout_id" value={rolloutId} /> : null}
      {attempt ? <input type="hidden" name="attempt_id" value={attempt} /> : null}
    </>
  );
}

function SummaryTile({ label: title, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-hairline bg-card-hi p-3">
      <dt className="text-[10px] uppercase tracking-[0.15em] text-mute">{title}</dt>
      <dd className={`mt-1 break-all text-sm text-ink ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

export default async function OsBuildOperationsPage({
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
    loadOperationsForAdmin(id),
  ]);
  if (!build) notFound();

  const installation = asRecord(view.installation);
  const currentVersion = asRecord(view.currentVersion);
  const versions = array(view.versions);
  const maintenanceEvents = array(view.maintenanceEvents);
  const entitlements = array(view.entitlements);
  const rollouts = array(view.rollouts);
  const releases = array(view.releases);
  const activeRollout = asRecord(view.activeRollout);

  const installationId = text(installation, "id");
  const mode = installationMode(installation);
  const maintenanceStatus = text(installation, "maintenance_status", "maintenanceStatus") ?? "unknown";
  const sourceSha = text(currentVersion, "source_sha", "sourceSha")
    ?? text(installation, "current_source_sha", "currentSourceSha");
  const schemaRelease = text(currentVersion, "schema_release", "schemaRelease")
    ?? text(installation, "current_schema_release", "currentSchemaRelease");
  const activeRolloutId = text(activeRollout, "id");
  const activeAttempt = rolloutAttempt(activeRollout);
  const activeAttemptId = attemptId(activeRollout);
  const activeAttemptStatus = text(activeAttempt, "status")
    ?? text(activeRollout, "attempt_status", "attemptStatus");
  const activeStage = text(activeAttempt, "stage")
    ?? text(activeRollout, "attempt_stage", "attemptStage");
  const activeRecovery = rolloutRecovery(activeRollout);
  const activeRecoveryStatus = text(activeRecovery, "status")
    ?? text(activeRollout, "recovery_status", "recoveryStatus");
  const hasBlockingOperation = rollouts.some((rollout) => {
    const status = text(rolloutAttempt(rollout), "status")
      ?? text(rollout, "attempt_status", "attemptStatus");
    const recoveryStatus = text(rolloutRecovery(rollout), "status")
      ?? text(rollout, "recovery_status", "recoveryStatus");
    return ["scheduled", "running", "awaiting_verification", "paused", "recovery_required"].includes(status ?? "")
      || ["pending", "running"].includes(recoveryStatus ?? "");
  });
  const canSchedule = Boolean(
    installationId
    && mode === "managed"
    && maintenanceStatus === "active"
    && !hasBlockingOperation,
  );

  const schedulableReleases = releases.filter((release) => {
    const status = text(release, "status");
    return status === "ready" || status === "running";
  });

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-mute">OS Assembly Line · Operations</p>
          <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">{build.agency_name}</h1>
          <p className="mt-2 max-w-3xl text-sm text-subtle">
            Post-handoff maintenance, installed versions, managed updates, recovery, and independent-operation lifecycle.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/admin/os-updates">Managed releases</LinkButton>
          <LinkButton href={`/admin/os-builds/${id}/handoff`}>Handoff</LinkButton>
          <LinkButton href={`/admin/os-builds/${id}`}>Build</LinkButton>
        </div>
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
            Operations history and managed update actions are unavailable until the Ticket 6 control-plane schema exists. The handed-off customer OS remains independently operable.
          </p>
        </Card>
      ) : !installation ? (
        <Card className="mt-8" accent>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-ink">Initialize post-handoff operations</h2>
              <p className="mt-2 max-w-2xl text-sm text-subtle">
                Bootstrap the durable installation and version ledger from this build&apos;s delivered canonical handoff.
              </p>
            </div>
            <form action={adminInitializeOsOperations}>
              <input type="hidden" name="build_id" value={id} />
              <Button type="submit" variant="primary">Initialize operations</Button>
            </form>
          </div>
        </Card>
      ) : (
        <>
          <section className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-ink">Installation status</h2>
                  <p className="mt-1 text-sm text-subtle">Canonical state after handoff and every verified managed update.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={statusTone(mode)}>{label(mode)}</Badge>
                  <Badge tone={statusTone(maintenanceStatus)}>maintenance {label(maintenanceStatus)}</Badge>
                </div>
              </div>
              <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <SummaryTile label="Source SHA" value={sourceSha ?? "Not recorded"} mono />
                <SummaryTile label="Schema release" value={schemaRelease ?? "Not recorded"} mono />
                <SummaryTile label="Installed version" value={text(currentVersion, "ordinal") ? `v${text(currentVersion, "ordinal")}` : text(currentVersion, "id") ?? "Not recorded"} />
                <SummaryTile label="OS URL" value={text(installation, "os_url", "osUrl") ?? text(currentVersion, "deployment_url", "deploymentUrl") ?? build.domain} />
                <SummaryTile label="Independent since" value={formatDate(text(installation, "independent_since", "independentSince"))} />
                <SummaryTile label="Last rejoined" value={formatDate(text(installation, "rejoined_at", "rejoinedAt"))} />
              </dl>
            </Card>

            <Card>
              <h2 className="text-xl font-semibold text-ink">Lifecycle controls</h2>
              <p className="mt-1 text-sm text-subtle">
                Managed updates require active maintenance. Independent operation keeps the customer OS running without control-plane update authority.
              </p>

              <div className="mt-5 grid gap-3">
                <form action={adminSetOsMaintenance} className="rounded-xl border border-hairline bg-card-hi p-4">
                  <HiddenLifecycleIds buildId={id} installationId={installationId} />
                  <Field label="Maintenance state" htmlFor="maintenance-status">
                    <select id="maintenance-status" name="maintenance_status" defaultValue={maintenanceStatus === "unknown" ? "active" : maintenanceStatus} className={selectClass}>
                      {maintenanceStatus === "declined" ? <option value="declined">Declined</option> : null}
                      {maintenanceStatus === "ended" ? <option value="ended">Ended</option> : null}
                      <option value="active">Active</option>
                      {maintenanceStatus === "active" || maintenanceStatus === "paused" ? <option value="paused">Paused</option> : null}
                      {maintenanceStatus === "active" || maintenanceStatus === "paused" ? <option value="ended">Ended</option> : null}
                    </select>
                  </Field>
                  <Field label="Reason" htmlFor="maintenance-reason" className="mt-3">
                    <Input id="maintenance-reason" name="reason" placeholder="Optional lifecycle note" />
                  </Field>
                  <Button type="submit" className="mt-3">Save maintenance</Button>
                </form>

                {mode === "managed" ? (
                  <form action={adminSetOsIndependent} className="rounded-xl border border-warn/30 bg-warn/[0.04] p-4">
                    <HiddenLifecycleIds buildId={id} installationId={installationId} />
                    <h3 className="text-sm font-semibold text-ink">Move to independent operation</h3>
                    <p className="mt-1 text-xs text-subtle">Stops future managed rollouts for this installation. Existing customer runtime continues operating.</p>
                    <Field label="Reason" htmlFor="independent-reason" className="mt-3">
                      <Textarea id="independent-reason" name="reason" rows={2} required placeholder="Record why managed operation is ending" />
                    </Field>
                    <Button type="submit" variant="danger" className="mt-3">Enter independent mode</Button>
                  </form>
                ) : (
                  <div className="grid gap-3">
                    <form action={adminStartOsCompatibilityCheck} className="rounded-xl border border-accent/30 bg-accent/[0.04] p-4">
                      <HiddenLifecycleIds buildId={id} installationId={installationId} />
                      <h3 className="text-sm font-semibold text-ink">Compatibility and managed rejoin</h3>
                      <p className="mt-1 text-xs text-subtle">
                        Rejoining requires active maintenance and a fresh compatibility check against the installed source, schema lineage, migration markers, and provider access.
                      </p>
                      <Button type="submit" variant="primary" className="mt-3" disabled={maintenanceStatus !== "active"}>
                        {mode === "rejoining" ? "Retry compatibility check" : "Start compatibility check"}
                      </Button>
                      {maintenanceStatus !== "active" ? <p className="mt-2 text-xs text-warn">Activate maintenance before starting managed rejoin verification.</p> : null}
                    </form>
                    {mode === "rejoining" ? (
                      <form action={adminSetOsIndependent} className="rounded-xl border border-hairline bg-card-hi p-4">
                        <HiddenLifecycleIds buildId={id} installationId={installationId} />
                        <input type="hidden" name="reason" value="Compatibility rejoin cancelled by admin." />
                        <p className="text-xs text-subtle">Cancel this rejoin attempt and keep the customer installation outside managed updates.</p>
                        <Button type="submit" className="mt-3">Return to independent mode</Button>
                      </form>
                    ) : null}
                  </div>
                )}
              </div>
            </Card>
          </section>

          <section className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)]">
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-ink">Managed update</h2>
                  <p className="mt-1 max-w-2xl text-sm text-subtle">
                    Schedule an immutable release only after customer notice and a maintenance window are recorded.
                  </p>
                </div>
                {activeRolloutId ? <Badge tone={statusTone(text(activeRollout, "status"))}>{label(text(activeRollout, "status"))}</Badge> : <Badge>No active rollout</Badge>}
              </div>

              {activeRolloutId ? (
                <div className="mt-5 rounded-xl border border-hairline bg-card-hi p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-mute">Active rollout</p>
                      <p className="mt-1 font-mono text-sm text-ink">{activeRolloutId}</p>
                    </div>
                    {activeAttemptStatus ? <Badge tone={statusTone(activeAttemptStatus)}>attempt {label(activeAttemptStatus)}</Badge> : null}
                  </div>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <SummaryTile label="Stage" value={label(activeStage)} />
                    <SummaryTile label="Scheduled" value={formatDate(text(activeRollout, "scheduled_at", "scheduledAt", "scheduled_for", "scheduledFor"))} />
                    <SummaryTile label="Notice" value={formatDate(text(activeRollout, "notification_at", "notificationAt", "notice_sent_at", "noticeSentAt"))} />
                    <SummaryTile label="Recovery" value={label(activeRecoveryStatus)} />
                  </dl>
                  {text(activeAttempt, "last_error", "lastError") ?? text(activeRollout, "last_error", "lastError") ? (
                    <p className="mt-4 rounded-lg border border-neg/30 bg-neg/[0.06] p-3 text-sm text-neg">
                      {text(activeAttempt, "last_error", "lastError") ?? text(activeRollout, "last_error", "lastError")}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {activeAttemptId && activeAttemptStatus !== "recovery_required" && activeAttemptStatus !== "recovered" ? (
                      <form action={adminAdvanceOsUpdate}>
                        <HiddenLifecycleIds buildId={id} installationId={installationId} rolloutId={activeRolloutId} attempt={activeAttemptId} />
                        <Button type="submit" variant="primary">Advance update</Button>
                      </form>
                    ) : null}
                    {activeAttemptId && (activeAttemptStatus === "recovery_required" || activeRecoveryStatus === "failed" || text(activeRollout, "status") === "failed") ? (
                      <form action={adminStartOsRecovery}>
                        <HiddenLifecycleIds buildId={id} installationId={installationId} rolloutId={activeRolloutId} attempt={activeAttemptId} />
                        {text(activeRecovery, "id") ? <input type="hidden" name="recovery_run_id" value={text(activeRecovery, "id") ?? ""} /> : null}
                        <Button type="submit" variant="danger">Start / continue recovery</Button>
                      </form>
                    ) : null}
                  </div>
                </div>
              ) : (
                <form action={adminScheduleOsUpdate} className="mt-5 grid gap-4 md:grid-cols-2">
                  <HiddenLifecycleIds buildId={id} installationId={installationId} />
                  <Field label="Release" htmlFor="release-id" className="md:col-span-2">
                    <select id="release-id" name="release_id" className={selectClass} required disabled={!canSchedule || schedulableReleases.length === 0}>
                      <option value="">Choose a ready release</option>
                      {schedulableReleases.map((release) => {
                        const releaseId = text(release, "id");
                        if (!releaseId) return null;
                        return (
                          <option key={releaseId} value={releaseId}>
                            {text(release, "release_key", "releaseKey") ?? compactSha(text(release, "source_sha", "sourceSha"))} · {text(release, "schema_release", "schemaRelease") ?? "schema unchanged"}
                          </option>
                        );
                      })}
                    </select>
                  </Field>
                  <div className="rounded-xl border border-hairline bg-card-hi p-3 text-sm text-subtle">
                    <span className="block text-[10px] uppercase tracking-[0.14em] text-mute">Customer notice</span>
                    <span className="mt-1 block">Notice is recorded at the time this rollout is scheduled.</span>
                  </div>
                  <Field label="Scheduled maintenance time (UTC)" htmlFor="scheduled-at" hint="Preflight will not mutate the installation before this time.">
                    <Input id="scheduled-at" name="scheduled_at" type="datetime-local" required disabled={!canSchedule} />
                  </Field>
                  <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                    <Button type="submit" variant="primary" disabled={!canSchedule || schedulableReleases.length === 0}>Schedule managed update</Button>
                    {!canSchedule ? <span className="text-xs text-warn">Requires managed mode, active maintenance, and no active rollout.</span> : null}
                    {canSchedule && schedulableReleases.length === 0 ? <span className="text-xs text-mute">No schedulable release is available.</span> : null}
                  </div>
                </form>
              )}
            </Card>

            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-ink">Entitlements</h2>
                  <p className="mt-1 text-sm text-subtle">Purchased/base capabilities that a rollout must preserve or verify before mutation.</p>
                </div>
                <form action={adminSyncOsEntitlements}>
                  <HiddenLifecycleIds buildId={id} installationId={installationId} />
                  <Button type="submit">Sync purchased additions</Button>
                </form>
              </div>
              <div className="mt-4 grid gap-2">
                {entitlements.length === 0 ? <p className="text-sm text-mute">No entitlement records.</p> : entitlements.map((entitlement, index) => {
                  const entitlementId = text(entitlement, "id") ?? `entitlement-${index}`;
                  const status = text(entitlement, "status");
                  return (
                    <div key={entitlementId} className="rounded-xl border border-hairline bg-card-hi p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-ink">{text(entitlement, "name") ?? text(entitlement, "entitlement_key", "entitlementKey") ?? "Entitlement"}</p>
                          <p className="mt-0.5 text-xs text-mute">{text(entitlement, "entitlement_key", "entitlementKey") ?? text(entitlement, "source_kind", "sourceKind") ?? ""}</p>
                        </div>
                        <Badge tone={statusTone(status)}>{label(status)}</Badge>
                      </div>
                      {text(entitlement, "preservation_notes", "preservationNotes") ? <p className="mt-2 text-xs text-subtle">{text(entitlement, "preservation_notes", "preservationNotes")}</p> : null}
                    </div>
                  );
                })}
              </div>
            </Card>
          </section>

          <section className="mt-8 grid gap-4 xl:grid-cols-2">
            <Card>
              <h2 className="text-xl font-semibold text-ink">Installed version history</h2>
              <p className="mt-1 text-sm text-subtle">Append-only ledger. The current pointer advances only after verified promotion.</p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="text-[10px] uppercase tracking-[0.14em] text-mute">
                    <tr>
                      <th className="pb-2 pr-4 font-medium">Version</th>
                      <th className="pb-2 pr-4 font-medium">Source</th>
                      <th className="pb-2 pr-4 font-medium">Schema</th>
                      <th className="pb-2 pr-4 font-medium">Origin</th>
                      <th className="pb-2 font-medium">Promoted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {versions.map((version, index) => {
                      const versionId = text(version, "id") ?? `version-${index}`;
                      const isCurrent = versionId === text(currentVersion, "id");
                      return (
                        <tr key={versionId}>
                          <td className="py-3 pr-4"><span className="font-medium text-ink">v{text(version, "ordinal") ?? String(versions.length - index)}</span>{isCurrent ? <Badge tone="pos" className="ml-2">current</Badge> : null}</td>
                          <td className="py-3 pr-4 font-mono text-xs text-subtle" title={text(version, "source_sha", "sourceSha") ?? undefined}>{compactSha(text(version, "source_sha", "sourceSha"))}</td>
                          <td className="py-3 pr-4 font-mono text-xs text-subtle">{text(version, "schema_release", "schemaRelease") ?? "—"}</td>
                          <td className="py-3 pr-4 text-subtle">{label(text(version, "origin_kind", "origin", "originKind"))}</td>
                          <td className="py-3 text-subtle">{formatDate(text(version, "promoted_at", "created_at", "createdAt"))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {versions.length === 0 ? <p className="mt-4 text-sm text-mute">No installed versions recorded.</p> : null}
            </Card>

            <Card>
              <h2 className="text-xl font-semibold text-ink">Maintenance history</h2>
              <p className="mt-1 text-sm text-subtle">Lifecycle events remain separate from the immutable maintenance decision captured at handoff.</p>
              <div className="mt-4 grid gap-2">
                {maintenanceEvents.length === 0 ? <p className="text-sm text-mute">No maintenance events recorded.</p> : maintenanceEvents.map((event, index) => {
                  const eventId = text(event, "id") ?? `maintenance-${index}`;
                  const kind = text(event, "event_type", "event_kind", "eventKind");
                  const detail = nested(event, "detail", "safe_metadata", "safeMetadata");
                  const previousState = text(event, "previous_status", "previousStatus") ?? text(detail, "previousMode", "previous_mode");
                  const nextState = text(event, "new_status", "newStatus") ?? text(detail, "newMode", "new_mode");
                  return (
                    <div key={eventId} className="rounded-xl border border-hairline bg-card-hi p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge tone={statusTone(nextState)}>{label(kind)}</Badge>
                        <span className="text-xs text-mute">{formatDate(text(event, "recorded_at", "recordedAt", "created_at"))}</span>
                      </div>
                      <p className="mt-2 text-sm text-subtle">
                        {label(previousState)} → <span className="text-ink">{label(nextState)}</span>
                      </p>
                      {text(event, "reason") ? <p className="mt-1 text-xs text-subtle">{text(event, "reason")}</p> : null}
                    </div>
                  );
                })}
              </div>
            </Card>
          </section>

          <Card className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-ink">Update and recovery history</h2>
                <p className="mt-1 text-sm text-subtle">Every rollout remains visible after success, failure, cancellation, or recovery.</p>
              </div>
              <span className="text-xs text-mute">Newest first</span>
            </div>
            <div className="mt-4 grid gap-3">
              {rollouts.length === 0 ? <p className="text-sm text-mute">No managed rollout has been scheduled.</p> : rollouts.map((rollout, index) => {
                const rolloutId = text(rollout, "id") ?? `rollout-${index}`;
                const releaseId = text(rollout, "release_id", "releaseId");
                const release = releaseFor(releases, releaseId);
                const attempt = rolloutAttempt(rollout);
                const recovery = rolloutRecovery(rollout);
                const rolloutStatus = text(rollout, "status");
                const attemptStatus = text(attempt, "status") ?? text(rollout, "attempt_status", "attemptStatus");
                const attemptStage = text(attempt, "stage") ?? text(rollout, "attempt_stage", "attemptStage");
                const recoveryStatus = text(recovery, "status") ?? text(rollout, "recovery_status", "recoveryStatus");
                const historyAttemptId = attemptId(rollout);
                const targetSha = text(release, "source_sha", "sourceSha") ?? text(rollout, "target_source_sha", "targetSourceSha");
                const targetSchema = text(release, "schema_release", "schemaRelease") ?? text(rollout, "target_schema_release", "targetSchemaRelease");
                const error = text(attempt, "last_error", "lastError") ?? text(recovery, "last_error", "lastError") ?? text(rollout, "last_error", "lastError");
                return (
                  <div key={rolloutId} className="rounded-xl border border-hairline bg-card-hi p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">{text(release, "release_key", "releaseKey") ?? `Release ${compactSha(targetSha)}`}</p>
                        <p className="mt-1 text-xs text-mute">{targetSchema ?? "Schema unchanged/unknown"} · rollout {rolloutId}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={statusTone(rolloutStatus)}>{label(rolloutStatus)}</Badge>
                        {attemptStatus ? <Badge tone={statusTone(attemptStatus)}>attempt {label(attemptStatus)}</Badge> : null}
                        {recoveryStatus ? <Badge tone={statusTone(recoveryStatus)}>recovery {label(recoveryStatus)}</Badge> : null}
                      </div>
                    </div>
                    <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <SummaryTile label="Stage" value={label(attemptStage)} />
                      <SummaryTile label="Notice" value={formatDate(text(rollout, "notification_at", "notificationAt", "notice_sent_at", "noticeSentAt"))} />
                      <SummaryTile label="Scheduled" value={formatDate(text(rollout, "scheduled_at", "scheduledAt", "scheduled_for", "scheduledFor"))} />
                      <SummaryTile label="Completed" value={formatDate(text(rollout, "completed_at", "completedAt"))} />
                    </dl>
                    {error ? <p className="mt-3 rounded-lg border border-neg/30 bg-neg/[0.05] p-3 text-xs text-neg">{error}</p> : null}
                    {historyAttemptId && (attemptStatus === "recovery_required" || recoveryStatus === "failed" || rolloutStatus === "failed") ? (
                      <form action={adminStartOsRecovery} className="mt-4">
                        <HiddenLifecycleIds buildId={id} installationId={installationId} rolloutId={rolloutId} attempt={historyAttemptId} />
                        <Button type="submit" variant="danger">Start / continue recovery</Button>
                      </form>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </PageShell>
  );
}
