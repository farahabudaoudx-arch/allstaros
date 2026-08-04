import { VideoLibraryPage } from "@/components/producer/VideoLibraryPage";

export default async function CaseStudiesPage() {
  return (
    <VideoLibraryPage
      libraryKey="case-studies"
      collectionName="Case Studies"
      emptyNote="Case study breakdowns will show up here once they're posted."
    />
  );
}
