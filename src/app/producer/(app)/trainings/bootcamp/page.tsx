import { PageHeader } from "@/components/producer/PageHeader";

/**
 * Bootcamp is locked. The menu tile is greyed out (see /producer/menu/training),
 * and this page stays as the landing spot for anyone arriving from an old link
 * or bookmark, so they get "coming soon" rather than a half-built program.
 */
export default function BootcampPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <PageHeader title="Bootcamp" backHref="/producer/menu/training" />
      <div className="rounded-2xl border border-hairline bg-card p-12 text-center">
        <p className="text-xl font-semibold tracking-[-0.02em] text-ink">Coming soon</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-subtle">
          The Bootcamp program is being built. We will open it up here as soon as
          it is ready.
        </p>
      </div>
    </main>
  );
}
