import { VideoLibraryPage } from "@/components/producer/VideoLibraryPage";
import { installationVideoCollectionName } from "@/lib/services/video/registry";

export default async function CaseStudiesPage() {
  return (
    <VideoLibraryPage
      libraryKey="case-studies"
      collectionName={installationVideoCollectionName("case_studies")}
      emptyNote="Case study breakdowns will show up here once they're posted."
    />
  );
}
