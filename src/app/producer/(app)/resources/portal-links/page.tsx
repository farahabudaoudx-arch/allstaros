import { LinkButton } from "@/components/ui";
import { CARRIER_PORTALS as PORTALS } from "@/lib/carrier-portals";
import { PageHeader } from "@/components/producer/PageHeader";

export default function PortalLinksPage() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <PageHeader title="Portal Links" backHref="/producer/menu/resources" />

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PORTALS.map((p) => {
          const pending = p.href === "#";
          return (
            <LinkButton
              key={p.name}
              href={p.href}
              target={pending ? undefined : "_blank"}
              rel={pending ? undefined : "noopener noreferrer"}
              variant="secondary"
              className="justify-between px-5 py-4 text-left"
            >
              <span className="text-base font-semibold text-ink">{p.name}</span>
              <span aria-hidden className="text-mute">
                ↗
              </span>
            </LinkButton>
          );
        })}
      </div>
    </main>
  );
}
