import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { PageTransition } from "@/components/PageTransition";

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
        { label: "Builders", href: "/admin/people/builders" },
        { label: "Producers", href: "/admin/people/producers" },
        { label: "Recruits", href: "/admin/people/recruits" },
      ],
    },
    {
      label: "Performance",
      children: [
        { label: "Leaderboard", href: "/admin/leaderboard" },
        { label: "Flags", href: "/admin/flags" },
      ],
    },
    {
      label: "Content",
      children: [
        { label: "Training Schedule", href: "/admin/schedule" },
        {
          label: "Stream Bunny",
          href: "https://dash.bunny.net/stream",
          external: true,
        },
      ],
    },
    {
      label: "Access",
      children: [
        { label: "Builder Codes", href: "/admin/builder-codes" },
        { label: "Auth Ops", href: "/admin/auth-ops" },
        { label: "Login Monitoring", href: "/admin/login-monitoring" },
        { label: "Automation Agents", href: "/admin/agents" },
      ],
    },
  ];

  if (isSuperAdmin) {
    nav.push({
      label: "Super Admin",
      children: [{ label: "Roles & Minting", href: "/admin/minting" }],
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
      <PageTransition className="flex min-w-0 flex-1 flex-col pt-14 md:pt-0">
        {children}
      </PageTransition>
    </div>
  );
}
