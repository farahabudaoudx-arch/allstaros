import Link from "next/link";
import { EventSchedule } from "@/components/producer/EventSchedule";
import { DashboardOverview } from "@/components/producer/DashboardOverview";
import { DashboardGreeting } from "@/components/producer/DashboardGreeting";
import { ProducerGoals } from "@/components/producer/ProducerGoals";
import { TodaySnapshot } from "@/components/producer/TodaySnapshot";
import { getCurrentPerson } from "@/lib/auth";
import { getScheduleEvents } from "@/lib/producer/schedule";

// End of the current week (upcoming Sunday) in Chicago time, as YYYY-MM-DD.
// The dashboard shows only this week's calls; "View all" goes to the full list.
function endOfWeekChicagoISO(): string {
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(now);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(now);
  const idx: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const daysToSunday = (7 - (idx[wd] ?? 0)) % 7;
  const [y, m, d] = todayStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + daysToSunday)).toISOString().slice(0, 10);
}

export default async function ProducerDashboard() {
  const person = await getCurrentPerson();
  const firstName = person?.full_name?.trim()?.split(/\s+/)[0] ?? "there";
  const scheduleEvents = await getScheduleEvents();
  const weekEnd = endOfWeekChicagoISO();
  const thisWeek = scheduleEvents.filter((e) => e.startDate <= weekEnd);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <DashboardGreeting name={firstName} />

      <TodaySnapshot />

      <ProducerGoals />

      <EventSchedule
        events={thisWeek}
        heading="This Week's Live Trainings"
        viewAllHref="/producer/trainings/upcoming"
        emptyState={
          <section className="mt-12">
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
              <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
                This Week&apos;s Live Trainings
              </h2>
              <Link
                href="/producer/trainings/upcoming"
                className="text-sm font-medium text-accent hover:text-accent-soft"
              >
                View all upcoming live trainings →
              </Link>
            </div>
            <div className="mt-6 rounded-2xl border border-hairline bg-card px-5 py-10 text-center">
              <p className="text-sm text-subtle">No live trainings scheduled for the rest of this week.</p>
            </div>
          </section>
        }
      />

      <DashboardOverview />
    </main>
  );
}
