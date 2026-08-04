import { getCurrentPerson } from "@/lib/auth";
import { DialTracker } from "@/components/producer/DialTracker";

export default async function TrackerPage() {
  const person = await getCurrentPerson();
  const backHref = "/producer";

  return (
    // A flex column rather than the usual content block: the tracker sizes
    // itself to the screen instead of the other way round, so it needs to be
    // handed the full height to divide up.
    <main className="mx-auto flex w-full max-w-5xl flex-col px-5 py-6 md:min-h-0 md:flex-1 md:px-10 md:py-6">
      <DialTracker backHref={backHref} />
    </main>
  );
}
