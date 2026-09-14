import { VideoLibraryPage } from "@/components/producer/VideoLibraryPage";
import { installationVideoCollectionName } from "@/lib/services/video/registry";

export default async function LiveDialsPage() {
  return (
    <VideoLibraryPage
      libraryKey="live-dials"
      collectionName={installationVideoCollectionName("live_dials")}
      emptyNote="Recorded live sales calls will show up here once they're posted."
    />
  );
}
