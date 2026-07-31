import { EventSchedule } from "@/components/producer/EventSchedule";
import { getScheduleEvents } from "@/lib/producer/schedule";
import { PageHeader } from "@/components/producer/PageHeader";

export default async function TrainingCalendarPage() {
  const events = await getScheduleEvents();
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <EventSchedule
        events={events}
        heading="Training Calendar"
        backHref="/producer/menu/training"
        emptyState={
          <section>
            <PageHeader title="Training Calendar" backHref="/producer/menu/training" />
            <div className="rounded-2xl border border-hairline bg-card p-10 text-center text-subtle">
              No upcoming live trainings scheduled yet. Check back soon.
            </div>
          </section>
        }
      />
    </main>
  );
}
