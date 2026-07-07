import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { getProducerUnread, type ProducerUnread } from "@/lib/producer/unread";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { PageTransition } from "@/components/PageTransition";
import { NpnRequestModal } from "./_components/npn-request-modal";

function buildNav(isBuilder: boolean, unread: ProducerUnread): NavItem[] {
  const trainingChildren: NavItem[] = [
    { label: "Upcoming Live Trainings", href: "/producer/trainings/upcoming" },
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
        { label: "Issued Premium", href: "/producer/issued-premium" },
        { label: "Clients", href: "/producer/clients" },
      ],
    },
  ];
  if (isBuilder) {
    nav.push({
      label: "My Team",
      children: [
        { label: "My Downline", href: "/producer/downline" },
        { label: "Team Performance", href: "/producer/team" },
        { label: "Recruiting Pipeline", href: "/producer/recruiting" },
        { label: "Team Messages", href: "/producer/messages", dot: unread.team },
        { label: "Flagged", href: "/producer/flagged" },
      ],
    });
  }
  nav.push(
    { label: "Training", children: trainingChildren },
    { label: "Resources", href: "/producer/resources" },
    { label: "Messages", href: "/producer/upline", dot: unread.upline },
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

  const unread = await getProducerUnread(person.id);

  return (
    <div className="flex min-h-full flex-1">
      <Sidebar
        items={buildNav(person.is_builder, unread)}
        tag={person.is_builder ? "Builder" : "Producer"}
        userName={person.full_name}
      />
      <PageTransition className="flex min-w-0 flex-1 flex-col pt-14 md:pt-0">
        {children}
      </PageTransition>
      {/* Only active producers/builders reach this layout; show the NPN popup to
          those who still have no NPN on file. Answering flips npn_status off
          "missing", so it never returns. */}
      <NpnRequestModal
        initialOpen={person.npn_status === "missing"}
      />
    </div>
  );
}
