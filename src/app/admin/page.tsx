import { requireAdmin } from "@/lib/admin/guard";

type SectionStatus = "available" | "soon" | "super";

type Section = {
  name: string;
  description: string;
  href?: string;
  status: SectionStatus;
};

const SECTIONS: Section[] = [
  {
    name: "People",
    description: "Org-wide roster, profile edits, activate/deactivate, role toggles.",
    href: "/admin/people",
    status: "soon",
  },
  {
    name: "Recruits",
    description: "Pipeline oversight — flag, correct phase, remove.",
    href: "/admin/recruits",
    status: "soon",
  },
  {
    name: "Sales",
    description: "Org-wide leaderboards, funnel, per-team drill-down.",
    href: "/admin/sales",
    status: "soon",
  },
  {
    name: "Lead Spend",
    description: "Audit every producer's lead purchases, cost-per-lead, export.",
    href: "/admin/lead-spend",
    status: "soon",
  },
  {
    name: "Goals",
    description: "Set and adjust producer & team targets.",
    href: "/admin/goals",
    status: "soon",
  },
  {
    name: "Training Content",
    description: "Upload / delete videos across all five libraries via Bunny links.",
    href: "/admin/training",
    status: "soon",
  },
  {
    name: "Training Schedule",
    description: "Manage upcoming live trainings shown on the producer dashboard.",
    href: "/admin/schedule",
    status: "soon",
  },
  {
    name: "Referral Codes",
    description: "Generate, revoke, and review builder invite codes.",
    href: "/admin/referral-codes",
    status: "soon",
  },
  {
    name: "Auth Ops",
    description: "Resend invites and trigger password resets.",
    href: "/admin/auth-ops",
    status: "soon",
  },
  {
    name: "Login Monitoring",
    description: "Per-user login history with auto-flagged new-location sign-ins.",
    href: "/admin/login-monitoring",
    status: "soon",
  },
];

const SUPER_SECTIONS: Section[] = [
  {
    name: "Roles & Minting",
    description: "Grant or revoke admin and owner. Reserved to super-admins.",
    href: "/admin/minting",
    status: "super",
  },
  {
    name: "System",
    description: "Feature flags, API keys, hard deletes, impersonation.",
    href: "/admin/system",
    status: "super",
  },
  {
    name: "Audit Log",
    description: "Every sensitive admin action, with actor and target.",
    href: "/admin/audit",
    status: "super",
  },
];

function StatusBadge({ status }: { status: SectionStatus }) {
  if (status === "available") {
    return (
      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent ring-1 ring-accent/30">
        Available
      </span>
    );
  }
  if (status === "super") {
    return (
      <span className="rounded-full bg-card-hi px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-subtle ring-1 ring-hairline">
        Super Admin
      </span>
    );
  }
  return (
    <span className="rounded-full bg-card-hi px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-mute ring-1 ring-hairline">
      Coming soon
    </span>
  );
}

function SectionCard({ s }: { s: Section }) {
  return (
    <div className="flex flex-col rounded-2xl border border-hairline bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">{s.name}</h3>
        <StatusBadge status={s.status} />
      </div>
      <p className="mt-1.5 text-sm text-subtle">{s.description}</p>
    </div>
  );
}

export default async function AdminHomePage() {
  const person = await requireAdmin();
  const isSuper = person.is_super_admin;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
          {isSuper ? "Super Admin" : "Admin"}
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Control Center
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-subtle">
          {isSuper
            ? "You hold the reserved system tier — everything below plus minting, hard deletes, and the audit log."
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
