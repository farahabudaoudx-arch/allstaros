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
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

// Portal Links — chain link
function LinkIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M9.5 14.5l5-5" />
      <path d="M8 12l-1.5 1.5a3.5 3.5 0 005 5L13 17" />
      <path d="M16 12l1.5-1.5a3.5 3.5 0 00-5-5L11 7" />
    </svg>
  );
}

// Carrier Contacts — phone book / address book
function PhoneBookIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M6 4h11a2 2 0 012 2v12a2 2 0 01-2 2H6V4z" />
      <path d="M6 4a2 2 0 00-2 2v0a2 2 0 002 2" />
      <path d="M4 12h2M4 16h2" />
      <circle cx="11.5" cy="11" r="1.8" />
      <path d="M8.8 16c.4-1.4 1.5-2.2 2.7-2.2s2.3.8 2.7 2.2" />
    </svg>
  );
}

// Gateway Login — mouse pointer / cursor
function MousePointerIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M5 4l6.5 15.5 2.3-6.2 6.2-2.3L5 4z" />
      <path d="M13.5 13.5L19 19" />
    </svg>
  );
}

// All Star Sidekick — robot
function RobotIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="5" y="8" width="14" height="10" rx="2.5" />
      <path d="M12 4v4M12 4h-.01" />
      <circle cx="9.5" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="13" r="1" fill="currentColor" stroke="none" />
      <path d="M3 12v3M21 12v3" />
    </svg>
  );
}

// Underwriting Wizard — magic wand + sparkle
function WandIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M6 19L17 8" />
      <path d="M14.5 5.5l1-1M18 9l1-1M16 4.5l.5-1.5M19.5 8l1.5-.5" />
      <path d="M15.5 6.5l2 2" />
    </svg>
  );
}

// E-App Guides — numbered / step-by-step list
function StepsIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M10 7h10M10 12h10M10 17h10" />
      <path d="M4 6.5h1.4V9M4 16.2c0-.6.5-1 1.1-1s1.1.4 1.1 1c0 .9-2.2 1.4-2.2 2.8h2.2" />
    </svg>
  );
}

// Orion AI — phone handset
function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M6.5 4h3l1.5 4-2 1.5a11 11 0 005 5l1.5-2 4 1.5v3a2 2 0 01-2 2A16 16 0 014.5 6a2 2 0 012-2z" />
    </svg>
  );
}
