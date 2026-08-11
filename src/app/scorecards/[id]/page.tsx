import { redirect } from "next/navigation";

export default async function CanonicalScorecardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/producer/scorecards/${encodeURIComponent(id)}`);
}
