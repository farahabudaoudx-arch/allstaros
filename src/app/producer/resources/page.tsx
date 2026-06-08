import Link from "next/link";

type Resource = {
  name: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  external?: boolean;
};

const AI_TOOLS: Resource[] = [
  {
    name: "All Star Sidekick",
    description: "AI assistant trained on all things life insurance.",
    href: "/allstar-ai",
    icon: RobotIcon,
  },
  {
    name: "Underwriting Wizard",
    description: "Match clients to the right carrier.",
    href: "/underwriting",
    icon: WandIcon,
  },
  {
    name: "Orion AI",
    description: "CRM dialer that sets appointments for you.",
    href: "https://www.orionaisolutions.ai/",
    icon: PhoneIcon,
    external: true,
  },
];

const USEFUL_LINKS: Resource[] = [
  {
    name: "Portal Links",
    description: "Direct login links to our carrier's portals.",
    href: "/producer/resources/portal-links",
    icon: LinkIcon,
  },
  {
    name: "Carrier Contacts",
    description: "Phone + email for our carrier reps and their customer support.",
    href: "/producer/resources/carrier-contacts",
    icon: PhoneBookIcon,
  },
  {
    name: "E-App Guides",
    description: "Step-by-step electronic application walkthroughs by carrier.",
    href: "https://mytrustedadvisor.wixsite.com/eappguides",
    icon: StepsIcon,
    external: true,
  },
  {
    name: "Gateway Login",
    description: "See your issued premium inside of Gateway.",
    href: "https://ww3.familyfirstlife.com/login",
    icon: MousePointerIcon,
    external: true,
  },
];

function ResourceCard({ r }: { r: Resource }) {
  const Icon = r.icon;
  const linkProps = r.external
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};
  return (
    <Link
      href={r.href}
      {...linkProps}
      className="group flex flex-col rounded-2xl border border-hairline bg-card p-5 transition hover:border-accent hover:bg-card-hi"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-card-hi text-accent ring-1 ring-hairline">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 flex items-center gap-1.5 text-base font-semibold text-ink">
        {r.name}
        {r.external ? (
          <span aria-hidden className="text-mute transition group-hover:text-accent">
            ↗
          </span>
        ) : null}
      </h3>
      <p className="mt-1.5 text-sm text-subtle">{r.description}</p>
    </Link>
  );
}

export default function ProducerResourcesPage() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">Producer</p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Resources
        </h1>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-[-0.015em] text-ink">AI Tools</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AI_TOOLS.map((r) => (
            <ResourceCard key={r.name} r={r} />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-[-0.015em] text-ink">Useful Links</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {USEFUL_LINKS.map((r) => (
            <ResourceCard key={r.name} r={r} />
          ))}
        </div>
      </section>
    </main>
  );
}

/* ---------------------------------------------------------------------------
   Icons — inline SVG (the app ships no icon library; see Sidebar.tsx pattern).
   All stroke currentColor so they inherit the tile's text-accent color.
--------------------------------------------------------------------------- */

function iconProps(className?: string) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

// Portal Links — chain link (lucide: link)
function LinkIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

// Carrier Contacts — address book with a person (lucide: book-user)
function PhoneBookIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M15 13a3 3 0 1 0-6 0" />
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
      <circle cx="12" cy="8" r="2" />
    </svg>
  );
}

// Gateway Login — mouse pointer / cursor (lucide: mouse-pointer)
function MousePointerIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
      <path d="M13 13l6 6" />
    </svg>
  );
}

// All Star Sidekick — robot (lucide: bot)
function RobotIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M12 8V4H8" />
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

// Underwriting Wizard — magic wand + sparkles (lucide: wand-sparkles)
function WandIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M15 4V2" />
      <path d="M15 16v-2" />
      <path d="M8 9h2" />
      <path d="M20 9h2" />
      <path d="M17.8 11.8 19 13" />
      <path d="M15 9h.01" />
      <path d="M17.8 6.2 19 5" />
      <path d="m3 21 9-9" />
      <path d="M12.2 6.2 11 5" />
    </svg>
  );
}

// E-App Guides — numbered step-by-step list (lucide: list-ordered)
function StepsIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M10 6h11" />
      <path d="M10 12h11" />
      <path d="M10 18h11" />
      <path d="M4 6h1v4" />
      <path d="M4 10h2" />
      <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
    </svg>
  );
}

// Orion AI — phone handset (lucide: phone)
function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
