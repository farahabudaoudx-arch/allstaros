import Link from "next/link";
import { EventSchedule } from "@/components/producer/EventSchedule";
import { DashboardOverview } from "@/components/producer/DashboardOverview";
import { DashboardGreeting } from "@/components/producer/DashboardGreeting";
import { ProducerGoals } from "@/components/producer/ProducerGoals";
import { TodaySnapshot } from "@/components/producer/TodaySnapshot";
import { getCurrentPerson } from "@/lib/auth";
import { getScheduleEvents } from "@/lib/producer/schedule";

export default async function ProducerDashboard() {
  const person = await getCurrentPerson();
  const firstName = person?.full_name?.trim()?.split(/\s+/)[0] ?? "there";
  const scheduleEvents = await getScheduleEvents();

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <DashboardGreeting name={firstName} />

      <TodaySnapshot />

      <ProducerGoals />

      <EventSchedule
        events={scheduleEvents}
        heading="Upcoming Live Trainings"
        emptyState={
          <section className="mt-12">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
              Upcoming Live Trainings
            </h2>
            <div className="mt-6 rounded-2xl border border-hairline bg-card px-5 py-10 text-center">
              <p className="text-sm text-subtle">No live trainings scheduled right now.</p>
              <Link
                href="/producer/trainings/upcoming"
                className="mt-3 inline-block text-sm font-medium text-accent hover:text-accent-soft"
              >
                See all trainings →
              </Link>
            </div>
          </section>
        }
      />

      <DashboardOverview />
    </main>
  );
}
