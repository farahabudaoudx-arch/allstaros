import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";

type Section = { name: string; description: string; href: string };

const SECTIONS: Section[] = [
  {
    name: "Builders",
    description: "Manage builders, their downline, bulk add + invite a team.",
    href: "/admin/people/builders",
  },
  {
    name: "Producers",
    description: "View activity, reassign upline, view their portal.",
    href: "/admin/people/producers",
  },
  {
    name: "Recruits",
    description: "Activity, reassign upline, reset portal, change step.",
    href: "/admin/people/recruits",
  },
  {
    name: "Leaderboard",
    description: "Org-wide performance, filter by builder, lead-spend metric.",
    href: "/admin/leaderboard",
  },
  {
    name: "Flags",
    description: "Flagged recruits across the organization.",
    href: "/admin/flags",
  },
  {
    name: "Training Schedule",
    description: "Upcoming live trainings shown on the producer dashboard.",
    href: "/admin/schedule",
  },
  {
    name: "Builder Codes",
    description: "Generate, revoke, and review builder invite codes.",
    href: "/admin/builder-codes",
  },
  {
    name: "Auth Ops",
    description: "Resend invites and trigger password resets.",
    href: "/admin/auth-ops",
  },
  {
    name: "Login Monitoring",
    description: "Login history with auto-flagged new-location sign-ins.",
    href: "/admin/login-monitoring",
  },
];

const SUPER_SECTIONS: Section[] = [
  {
    name: "Roles & Minting",
    description: "Add a person as admin, or grant/revoke owner. Super-admins only.",
    href: "/admin/minting",
  },
];

function SectionCard({ s }: { s: Section }) {
  return (
    <Link
      href={s.href}
      className="flex flex-col rounded-2xl border border-hairline bg-card p-5 transition hover:border-accent hover:bg-card-hi"
    >
      <h3 className="text-base font-semibold text-ink">{s.name}</h3>
      <p className="mt-1.5 text-sm text-subtle">{s.description}</p>
    </Link>
  );
}

export default async function AdminHomePage() {
  const person = await requireAdmin();
  const isSuper = person.is_super_admin;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-mute">
          {isSuper ? "Super Admin" : "Admin"}
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Control Center
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-subtle">
          {isSuper
            ? "You hold the reserved tier — everything below, plus adding admins and owners."
            : "Welcome. Manage people, performance, content, and access across the whole organization."}
        </p>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-[-0.015em] text-ink">
          Operations
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <SectionCard key={s.name} s={s} />
          ))}
        </div>
      </section>

      {isSuper ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-[-0.015em] text-ink">
            Reserved levers
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SUPER_SECTIONS.map((s) => (
              <SectionCard key={s.name} s={s} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
