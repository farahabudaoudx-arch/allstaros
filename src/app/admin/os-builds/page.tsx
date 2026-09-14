import Link from "next/link";
import { Card, Kpi, LinkButton, PageShell, Badge } from "@/components/ui";
import { loadOsBuildsForAdmin } from "@/lib/whitelabel/admin";

export default async function OsBuildsPage() {
  const builds = await loadOsBuildsForAdmin();
  const ready = builds.filter((build) => build.readiness.ready).length;
  const blocked = builds.length - ready;

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-mute">Internal setup console</p>
          <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
            OS Assembly Line
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-subtle">
            Save each customer agency&apos;s intake, target service references, purchased work, and readiness before provisioning a separate installation.
          </p>
        </div>
        <LinkButton href="/admin/os-builds/new" variant="primary">
          New OS build
        </LinkButton>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Kpi label="Builds" value={builds.length} />
        <Kpi label="Intake ready" value={ready} tone="pos" />
        <Kpi label="Blocked" value={blocked} tone={blocked > 0 ? "warn" : "default"} />
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-ink">Customer builds</h2>
          <span className="text-xs text-mute">Newest activity first</span>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {builds.map((build) => (
            <Link key={build.id} href={`/admin/os-builds/${build.id}`} className="block">
              <Card interactive>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold text-ink">{build.agency_name}</h3>
                    <p className="truncate text-sm text-subtle">{build.product_name}</p>
                  </div>
                  <Badge tone={build.readiness.ready ? "pos" : "warn"}>
                    {build.readiness.ready ? "Ready" : `${build.readiness.missing.length} missing`}
                  </Badge>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-mute">Domain</dt>
                    <dd className="mt-0.5 truncate text-subtle">{build.domain || "Not set"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-mute">Payment</dt>
                    <dd className="mt-0.5 capitalize text-subtle">{build.payment_status}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-mute">Services</dt>
                    <dd className="mt-0.5 text-subtle">
                      {build.services.filter((service) => service.status === "verified").length}/{build.services.filter((service) => service.required).length} verified
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-mute">Purchased additions</dt>
                    <dd className="mt-0.5 text-subtle">{build.additions.length}</dd>
                  </div>
                </dl>
              </Card>
            </Link>
          ))}
        </div>
        {builds.length === 0 ? (
          <Card className="mt-4">
            <p className="text-sm text-subtle">No customer builds yet. Create the first build after an onboarding call.</p>
          </Card>
        ) : null}
      </section>
    </PageShell>
  );
}
