import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { Sidebar, type NavItem } from "@/components/Sidebar";

/**
 * Admin navigation. Routes that land in later phases are marked `locked` so the
 * sidebar shows the full roadmap without 404ing — flip `locked` off as each
 * phase ships. Super-admin-only sections are appended for super-admins only.
 */
function buildNav(isSuperAdmin: boolean): NavItem[] {
  const nav: NavItem[] = [
    { label: "Dashboard", href: "/admin" },
    {
      label: "People",
      children: [
        { label: "Roster", href: "/admin/people" },
        { label: "Recruits", href: "/admin/recruits" },
      ],
    },
    {
      label: "Performance",
      children: [
        { label: "Sales", href: "/admin/sales" },
        { label: "Lead Spend", href: "/admin/lead-spend" },
        { label: "Goals", href: "/admin/goals" },
      ],
    },
    {
      label: "Content",
      children: [
        { label: "Training Content", href: "/admin/training" },
        { label: "Training Schedule", href: "/admin/schedule" },
      ],
    },
    {
      label: "Access",
      children: [
        { label: "Referral Codes", href: "/admin/referral-codes" },
        { label: "Auth Ops", href: "/admin/auth-ops" },
        { label: "Login Monitoring", href: "/admin/login-monitoring" },
      ],
    },
  ];

  if (isSuperAdmin) {
    nav.push({
      label: "Super Admin",
      children: [
        { label: "Roles & Minting", href: "/admin/minting" },
        { label: "System", href: "/admin/system" },
        { label: "Audit Log", href: "/admin/audit" },
      ],
    });
  }

  return nav;
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/admin");
  // Admin tier = is_admin or is_super_admin. Everyone else is bounced to their
  // own home; pure recruits never had producer access either.
  if (!person.is_admin && !person.is_super_admin) {
    redirect(person.is_producer || person.is_builder ? "/producer" : "/portal");
  }

  return (
    <div className="flex min-h-full flex-1">
      <Sidebar
        items={buildNav(person.is_super_admin)}
        tag={person.is_super_admin ? "Super Admin" : "Admin"}
        userName={person.full_name}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
