import { VideoLibraryPage } from "@/components/producer/VideoLibraryPage";

export default async function AllStarTvPage() {
  return (
    <VideoLibraryPage
      libraryKey="all-star-tv"
      collectionName="All Star TV"
      emptyNote="All Star TV episodes will show up here once they're posted."
    />
  );
}
