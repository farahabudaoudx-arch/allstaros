import { EventSchedule } from "@/components/producer/EventSchedule";
import { getScheduleEvents } from "@/lib/producer/schedule";

export default async function UpcomingLiveTrainingsPage() {
  const events = await getScheduleEvents();
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <EventSchedule
        events={events}
        heading="Upcoming Live Trainings"
        singleColumn
        emptyState={
          <section>
            <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
              Upcoming Live Trainings
            </h2>
            <div className="mt-6 rounded-2xl border border-hairline bg-card p-10 text-center text-subtle">
              No upcoming live trainings scheduled yet. Check back soon.
            </div>
          </section>
        }
      />
    </main>
  );
}
