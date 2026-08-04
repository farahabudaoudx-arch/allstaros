import { CoursePlatform } from "@/components/producer/CoursePlatform";
import { PageHeader } from "@/components/producer/PageHeader";
import { getProgram, type ProgramKey } from "@/lib/producer/trainings";
import {
  getLibraryContent,
  programFromDbRows,
} from "@/lib/producer/training-content";
import {
  collectionProgram,
  findBunnyCollectionId,
  isBunnyConfigured,
  listBunnyVideos,
  type BunnyApp,
} from "@/lib/bunny";

/**
 * A video library that lives in one Bunny collection — All Star TV, Live Dials,
 * Case Studies. All three sit inside the recruiting library (an old name that
 * stuck), separated by collection.
 *
 * Order of preference:
 *   1. Admin-curated rows in training_content, if any exist for this library.
 *   2. The Bunny collection, matched by name.
 *   3. An honest empty state.
 *
 * Deliberately no placeholder catalog. An empty shelf that says it's empty is
 * more use than three invented videos that look real until someone clicks one.
 */
export async function VideoLibraryPage({
  libraryKey,
  collectionName,
  app = "recruiting",
  emptyNote,
}: {
  libraryKey: ProgramKey;
  /** The collection's name in Bunny. Must match what's typed there. */
  collectionName: string;
  app?: BunnyApp;
  /** What this library will hold, so an empty page still tells you something. */
  emptyNote: string;
}) {
  const base = getProgram(libraryKey);

  const dbRows = await getLibraryContent(libraryKey);
  if (dbRows.length > 0) {
    return (
      <CoursePlatform
        program={programFromDbRows(libraryKey, dbRows)}
        fill="parent"
        backHref="/producer"
      />
    );
  }

  const collectionId = isBunnyConfigured(app)
    ? await findBunnyCollectionId(collectionName, app)
    : null;
  const videos = collectionId ? await listBunnyVideos(app, collectionId) : [];

  if (videos.length > 0) {
    return (
      <CoursePlatform
        program={collectionProgram(base, videos)}
        fill="parent"
        backHref="/producer"
      />
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <PageHeader title={base.title} />
      <div className="rounded-2xl border border-hairline bg-card p-12 text-center">
        <p className="text-xl font-semibold tracking-[-0.02em] text-ink">
          Nothing here yet
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-subtle">
          {emptyNote}
        </p>
      </div>
    </main>
  );
}
