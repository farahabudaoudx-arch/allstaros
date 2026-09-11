import { VideoLibraryPage } from "@/components/producer/VideoLibraryPage";

export default async function LiveDialsPage() {
  return (
    <VideoLibraryPage
      libraryKey="live-dials"
      collectionName="Live Dials"
      emptyNote="Recorded live sales calls will show up here once they're posted."
    />
  );
}
