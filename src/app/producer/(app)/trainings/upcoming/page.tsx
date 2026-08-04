import Link from "next/link";
import { EventSchedule } from "@/components/producer/EventSchedule";
import { getScheduleEvents } from "@/lib/producer/schedule";
import { PageHeader } from "@/components/producer/PageHeader";

/** The way through to the recording library. It lives on the calendar rather
 *  than in the sidebar because a missed call is what sends you looking. */
function PreviousRecordingsLink() {
  return (
    <Link
      href="/producer/trainings/live"
      className="rounded-full border border-hairline px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
    >
      Previous Live Recordings
    </Link>
  );
}

export default async function TrainingCalendarPage() {
  const events = await getScheduleEvents();
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <EventSchedule
        events={events}
        heading="Training Calendar"
        backHref="/producer"
        action={<PreviousRecordingsLink />}
        emptyState={
          <section>
            <PageHeader title="Training Calendar" backHref="/producer">
              <PreviousRecordingsLink />
            </PageHeader>
            <div className="rounded-2xl border border-hairline bg-card p-10 text-center text-subtle">
              No upcoming live trainings scheduled yet. Check back soon.
            </div>
          </section>
        }
      />
    </main>
  );
}
