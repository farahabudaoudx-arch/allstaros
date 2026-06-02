import Link from "next/link";
import { Badge } from "@/components/ui";

type Resource = {
  name: string;
  description: string;
  href: string;
  category: string;
  external?: boolean;
};

// Placeholder catalog — swap href/description as the real links come in.
const RESOURCES: Resource[] = [
  {
    name: "GOAT Leads",
    description: "Order and manage your exclusive final-expense lead flow.",
    href: "#",
    category: "Leads",
    external: true,
  },
  {
    name: "E-App Guides",
    description: "Step-by-step electronic application walkthroughs by carrier.",
    href: "#",
    category: "Guides",
  },
  {
    name: "Orion.io",
    description: "Quoting and underwriting platform for final-expense products.",
    href: "#",
    category: "Quoting",
    external: true,
  },
  {
    name: "Carrier Portals",
    description: "Direct links to every contracted carrier's agent portal.",
    href: "#",
    category: "Carriers",
    external: true,
  },
  {
    name: "Script Library",
    description: "Phone scripts, rebuttals, and presentation flows.",
    href: "#",
    category: "Scripts",
  },
  {
    name: "Commission Statements",
    description: "View your advances, earned commissions, and chargebacks.",
    href: "#",
    category: "Pay",
  },
  {
    name: "Compliance Docs",
    description: "State requirements, disclosures, and CE tracking.",
    href: "#",
    category: "Compliance",
  },
  {
    name: "Dialer Setup",
    description: "Configure your power dialer and import lead lists.",
    href: "#",
    category: "Tools",
    external: true,
  },
];

export default function ProducerResourcesPage() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">Producer</p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Resources
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-subtle">
          Tools, platforms, and reference material for working your book. Links are
          placeholders for now.
        </p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {RESOURCES.map((r) => {
          const linkProps = r.external
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {};
          return (
            <Link
              key={r.name}
              href={r.href}
              {...linkProps}
              className="group flex flex-col rounded-2xl border border-hairline bg-card p-5 transition hover:border-accent hover:bg-card-hi"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-card-hi text-base font-semibold text-accent ring-1 ring-hairline">
                  {r.name.trim()[0]?.toUpperCase()}
                </div>
                <Badge>{r.category}</Badge>
              </div>
              <h2 className="mt-4 flex items-center gap-1.5 text-base font-semibold text-ink">
                {r.name}
                {r.external ? (
                  <span aria-hidden className="text-mute transition group-hover:text-accent">
                    ↗
                  </span>
                ) : null}
              </h2>
              <p className="mt-1.5 text-sm text-subtle">{r.description}</p>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
