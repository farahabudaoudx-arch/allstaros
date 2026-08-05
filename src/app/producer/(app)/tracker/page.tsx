import { DialTracker } from "@/components/producer/DialTracker";

export default function TrackerPage() {
  return (
    // An ordinary content block, same as every other page. The tracker used to
    // size itself to the screen, which broke on any short window: the cards were
    // squeezed under their own content and the rows piled on top of each other.
    <main className="mx-auto flex w-full max-w-5xl flex-col px-5 py-6 md:px-10">
      {/* backHref is vestigial — PageHeader no longer renders a Back control,
          since the sidebar replaced it. */}
      <DialTracker backHref="/producer" />
    </main>
  );
}
