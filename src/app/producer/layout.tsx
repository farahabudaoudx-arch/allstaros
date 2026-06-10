import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { Sidebar, type NavItem } from "@/components/Sidebar";

function buildNav(isBuilder: boolean): NavItem[] {
  const trainingChildren: NavItem[] = [
    { label: "Previous Live Trainings", href: "/producer/trainings/live" },
    { label: "Bootcamp", href: "/producer/trainings/bootcamp", locked: true },
    { label: "Accelerator", href: "/producer/trainings/accelerator", locked: true },
    { label: "Uplevel", href: "/producer/trainings/uplevel", locked: true },
  ];

  const nav: NavItem[] = [
    { label: "Dashboard", href: "/producer" },
    { label: "Leaderboard", href: "/producer/leaderboard" },
    {
      label: "Tracking",
      children: [
        { label: "Daily Tracker", href: "/producer/tracker" },
        { label: "Analytics", href: "/producer/analytics" },
        { label: "Lead Spend", href: "/producer/lead-spend" },
        { label: "Clients", href: "/producer/clients" },
      ],
    },
  ];
  if (isBuilder) {
    nav.push({
      label: "My Team",
      children: [
        { label: "Team Performance", href: "/producer/team" },
        { label: "Recruiting Pipeline", href: "/producer/recruiting" },
        { label: "Messages", href: "/producer/messages" },
        { label: "Flagged", href: "/producer/flagged" },
      ],
    });
  }
  nav.push(
    { label: "Training", children: trainingChildren },
    { label: "Resources", href: "/producer/resources" },
    { label: "Messages", href: "/producer/upline" },
    { label: "Settings", href: "/producer/settings" },
  );
  return nav;
}

export default async function ProducerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer");
  // Additive roles: builders keep producer access; pure recruits don't.
  if (!person.is_producer && !person.is_builder) redirect("/portal");

  return (
    <div className="flex min-h-full flex-1">
      <Sidebar
        items={buildNav(person.is_builder)}
        tag={person.is_builder ? "Builder" : "Producer"}
        userName={person.full_name}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
