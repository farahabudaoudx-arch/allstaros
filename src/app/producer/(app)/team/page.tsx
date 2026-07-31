import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { TeamView } from "@/components/producer/TeamView";
import { PageHeader } from "@/components/producer/PageHeader";

export default async function TeamPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin?next=/producer/team");
  if (!person.is_builder) redirect("/producer");

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <PageHeader title="Team" backHref="/producer/menu/team" />

      {/* Interactive roster + timeframe controls (client). */}
      <TeamView />
    </main>
  );
}
