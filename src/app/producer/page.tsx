import { EventSchedule } from "@/components/producer/EventSchedule";
import { DashboardOverview } from "@/components/producer/DashboardOverview";
import { DashboardGreeting } from "@/components/producer/DashboardGreeting";
import { ProducerGoals } from "@/components/producer/ProducerGoals";
import { TodaySnapshot } from "@/components/producer/TodaySnapshot";
import { getCurrentPerson } from "@/lib/auth";

export default async function ProducerDashboard() {
  const person = await getCurrentPerson();
  const firstName = person?.full_name?.trim()?.split(/\s+/)[0] ?? "there";

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <DashboardGreeting name={firstName} />

      <TodaySnapshot />

      <ProducerGoals />

      <EventSchedule />

      <DashboardOverview />
    </main>
  );
}
