import { VideoLibraryPage } from "@/components/producer/VideoLibraryPage";
import { installationVideoCollectionName } from "@/lib/services/video/registry";

export default async function AllStarTvPage() {
  return (
    <VideoLibraryPage
      libraryKey="all-star-tv"
      collectionName={installationVideoCollectionName("agent_vlogs")}
      emptyNote="Agent vlogs will show up here once they're posted."
    />
  );
}
