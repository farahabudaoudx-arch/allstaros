import Link from "next/link";
import { LinkButton } from "@/components/ui";

type Portal = {
  name: string;
  // Swap "#" for the real portal URL as links come in.
  href: string;
};

const PORTALS: Portal[] = [
  { name: "Americo", href: "https://account.americoagent.com/Identity/Account/Login/?returnUrl=https%3a%2f%2ftools.americoagent.com%2f" },
  { name: "Ethos", href: "https://agents.ethoslife.com/login" },
  { name: "Mutual Of Omaha", href: "https://accounts.mutualofomaha.com/samlAuthnRequest" },
  { name: "NLG", href: "https://www.nationallife.com/agent" },
  // Single Transamerica agent home serves both product lines.
  { name: "Transamerica Express", href: "https://secure.transamerica.com/agenthome/#/" },
  { name: "Transamerica Immediate Solutions", href: "https://secure.transamerica.com/agenthome/#/" },
  { name: "Corebridge", href: "https://connext.corebridgefinancial.com/life/connext-portal/public/login" },
  { name: "Aetna", href: "https://www.aetna.com/producer_public/login.fcc?icid=OLogin_nav_link" },
  { name: "American Amicable", href: "https://www.insuranceapplication.com/AppPage/index.html" },
];

export default function PortalLinksPage() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <Link
          href="/producer/resources"
          className="font-mono text-xs uppercase tracking-[0.18em] text-mute transition hover:text-accent"
        >
          ← Resources
        </Link>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Portal Links
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-subtle">
          Jump straight to each carrier&apos;s agent portal login.
        </p>
      </div>

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
