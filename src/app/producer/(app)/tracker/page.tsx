import { DialTracker } from "@/components/producer/DialTracker";

export default function TrackerPage() {
  return (
    // A flex column rather than the usual content block: the tracker sizes
    // itself to the screen instead of the other way round, so it needs to be
    // handed the full height to divide up.
    <main className="mx-auto flex w-full max-w-5xl flex-col px-5 py-6 md:min-h-0 md:flex-1 md:px-10 md:py-6">
      {/* backHref is vestigial — PageHeader no longer renders a Back control,
          since the sidebar replaced it. */}
      <DialTracker backHref="/producer" />
    </main>
  );
}
