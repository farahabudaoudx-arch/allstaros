import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { TopBar, type NavItem } from "@/components/TopBar";

const NAV: NavItem[] = [
  { label: "Roster", href: "/dashboard" },
  { label: "Flagged", href: "/dashboard/flagged" },
  { label: "Reference", href: "/dashboard/reference" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/dashboard");
  if (!person.is_builder) redirect("/portal");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <TopBar items={NAV} tag="Builder" userName={person.full_name} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
        {children}
      </main>
    </div>
  );
}
