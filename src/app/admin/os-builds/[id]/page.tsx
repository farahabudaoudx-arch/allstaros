import Image from "next/image";
import { notFound } from "next/navigation";
import { BuildIntakeFields } from "@/components/admin/os-builds/BuildIntakeFields";
import { ReadinessPanel } from "@/components/admin/os-builds/ReadinessPanel";
import { ProvisioningPanel } from "@/components/admin/os-builds/ProvisioningPanel";
import { Badge, Button, Card, Field, Input, LinkButton, PageShell, Textarea } from "@/components/ui";
import {
  adminAddOsBuildAddition,
  adminAddOsBuildCarrier,
  adminDeleteOsBuildCarrier,
  adminDeleteOsBuildAddition,
  adminSaveOsBuild,
  adminSaveOsBuildService,
  adminUpdateOsBuildAddition,
  adminUpdateOsBuildCarrier,
  adminUploadOsBuildFavicon,
  adminUploadOsBuildLogo,
  adminVerifyOsBuildAiAccess,
  adminVerifyOsBuildEmailAccess,
  adminVerifyOsBuildProviderAccess,
  adminVerifyOsBuildVideoAccess,
} from "@/lib/actions/admin/os-builds";
import {
  ADDITION_TYPE_LABELS,
  SERVICE_CATALOG,
  SERVICE_STATUS_LABELS,
} from "@/lib/whitelabel/catalog";
import { loadOsBuildForAdmin } from "@/lib/whitelabel/admin";
import { loadProvisioningForAdmin } from "@/lib/whitelabel/provisioning/admin";
import type {
  AdditionStatus,
  AdditionType,
  ServiceStatus,
  WhitelabelBuildAddition,
  WhitelabelBuildCarrierLink,
  WhitelabelServiceConnection,
} from "@/lib/whitelabel/types";

const FLASH: Record<string, string> = {
  created: "Build created. Continue the same build as onboarding information becomes available.",
  saved: "Intake saved.",
  "service-saved": "Service reference saved.",
  "service-verified": "Provider API confirmed access to the saved customer project.",
  "addition-added": "Purchased work added to the delivery scope.",
  "addition-saved": "Purchased work saved.",
  "addition-deleted": "Purchased work removed.",
  "logo-saved": "Brand logo saved.",
  "favicon-saved": "Favicon saved.",
  "carrier-added": "Carrier portal added.",
  "carrier-saved": "Carrier portal saved.",
  "carrier-deleted": "Carrier portal removed.",
  "provisioning-started": "Clean provisioning run created.",
  "provisioning-advanced": "Provisioning step processed. Review the current state below.",
};

const selectClass =
  "w-full rounded-xl border border-hairline bg-card-hi px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-accent";

function serviceTone(status: ServiceStatus): "default" | "accent" | "pos" | "warn" | "neg" {
  if (status === "verified") return "pos";
  if (status === "failed") return "neg";
  if (status === "needs_owner_action") return "warn";
  if (status === "provided") return "accent";
  return "default";
}

export default async function OsBuildDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const flash = await searchParams;
  const [build, provisioning] = await Promise.all([
    loadOsBuildForAdmin(id),
    loadProvisioningForAdmin(id),
  ]);
  if (!build) notFound();

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-mute">OS Assembly Line</p>
          <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
            {build.agency_name}
          </h1>
          <p className="mt-2 text-sm text-subtle">{build.product_name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/admin/os-builds/${build.id}/verification`}>Verification</LinkButton>
          <LinkButton href={`/admin/os-builds/${build.id}/handoff`}>Handoff</LinkButton>
          <LinkButton href="/admin/os-builds">All builds</LinkButton>
        </div>
      </div>

      {flash.ok ? (
        <p className="mt-6 rounded-xl border border-pos/30 bg-pos/[0.08] px-4 py-2.5 text-sm text-pos">
          {FLASH[flash.ok] ?? "Saved."}
        </p>
      ) : null}
      {flash.error ? (
        <p className="mt-6 rounded-xl border border-neg/30 bg-neg/[0.08] px-4 py-2.5 text-sm text-neg">
          {flash.error}
        </p>
      ) : null}

      <div className="mt-8">
        <ReadinessPanel readiness={build.readiness} />
      </div>
      <ProvisioningPanel
        buildId={build.id}
        ready={build.readiness.ready}
        sourceSha={process.env.WHITELABEL_SOURCE_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? ""}
        view={provisioning}
      />

      <section className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-ink">Intake</h2>
            <p className="mt-1 text-sm text-subtle">
              Save partial intake safely. Readiness stays blocked until required launch information is complete.
            </p>
          </div>
          <form action={adminSaveOsBuild}>
            <input type="hidden" name="build_id" value={build.id} />
            <BuildIntakeFields build={build} />
            <div className="mt-6 flex justify-end">
              <Button type="submit" variant="primary">Save intake</Button>
            </div>
          </form>
        </Card>

        <Card>
          <h2 className="text-xl font-semibold text-ink">Brand assets</h2>
          <p className="mt-1 text-sm text-subtle">
            Private intake assets for this build. Ticket 2 will apply them across the customer OS.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-subtle">
            <div className="rounded-xl border border-hairline bg-card-hi p-3">
              <span className="block text-mute">Primary</span>
              <span className="mt-1 block font-mono text-ink">{build.brand_primary_color || "Not set"}</span>
            </div>
            <div className="rounded-xl border border-hairline bg-card-hi p-3">
              <span className="block text-mute">Accent</span>
              <span className="mt-1 block font-mono text-ink">{build.brand_accent_color || "Not set"}</span>
            </div>
          </div>
          <div className="mt-5 flex min-h-28 items-center justify-center rounded-xl border border-dashed border-hairline bg-card-hi p-4">
            {build.logoUrl ? (
              <Image
                src={build.logoUrl}
                alt={`${build.agency_name} logo`}
                width={240}
                height={96}
                unoptimized
                className="max-h-24 w-auto max-w-full object-contain"
              />
            ) : (
              <span className="text-sm text-mute">No logo uploaded</span>
            )}
          </div>
          <form action={adminUploadOsBuildLogo} className="mt-5">
            <input type="hidden" name="build_id" value={build.id} />
            <Field label="PNG, JPEG, or WebP — max 5 MB" htmlFor="logo">
              <Input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" required />
            </Field>
            <Button type="submit" className="mt-4">Upload logo</Button>
          </form>
          <div className="mt-6 border-t border-hairline pt-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-hairline bg-card-hi">
                {build.faviconUrl ? (
                  <Image
                    src={build.faviconUrl}
                    alt={`${build.agency_name} favicon`}
                    width={32}
                    height={32}
                    unoptimized
                    className="h-8 w-8 object-contain"
                  />
                ) : (
                  <span className="text-[10px] text-mute">None</span>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink">Favicon</h3>
                <p className="text-xs text-subtle">PNG or ICO, max 1 MB.</p>
              </div>
            </div>
            <form action={adminUploadOsBuildFavicon} className="mt-4">
              <input type="hidden" name="build_id" value={build.id} />
              <Field label="Favicon file" htmlFor="favicon">
                <Input id="favicon" name="favicon" type="file" accept="image/png,image/x-icon,image/vnd.microsoft.icon,.ico" required />
              </Field>
              <Button type="submit" className="mt-4">Upload favicon</Button>
            </form>
          </div>
        </Card>
      </section>

      <section className="mt-10">
        <div>
          <h2 className="text-2xl font-semibold text-ink">Service accounts & access</h2>
          <p className="mt-1 max-w-3xl text-sm text-subtle">
            Store only safe account/project references here. “Reference provided” is not the same as verified access. Passwords, API keys, tokens, and private credentials belong in secure provider configuration.
          </p>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {build.services.map((service) => (
            <ServiceCard key={service.id} buildId={build.id} service={service} />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div>
          <h2 className="text-2xl font-semibold text-ink">Supported carriers & portals</h2>
          <p className="mt-1 max-w-3xl text-sm text-subtle">
            Configure only the customer&apos;s supported carrier portal links. This does not add underwriting rules for a carrier.
          </p>
        </div>
        <Card className="mt-4">
          <h3 className="text-lg font-semibold text-ink">Add carrier portal</h3>
          <form action={adminAddOsBuildCarrier} className="mt-4">
            <input type="hidden" name="build_id" value={build.id} />
            <CarrierFields />
            <Button type="submit" variant="primary" className="mt-4">Add carrier</Button>
          </form>
        </Card>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {build.carriers.map((carrier) => (
            <CarrierCard key={carrier.id} buildId={build.id} carrier={carrier} />
          ))}
          {build.carriers.length === 0 ? (
            <p className="text-sm text-mute">No customer carrier portals configured. The clean installation will not inherit All Star carrier links.</p>
          ) : null}
        </div>
      </section>

      <section className="mt-10">
        <div>
          <h2 className="text-2xl font-semibold text-ink">Purchased additions</h2>
          <p className="mt-1 max-w-3xl text-sm text-subtle">
            Keep separately priced imports, provider replacements, custom AI, websites, SMS, and other custom work attached to this build&apos;s delivery checklist.
          </p>
        </div>

        <Card className="mt-4">
          <h3 className="text-lg font-semibold text-ink">Add purchased work</h3>
          <form action={adminAddOsBuildAddition} className="mt-4">
            <input type="hidden" name="build_id" value={build.id} />
            <AdditionFields />
            <Button type="submit" className="mt-4" variant="primary">Add to scope</Button>
          </form>
        </Card>

        <div className="mt-4 grid gap-4">
          {build.additions.map((addition) => (
            <AdditionCard key={addition.id} buildId={build.id} addition={addition} />
          ))}
          {build.additions.length === 0 ? (
            <p className="text-sm text-mute">No separately purchased work is attached to this build.</p>
          ) : null}
        </div>
      </section>
    </PageShell>
  );
}

function CarrierFields({ carrier }: { carrier?: WhitelabelBuildCarrierLink }) {
  const prefix = carrier?.id ?? "new-carrier";
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Carrier key" htmlFor={`${prefix}-company-key`} hint="Stable matching key, for example mutual of omaha.">
        <Input id={`${prefix}-company-key`} name="company_key" defaultValue={carrier?.company_key ?? ""} required />
      </Field>
      <Field label="Display name" htmlFor={`${prefix}-display-name`}>
        <Input id={`${prefix}-display-name`} name="display_name" defaultValue={carrier?.display_name ?? ""} required />
      </Field>
      <Field label="Portal URL" htmlFor={`${prefix}-portal-url`} className="md:col-span-2">
        <Input id={`${prefix}-portal-url`} name="portal_url" type="url" defaultValue={carrier?.portal_url ?? ""} required />
      </Field>
      <Field label="Sort order" htmlFor={`${prefix}-sort-order`}>
        <Input id={`${prefix}-sort-order`} name="sort_order" type="number" min={0} max={10000} defaultValue={carrier?.sort_order ?? 0} required />
      </Field>
      <label className="flex items-center gap-3 rounded-xl border border-hairline bg-card-hi px-4 py-3">
        <input type="checkbox" name="show_in_resources" defaultChecked={carrier?.show_in_resources ?? true} className="h-4 w-4 accent-[var(--accent)]" />
        <span className="text-sm text-ink">Show in Resources</span>
      </label>
    </div>
  );
}

function CarrierCard({ buildId, carrier }: { buildId: string; carrier: WhitelabelBuildCarrierLink }) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-ink">{carrier.display_name}</h3>
          <p className="mt-0.5 text-xs text-mute">{carrier.company_key}</p>
        </div>
        <Badge tone={carrier.show_in_resources ? "pos" : "default"}>{carrier.show_in_resources ? "Visible" : "Hidden"}</Badge>
      </div>
      <form action={adminUpdateOsBuildCarrier}>
        <input type="hidden" name="build_id" value={buildId} />
        <input type="hidden" name="carrier_id" value={carrier.id} />
        <CarrierFields carrier={carrier} />
        <Button type="submit" className="mt-4">Save carrier</Button>
      </form>
      <form action={adminDeleteOsBuildCarrier} className="mt-2">
        <input type="hidden" name="build_id" value={buildId} />
        <input type="hidden" name="carrier_id" value={carrier.id} />
        <Button type="submit" variant="danger">Remove carrier</Button>
      </form>
    </Card>
  );
}

function ServiceCard({
  buildId,
  service,
}: {
  buildId: string;
  service: WhitelabelServiceConnection;
}) {
  const catalog = SERVICE_CATALOG[service.service_kind];
  const apiVerifiedProvider = service.service_kind === "vercel" || service.service_kind === "supabase" || service.service_kind === "email" || service.service_kind === "ai" || service.service_kind === "video";
  const editableStatus = apiVerifiedProvider && service.status === "verified" ? "provided" : service.status;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-ink">{catalog.label}</h3>
          <p className="mt-1 text-sm text-subtle">{catalog.description}</p>
        </div>
        <Badge tone={serviceTone(service.status)}>{SERVICE_STATUS_LABELS[service.status]}</Badge>
      </div>

      <form action={adminSaveOsBuildService} className="mt-5">
        <input type="hidden" name="build_id" value={buildId} />
        <input type="hidden" name="service_kind" value={service.service_kind} />
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Provider" htmlFor={`${service.id}-provider-name`}>
            <Input
              id={`${service.id}-provider-name`}
              name="provider_name"
              defaultValue={service.provider_name}
              readOnly={service.service_kind === "vercel" || service.service_kind === "supabase"}
              placeholder="Example: Resend, Bunny, OpenAI"
            />
          </Field>
          <Field label="Customer account label" htmlFor={`${service.id}-account-label`}>
            <Input
              id={`${service.id}-account-label`}
              name="account_label"
              defaultValue={service.account_label ?? ""}
              placeholder="Customer-owned account"
            />
          </Field>
          <Field label="Login email (not a password)" htmlFor={`${service.id}-login-email`}>
            <Input
              id={`${service.id}-login-email`}
              name="login_email"
              type="email"
              defaultValue={service.login_email ?? ""}
            />
          </Field>
          <Field label="Account reference" htmlFor={`${service.id}-account-ref`}>
            <Input
              id={`${service.id}-account-ref`}
              name="account_ref"
              defaultValue={service.account_ref ?? ""}
              placeholder="Account/team/org id or safe reference"
            />
          </Field>
          <Field label="Target project reference" htmlFor={`${service.id}-project-ref`}>
            <Input
              id={`${service.id}-project-ref`}
              name="project_ref"
              defaultValue={service.project_ref ?? ""}
              placeholder="Project id/name where applicable"
            />
          </Field>
          <Field label="Status" htmlFor={`${service.id}-status`}>
            <select id={`${service.id}-status`} name="status" className={selectClass} defaultValue={editableStatus}>
              <option value="missing">Missing</option>
              <option value="provided">Reference provided</option>
              <option value="needs_owner_action">Owner action needed</option>
              {!apiVerifiedProvider ? <option value="verified">Access verified manually</option> : null}
              <option value="failed">Connection failed</option>
              {!service.required ? <option value="not_required">Not required</option> : null}
            </select>
          </Field>
          <Field label="Billing / usage link" htmlFor={`${service.id}-billing-url`}>
            <Input
              id={`${service.id}-billing-url`}
              name="billing_url"
              type="url"
              defaultValue={service.billing_url ?? ""}
              placeholder="https://provider.example/..."
            />
          </Field>
          <Field label="Next action" htmlFor={`${service.id}-next-action`} className="md:col-span-2">
            <Textarea
              id={`${service.id}-next-action`}
              name="next_action"
              rows={2}
              defaultValue={service.next_action ?? ""}
              placeholder="Example: Account owner must approve domain verification"
            />
          </Field>
          <label className="md:col-span-2 flex items-start gap-3 rounded-xl border border-hairline bg-card-hi px-4 py-3">
            <input
              type="checkbox"
              name="required"
              defaultChecked={service.required}
              className="mt-1 h-4 w-4 accent-[var(--accent)]"
            />
            <span>
              <span className="block text-sm font-medium text-ink">Required for this build</span>
              <span className="mt-0.5 block text-xs text-subtle">
                Required services must be verified before intake is ready.
              </span>
            </span>
          </label>
          {apiVerifiedProvider && service.status === "verified" ? (
            <p className="md:col-span-2 text-xs text-warn">
              These references are currently API-verified. Saving this form means you are changing or re-attesting the target, so the service will return to “Reference provided” until you run the provider check again below.
            </p>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Button type="submit">Save service</Button>
          {service.billing_url ? (
            <a
              href={service.billing_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-accent hover:underline"
            >
              Open this customer&apos;s billing / usage page ↗
            </a>
          ) : null}
        </div>
      </form>

      {service.service_kind === "vercel" || service.service_kind === "supabase" ? (
        <div className="mt-5 rounded-xl border border-accent/25 bg-accent/[0.04] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-ink">Verify live provider access</h4>
              <p className="mt-1 max-w-xl text-xs text-subtle">
                The credential is checked against the provider first. After a successful check it is kept only in the encrypted internal credential vault, never in ordinary build fields or audit logs.
              </p>
            </div>
            {service.verification_method === "provider_api" && service.last_checked_at ? (
              <Badge tone="pos">API checked</Badge>
            ) : null}
          </div>
          <form action={adminVerifyOsBuildProviderAccess} className="mt-4">
            <input type="hidden" name="build_id" value={buildId} />
            <input type="hidden" name="service_kind" value={service.service_kind} />
            <input type="hidden" name="account_ref" value={service.account_ref ?? ""} />
            <input type="hidden" name="project_ref" value={service.project_ref ?? ""} />
            <Field
              label={`${catalog.label} temporary access credential`}
              htmlFor={`${service.id}-provider-credential`}
              hint="Save the account/project references above first, then run this check."
            >
              <Input
                id={`${service.id}-provider-credential`}
                name="access_token"
                type="password"
                autoComplete="off"
                required
              />
            </Field>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary">Verify {catalog.label} access</Button>
              {service.last_checked_at ? (
                <span className="text-xs text-mute">
                  Last API check: {new Date(service.last_checked_at).toISOString().replace("T", " ").slice(0, 19)} UTC
                </span>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}
      {service.service_kind === "email" ? (
        <div className="mt-5 rounded-xl border border-accent/25 bg-accent/[0.04] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-ink">Verify Resend sender access</h4>
              <p className="mt-1 max-w-xl text-xs text-subtle">
                The temporary API key is used to confirm the customer sender domain, then stored only in the encrypted Vault for provisioning.
              </p>
            </div>
            {service.verification_method === "provider_api" && service.last_checked_at ? <Badge tone="pos">API checked</Badge> : null}
          </div>
          <form action={adminVerifyOsBuildEmailAccess} className="mt-4">
            <input type="hidden" name="build_id" value={buildId} />
            <Field label="Resend temporary API key" htmlFor={`${service.id}-resend-credential`}>
              <Input id={`${service.id}-resend-credential`} name="access_token" type="password" autoComplete="off" required />
            </Field>
            <Button type="submit" className="mt-4">Check Resend access</Button>
          </form>
        </div>
      ) : null}
      {service.service_kind === "ai" ? (
        <div className="mt-5 rounded-xl border border-accent/25 bg-accent/[0.04] p-4">
          <h4 className="text-sm font-semibold text-ink">Verify standard AI coach service</h4>
          <p className="mt-1 text-xs text-subtle">
            The standard adapter currently supports Anthropic. A different provider is a separately delivered replacement adapter, not a manual “verified” label.
          </p>
          <form action={adminVerifyOsBuildAiAccess} className="mt-4">
            <input type="hidden" name="build_id" value={buildId} />
            <Field label="Anthropic temporary API key" htmlFor={`${service.id}-anthropic-key`}>
              <Input id={`${service.id}-anthropic-key`} name="access_token" type="password" autoComplete="off" required />
            </Field>
            <Button type="submit" className="mt-4">Verify Anthropic access</Button>
          </form>
        </div>
      ) : null}
      {service.service_kind === "video" ? (
        <div className="mt-5 rounded-xl border border-accent/25 bg-accent/[0.04] p-4">
          <h4 className="text-sm font-semibold text-ink">Verify Bunny Stream libraries</h4>
          <p className="mt-1 text-xs text-subtle">
            Primary training is required to connect Bunny. Live-training and licensing-tutorial libraries are optional; leave both ID and key blank when unused.
          </p>
          <form action={adminVerifyOsBuildVideoAccess} className="mt-4 grid gap-4">
            <input type="hidden" name="build_id" value={buildId} />
            {(["recruiting", "live", "tutorials"] as const).map((key) => (
              <div key={key} className="grid gap-3 rounded-xl border border-hairline bg-card-hi p-3 md:grid-cols-3">
                <Field label={`${key} library ID`} htmlFor={`${service.id}-${key}-library`}>
                  <Input id={`${service.id}-${key}-library`} name={`${key}_library_id`} inputMode="numeric" required={key === "recruiting"} />
                </Field>
                <Field label={`${key} library API key`} htmlFor={`${service.id}-${key}-key`}>
                  <Input id={`${service.id}-${key}-key`} name={`${key}_api_key`} type="password" autoComplete="off" required={key === "recruiting"} />
                </Field>
                <Field label="CDN hostname (optional)" htmlFor={`${service.id}-${key}-cdn`}>
                  <Input id={`${service.id}-${key}-cdn`} name={`${key}_cdn_hostname`} placeholder="vz-...b-cdn.net" />
                </Field>
              </div>
            ))}
            <Button type="submit">Verify Bunny access</Button>
          </form>
        </div>
      ) : null}
    </Card>
  );
}

function AdditionFields({ addition }: { addition?: WhitelabelBuildAddition }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Type" htmlFor={addition ? `${addition.id}-type` : "addition_type"}>
        <select
          id={addition ? `${addition.id}-type` : "addition_type"}
          name="addition_type"
          className={selectClass}
          defaultValue={addition?.addition_type ?? "custom_feature"}
        >
          {(Object.entries(ADDITION_TYPE_LABELS) as Array<[AdditionType, string]>).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </Field>
      <Field label="Status" htmlFor={addition ? `${addition.id}-status` : "addition_status"}>
        <select
          id={addition ? `${addition.id}-status` : "addition_status"}
          name="status"
          className={selectClass}
          defaultValue={addition?.status ?? "planned"}
        >
          {(["planned", "in_progress", "blocked", "ready"] as AdditionStatus[]).map((status) => (
            <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
          ))}
        </select>
      </Field>
      <Field label="Delivery phase" htmlFor={addition ? `${addition.id}-phase` : "delivery_phase"}>
        <select
          id={addition ? `${addition.id}-phase` : "delivery_phase"}
          name="delivery_phase"
          className={selectClass}
          defaultValue={addition?.delivery_phase ?? "launch"}
        >
          <option value="launch">Launch — must be complete before handoff</option>
          <option value="post_handoff">Post-handoff — agreed later delivery</option>
        </select>
      </Field>
      <Field label="Addition name" htmlFor={addition ? `${addition.id}-name` : "addition_name"} className="md:col-span-2">
        <Input
          id={addition ? `${addition.id}-name` : "addition_name"}
          name="name"
          defaultValue={addition?.name ?? ""}
          required
        />
      </Field>
      <Field label="Agreed delivery requirements" htmlFor={addition ? `${addition.id}-requirements` : "delivery_requirements"} className="md:col-span-2">
        <Textarea
          id={addition ? `${addition.id}-requirements` : "delivery_requirements"}
          name="delivery_requirements"
          rows={3}
          defaultValue={addition?.delivery_requirements ?? ""}
          placeholder="What this paid addition must deliver before it can be called complete"
        />
      </Field>
      <Field label="Timeline notes" htmlFor={addition ? `${addition.id}-timeline` : "timeline_notes"} className="md:col-span-2">
        <Textarea
          id={addition ? `${addition.id}-timeline` : "timeline_notes"}
          name="timeline_notes"
          rows={2}
          defaultValue={addition?.timeline_notes ?? ""}
        />
      </Field>
    </div>
  );
}

function AdditionCard({
  buildId,
  addition,
}: {
  buildId: string;
  addition: WhitelabelBuildAddition;
}) {
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-ink">{addition.name}</h3>
          <p className="mt-0.5 text-xs text-mute">{ADDITION_TYPE_LABELS[addition.addition_type]}</p>
        </div>
        <Badge tone={addition.status === "ready" ? "pos" : addition.status === "blocked" ? "neg" : "default"}>
          {addition.status.replaceAll("_", " ")}
        </Badge>
      </div>
      <form action={adminUpdateOsBuildAddition}>
        <input type="hidden" name="build_id" value={buildId} />
        <input type="hidden" name="addition_id" value={addition.id} />
        <AdditionFields addition={addition} />
        <Button type="submit" className="mt-4">Save addition</Button>
      </form>
      <form action={adminDeleteOsBuildAddition} className="mt-2">
        <input type="hidden" name="build_id" value={buildId} />
        <input type="hidden" name="addition_id" value={addition.id} />
        <Button type="submit" variant="danger">Remove from scope</Button>
      </form>
    </Card>
  );
}
