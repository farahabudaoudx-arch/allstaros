import { notFound, redirect } from "next/navigation";

export default function ScorecardsVisualPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  redirect("/preview/scorecards/producer");
}
